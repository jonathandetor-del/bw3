'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Rcon = require('./rcon');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Config
const PORT = 3000;
const USERNAME = process.env.FILE_MANAGER_USERNAME || 'admin';
const PASSWORD = process.env.FILE_MANAGER_PASSWORD || 'adminadmin123';
const RCON_HOST = '127.0.0.1';
const RCON_PORT = 25575;
const RCON_PASSWORD = 'HellC0re_Rc0n2026!';
const DATA_DIR = '/data';
const LOG_FILE = path.join(DATA_DIR, 'logs', 'latest.log');

// Session store
const sessions = new Map();

function parseCookies(header) {
  const map = {};
  if (!header) return map;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) map[k] = v.join('=');
  }
  return map;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.session && sessions.has(cookies.session) ? cookies.session : null;
}

// Auth middleware
function auth(req, res, next) {
  if (getSession(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// RCON singleton with auto-reconnect
let rcon = null;
async function getRcon() {
  if (rcon && rcon.connected) return rcon;
  rcon = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
  await rcon.connect();
  return rcon;
}

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '512mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth endpoints ----

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, created: Date.now() });
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

// ---- Server info ----

app.get('/api/info', auth, async (req, res) => {
  try {
    const r = await getRcon();
    let tps = 'N/A', playerCount = 0, maxPlayers = 20;

    try {
      const tpsResp = await r.command('tps');
      const m = tpsResp.match(/[\d.]+/);
      if (m) tps = m[0];
    } catch (_) {}

    try {
      const listResp = await r.command('list');
      const m = listResp.match(/(\d+)\s+of a max of\s+(\d+)/i);
      if (m) { playerCount = parseInt(m[1]); maxPlayers = parseInt(m[2]); }
    } catch (_) {}

    // Memory from /proc
    let memUsed = 0, memTotal = 0;
    try {
      const info = fs.readFileSync('/proc/meminfo', 'utf8');
      const t = info.match(/MemTotal:\s+(\d+)/);
      const a = info.match(/MemAvailable:\s+(\d+)/);
      if (t) memTotal = parseInt(t[1]) * 1024;
      if (a) memUsed = memTotal - parseInt(a[1]) * 1024;
    } catch (_) {}

    // CPU load average
    let cpuLoad = 0;
    try {
      const load = fs.readFileSync('/proc/loadavg', 'utf8');
      cpuLoad = parseFloat(load.split(' ')[0]) || 0;
    } catch (_) {}

    // Uptime
    let uptime = 0;
    try {
      const up = fs.readFileSync('/proc/uptime', 'utf8');
      uptime = Math.floor(parseFloat(up.split(' ')[0]));
    } catch (_) {}

    // World size
    let worldSize = 0;
    try {
      const out = require('child_process').execSync(
        `du -sb ${DATA_DIR} 2>/dev/null | cut -f1`, { encoding: 'utf8', timeout: 5000 }
      );
      worldSize = parseInt(out.trim()) || 0;
    } catch (_) {}

    // Disk usage
    let diskUsed = 0, diskTotal = 0;
    try {
      const df = require('child_process').execSync(
        `df -B1 /data 2>/dev/null | tail -1`, { encoding: 'utf8', timeout: 5000 }
      );
      const parts = df.trim().split(/\s+/);
      if (parts.length >= 4) {
        diskTotal = parseInt(parts[1]) || 0;
        diskUsed = parseInt(parts[2]) || 0;
      }
    } catch (_) {}

    res.json({ tps, playerCount, maxPlayers, memUsed, memTotal, cpuLoad, uptime, worldSize, diskUsed, diskTotal });
  } catch (e) {
    res.json({ tps: 'N/A', playerCount: 0, maxPlayers: 0, memUsed: 0, memTotal: 0, cpuLoad: 0, uptime: 0, worldSize: 0, error: e.message });
  }
});

// ---- Players ----

app.get('/api/players', auth, async (req, res) => {
  try {
    const r = await getRcon();
    const resp = await r.command('list');
    const parts = resp.split(':');
    const names = parts.length > 1
      ? parts.slice(1).join(':').trim().split(',').map(n => n.trim()).filter(Boolean)
      : [];
    res.json({ players: names });
  } catch (e) {
    res.json({ players: [], error: e.message });
  }
});

// ---- Execute command ----

app.post('/api/command', auth, async (req, res) => {
  const cmd = String(req.body.command || '').trim();
  if (!cmd) return res.json({ result: '' });
  try {
    const r = await getRcon();
    const result = await r.command(cmd);
    res.json({ result });
  } catch (e) {
    res.json({ result: '', error: e.message });
  }
});

// ---- Plugins ----

app.get('/api/plugins', auth, async (req, res) => {
  try {
    const r = await getRcon();
    const resp = await r.command('plugins');
    const m = resp.match(/\(\d+\):\s*(.*)/s);
    if (m) {
      const raw = m[1].replace(/§[0-9a-fk-or]/gi, '');
      const list = raw.split(',').map(p => p.trim()).filter(Boolean).map(name => {
        return { name, enabled: true };
      });
      // Re-parse with color codes to detect disabled (§c = red)
      const rawColored = m[1];
      const colored = rawColored.split(',');
      for (let i = 0; i < colored.length && i < list.length; i++) {
        if (colored[i].includes('\u00A7c')) list[i].enabled = false;
      }
      res.json({ plugins: list });
    } else {
      res.json({ plugins: [] });
    }
  } catch (e) {
    res.json({ plugins: [], error: e.message });
  }
});

app.post('/api/plugins/:name/toggle', auth, async (req, res) => {
  const name = req.params.name;
  const action = req.body.enable ? 'enable' : 'disable';
  try {
    const r = await getRcon();
    const result = await r.command(`plugman ${action} ${name}`);
    res.json({ result });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ---- Worlds ----

app.get('/api/worlds', auth, (req, res) => {
  try {
    const worlds = [];
    for (const base of [DATA_DIR]) {
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const wpath = path.join(base, entry.name);
          if (fs.existsSync(path.join(wpath, 'level.dat'))) {
            let size = 0;
            try {
              const out = require('child_process').execSync(
                `du -sb "${wpath}" 2>/dev/null | cut -f1`, { encoding: 'utf8', timeout: 5000 }
              );
              size = parseInt(out.trim()) || 0;
            } catch (_) {}
            worlds.push({ name: entry.name, path: wpath, size });
          }
        }
      }
    }
    res.json({ worlds });
  } catch (e) {
    res.json({ worlds: [], error: e.message });
  }
});

// ---- Settings (server.properties) ----

app.get('/api/settings', auth, (req, res) => {
  try {
    const propPath = path.join(DATA_DIR, 'server.properties');
    const content = fs.readFileSync(propPath, 'utf8');
    const settings = {};
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const idx = t.indexOf('=');
        if (idx > 0) settings[t.slice(0, idx)] = t.slice(idx + 1);
      }
    }
    res.json({ settings });
  } catch (e) {
    res.json({ settings: {}, error: e.message });
  }
});

app.put('/api/settings', auth, (req, res) => {
  try {
    const propPath = path.join(DATA_DIR, 'server.properties');
    const content = fs.readFileSync(propPath, 'utf8');
    const updates = req.body.settings || {};
    const lines = content.split('\n').map(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const idx = t.indexOf('=');
        if (idx > 0) {
          const key = t.slice(0, idx);
          if (key in updates) return `${key}=${updates[key]}`;
        }
      }
      return line;
    });
    fs.writeFileSync(propPath, lines.join('\n'), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ---- Server control ----

app.post('/api/server/restart', auth, async (req, res) => {
  // Save worlds first, then kill PID 1 so the container exits non-zero.
  // Railway's ON_FAILURE restart policy will restart the container automatically.
  try {
    const r = await getRcon();
    await r.command('save-all');
  } catch (_) {}
  res.json({ ok: true, message: 'Server restarting...' });
  setTimeout(() => {
    try { require('child_process').execSync('kill 1'); } catch (_) { process.exit(1); }
  }, 2000);
});

app.post('/api/server/stop', auth, async (req, res) => {
  // RCON stop = clean exit (code 0). Railway will NOT auto-restart.
  try {
    const r = await getRcon();
    await r.command('stop');
    res.json({ ok: true, message: 'Server stopping...' });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ---- File Manager API ----

function safePath(p) {
  const resolved = path.resolve(DATA_DIR, p || '');
  if (!resolved.startsWith(DATA_DIR)) return null;
  return resolved;
}

app.get('/api/files', auth, (req, res) => {
  const dirPath = safePath(req.query.path || '/');
  if (!dirPath) return res.status(400).json({ error: 'Invalid path' });
  try {
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map(e => {
      const fp = path.join(dirPath, e.name);
      let s = { size: 0, mtime: null, mode: '' };
      try {
        const st = fs.statSync(fp);
        s.size = st.size;
        s.mtime = st.mtime;
        s.mode = '0' + (st.mode & 0o777).toString(8);
      } catch (_) {}
      return { name: e.name, isDir: e.isDirectory(), size: s.size, modified: s.mtime, permissions: s.mode };
    });
    entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
    res.json({ path: path.relative(DATA_DIR, dirPath) || '.', entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/read', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp) return res.status(400).json({ error: 'Invalid path' });
  try {
    const stat = fs.statSync(fp);
    if (stat.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large to edit (>10MB)' });
    const content = fs.readFileSync(fp, 'utf8');
    res.json({ content, size: stat.size });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/files/write', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ error: 'Invalid path' });
  try {
    fs.writeFileSync(fp, req.body.content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/mkdir', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ error: 'Invalid path' });
  try {
    fs.mkdirSync(fp, { recursive: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/upload', auth, (req, res) => {
  const dir = safePath(req.query.path || '/');
  const name = req.query.name;
  if (!dir || !name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ error: 'Invalid path or filename' });
  }
  const fp = path.join(dir, name);
  if (!fp.startsWith(DATA_DIR)) return res.status(400).json({ error: 'Invalid path' });
  try {
    fs.writeFileSync(fp, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/files', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp || fp === DATA_DIR) return res.status(400).json({ error: 'Invalid path' });
  try {
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true });
    else fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/download', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp) return res.status(400).json({ error: 'Invalid path' });
  try {
    res.download(fp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/extract', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ error: 'Invalid path' });
  const dir = path.dirname(fp);
  const base = path.basename(fp);
  const { execSync } = require('child_process');
  try {
    if (/\.zip$/i.test(base)) {
      execSync(`unzip -o "${fp}" -d "${dir}"`, { timeout: 120000 });
    } else if (/\.tar\.gz$|\.tgz$/i.test(base)) {
      execSync(`tar -xzf "${fp}" -C "${dir}"`, { timeout: 120000 });
    } else if (/\.tar\.bz2$/i.test(base)) {
      execSync(`tar -xjf "${fp}" -C "${dir}"`, { timeout: 120000 });
    } else if (/\.tar$/i.test(base)) {
      execSync(`tar -xf "${fp}" -C "${dir}"`, { timeout: 120000 });
    } else if (/\.gz$/i.test(base)) {
      execSync(`gunzip -k "${fp}"`, { timeout: 120000 });
    } else {
      return res.status(400).json({ error: 'Unsupported archive format' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- WebSocket upgrade ----

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  if (!getSession(req)) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  let tail = null;
  try {
    tail = spawn('tail', ['-n', '200', '-f', LOG_FILE]);
  } catch (_) {
    ws.send(JSON.stringify({ type: 'error', data: 'Cannot read log file' }));
    return;
  }

  tail.stdout.on('data', d => {
    const text = d.toString();
    const filtered = text.split('\n').filter(l => !l.includes('Rcon issued server command')).join('\n');
    if (filtered.trim() && ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: filtered }));
  });
  tail.stderr.on('data', d => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', data: d.toString() }));
  });

  ws.on('message', async (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'command' && parsed.data) {
        const r = await getRcon();
        const result = await r.command(String(parsed.data));
        ws.send(JSON.stringify({ type: 'response', data: result }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: e.message }));
    }
  });

  ws.on('close', () => { if (tail) tail.kill(); });
  tail.on('error', () => {});
});

// ---- Start ----

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Panel running on port ${PORT}`);
});
