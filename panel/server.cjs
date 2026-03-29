'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Rcon = require('./rcon.cjs');

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
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const PANEL_LOG = path.join(DATA_DIR, 'logs', 'panel-actions.log');

// ===========================================================
// Session persistence — survives container restarts
// ===========================================================
const SESSION_FILE = path.join(DATA_DIR, '.panel-sessions.json');
const sessions = new Map();

function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const now = Date.now();
      for (const [token, sess] of Object.entries(data)) {
        if (now - sess.created < 7 * 24 * 60 * 60 * 1000) {
          sessions.set(token, sess);
        }
      }
    }
  } catch (_) {}
}

function saveSessions() {
  try {
    const obj = {};
    for (const [token, sess] of sessions) obj[token] = sess;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj), 'utf8');
  } catch (_) {}
}

loadSessions();

// ===========================================================
// Action logger — append-only log for audit trail
// ===========================================================
function logAction(action, details, status) {
  try {
    const dir = path.dirname(PANEL_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = JSON.stringify({
      time: new Date().toISOString(),
      action,
      details,
      status
    }) + '\n';
    fs.appendFileSync(PANEL_LOG, entry);
  } catch (_) {}
}

// ===========================================================
// Job system — track long-running tasks (backups, extractions)
// ===========================================================
const jobs = new Map();

function createJob(type, details) {
  const id = crypto.randomBytes(8).toString('hex');
  const job = { id, type, status: 'running', progress: 0, details: details || '', error: null, created: Date.now() };
  jobs.set(id, job);
  // Auto-clean old jobs after 30 minutes
  setTimeout(() => jobs.delete(id), 30 * 60 * 1000);
  return job;
}

// ===========================================================
// Cookies / Auth helpers
// ===========================================================
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

function auth(req, res, next) {
  if (getSession(req)) return next();
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// ===========================================================
// RCON singleton with auto-reconnect
// ===========================================================
let rcon = null;
async function getRcon() {
  if (rcon && rcon.connected) return rcon;
  rcon = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
  await rcon.connect();
  return rcon;
}

// ===========================================================
// Middleware
// ===========================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '512mb' }));

// Serve React build (dist/) with fallback to public/
const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;
app.use(express.static(staticDir));

// ===========================================================
// Auth endpoints
// ===========================================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, created: Date.now() });
    saveSessions();
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure`);
    logAction('login', { username }, 'ok');
    return res.json({ ok: true });
  }
  logAction('login', { username: req.body.username || '?' }, 'fail');
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).session;
  if (token) { sessions.delete(token); saveSessions(); }
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ ok: !!getSession(req) });
});

// ===========================================================
// Server info
// ===========================================================

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

    let memUsed = 0, memTotal = 0;
    try {
      const info = fs.readFileSync('/proc/meminfo', 'utf8');
      const t = info.match(/MemTotal:\s+(\d+)/);
      const a = info.match(/MemAvailable:\s+(\d+)/);
      if (t) memTotal = parseInt(t[1]) * 1024;
      if (a) memUsed = memTotal - parseInt(a[1]) * 1024;
    } catch (_) {}

    let cpuLoad = 0;
    try {
      const load = fs.readFileSync('/proc/loadavg', 'utf8');
      cpuLoad = parseFloat(load.split(' ')[0]) || 0;
    } catch (_) {}

    let uptime = 0;
    try {
      const up = fs.readFileSync('/proc/uptime', 'utf8');
      uptime = Math.floor(parseFloat(up.split(' ')[0]));
    } catch (_) {}

    let worldSize = 0;
    try {
      const out = execSync(`du -sb ${DATA_DIR} 2>/dev/null | cut -f1`, { encoding: 'utf8', timeout: 5000 });
      worldSize = parseInt(out.trim()) || 0;
    } catch (_) {}

    let diskUsed = 0, diskTotal = 0;
    try {
      const df = execSync(`df -B1 /data 2>/dev/null | tail -1`, { encoding: 'utf8', timeout: 5000 });
      const parts = df.trim().split(/\s+/);
      if (parts.length >= 4) {
        diskTotal = parseInt(parts[1]) || 0;
        diskUsed = parseInt(parts[2]) || 0;
      }
    } catch (_) {}

    res.json({ ok: true, tps, playerCount, maxPlayers, memUsed, memTotal, cpuLoad, uptime, worldSize, diskUsed, diskTotal });
  } catch (e) {
    res.json({ ok: true, tps: 'N/A', playerCount: 0, maxPlayers: 0, memUsed: 0, memTotal: 0, cpuLoad: 0, uptime: 0, worldSize: 0, error: e.message });
  }
});

// ===========================================================
// Players
// ===========================================================

app.get('/api/players', auth, async (req, res) => {
  try {
    const r = await getRcon();
    const resp = await r.command('list');
    const parts = resp.split(':');
    const names = parts.length > 1
      ? parts.slice(1).join(':').trim().split(',').map(n => n.trim().replace(/\u00A7[0-9a-fk-or]/gi, '')).filter(Boolean)
      : [];
    res.json({ ok: true, players: names });
  } catch (e) {
    res.json({ ok: true, players: [], error: e.message });
  }
});

// ===========================================================
// Execute command
// ===========================================================

app.post('/api/command', auth, async (req, res) => {
  const cmd = String(req.body.command || '').trim();
  if (!cmd) return res.json({ ok: true, result: '' });
  try {
    const r = await getRcon();
    const result = await r.command(cmd);
    logAction('command', { command: cmd }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('command', { command: cmd }, 'fail');
    res.json({ ok: false, result: '', error: e.message });
  }
});

// ===========================================================
// Plugins
// ===========================================================

app.get('/api/plugins', auth, async (req, res) => {
  try {
    const r = await getRcon();
    const resp = await r.command('plugins');
    const m = resp.match(/\(\d+\):\s*(.*)/s);
    if (m) {
      const raw = m[1].replace(/§[0-9a-fk-or]/gi, '');
      const list = raw.split(',').map(p => p.trim()).filter(Boolean).map(name => ({ name, enabled: true }));
      const rawColored = m[1];
      const colored = rawColored.split(',');
      for (let i = 0; i < colored.length && i < list.length; i++) {
        if (colored[i].includes('\u00A7c')) list[i].enabled = false;
      }
      res.json({ ok: true, plugins: list });
    } else {
      res.json({ ok: true, plugins: [] });
    }
  } catch (e) {
    res.json({ ok: false, plugins: [], error: e.message });
  }
});

app.post('/api/plugins/:name/toggle', auth, async (req, res) => {
  const name = req.params.name;
  const action = req.body.enable ? 'enable' : 'disable';
  try {
    const r = await getRcon();
    const result = await r.command(`plugman ${action} ${name}`);
    logAction('plugin-toggle', { name, action }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('plugin-toggle', { name, action }, 'fail');
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/plugins/:name/delete', auth, async (req, res) => {
  const name = req.params.name;
  if (!name) return res.status(400).json({ ok: false, error: 'Missing plugin name' });
  try {
    const r = await getRcon();
    await r.command('plugman unload ' + name);
  } catch (_) {}
  const pluginsDir = path.join(DATA_DIR, 'plugins');
  try {
    const files = fs.readdirSync(pluginsDir);
    const nameLower = name.toLowerCase();
    const jar = files.find(f => {
      if (!/\.jar$/i.test(f)) return false;
      const base = f.replace(/\.jar$/i, '').toLowerCase();
      return base === nameLower || base.startsWith(nameLower + '-') || base.startsWith(nameLower + '_') || base.startsWith(nameLower + ' ');
    });
    if (jar) {
      fs.unlinkSync(path.join(pluginsDir, jar));
      logAction('plugin-delete', { name, jar }, 'ok');
      res.json({ ok: true, deleted: jar });
    } else {
      res.status(404).json({ ok: false, error: 'Plugin jar not found' });
    }
  } catch (e) {
    logAction('plugin-delete', { name }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/plugins/:name/download', auth, (req, res) => {
  const name = req.params.name;
  if (!name) return res.status(400).json({ ok: false, error: 'Missing plugin name' });

  const pluginsDir = path.join(DATA_DIR, 'plugins');
  try {
    const files = fs.readdirSync(pluginsDir);
    const nameLower = name.toLowerCase();
    const jar = files.find(f => {
      if (!/\.jar$/i.test(f)) return false;
      const base = f.replace(/\.jar$/i, '').toLowerCase();
      return base === nameLower || base.startsWith(nameLower + '-') || base.startsWith(nameLower + '_') || base.startsWith(nameLower + ' ');
    });

    if (!jar) return res.status(404).json({ ok: false, error: 'Plugin jar not found' });
    const jarPath = path.join(pluginsDir, jar);
    logAction('plugin-download-local', { name, jar }, 'ok');
    return res.download(jarPath, jar);
  } catch (e) {
    logAction('plugin-download-local', { name }, 'fail');
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/plugins/upload', auth, async (req, res) => {
  const name = req.query.name;
  if (!name || !/\.jar$/i.test(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ ok: false, error: 'Invalid plugin filename (must be .jar)' });
  }
  const pluginsDir = path.join(DATA_DIR, 'plugins');
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  const fp = path.join(pluginsDir, name);
  try {
    fs.writeFileSync(fp, req.body);
    const pluginName = name.replace(/\.jar$/i, '');
    let loadResult = '';
    try {
      const r = await getRcon();
      loadResult = await r.command(`plugman load ${pluginName}`);
    } catch (_) { loadResult = 'RCON unavailable — plugin saved but not loaded'; }
    logAction('plugin-upload', { name }, 'ok');
    res.json({ ok: true, loaded: loadResult });
  } catch (e) {
    logAction('plugin-upload', { name }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/plugins/download', auth, async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  const requestedName = String(req.body?.name || '').trim();
  if (!rawUrl) return res.status(400).json({ ok: false, error: 'Missing plugin URL' });

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return res.status(400).json({ ok: false, error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ ok: false, error: 'Only HTTP/HTTPS URLs are allowed' });
  }

  let filename = requestedName;
  if (!filename) {
    const candidate = decodeURIComponent(path.basename(parsed.pathname || ''));
    filename = candidate || 'plugin.jar';
  }
  filename = filename.replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim();
  if (!filename.toLowerCase().endsWith('.jar')) filename += '.jar';
  if (!filename || filename.includes('..')) {
    return res.status(400).json({ ok: false, error: 'Invalid plugin filename' });
  }

  const pluginsDir = path.join(DATA_DIR, 'plugins');
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  const fp = path.join(pluginsDir, filename);

  try {
    const response = await fetch(rawUrl);
    if (!response.ok) {
      return res.status(400).json({ ok: false, error: `Download failed (${response.status})` });
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      return res.status(400).json({ ok: false, error: 'Downloaded file is empty' });
    }

    fs.writeFileSync(fp, bytes);

    const pluginName = filename.replace(/\.jar$/i, '');
    let loadResult = '';
    try {
      const r = await getRcon();
      loadResult = await r.command(`plugman load ${pluginName}`);
    } catch (_) {
      loadResult = 'RCON unavailable — plugin saved but not loaded';
    }

    logAction('plugin-download', { url: rawUrl, name: filename, size: bytes.length }, 'ok');
    res.json({ ok: true, name: filename, loaded: loadResult });
  } catch (e) {
    logAction('plugin-download', { url: rawUrl, name: filename }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Worlds
// ===========================================================

app.get('/api/worlds', auth, (req, res) => {
  try {
    const worlds = [];
    if (fs.existsSync(DATA_DIR)) {
      for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const wpath = path.join(DATA_DIR, entry.name);
          if (fs.existsSync(path.join(wpath, 'level.dat'))) {
            let size = 0;
            try {
              const out = execSync(`du -sb "${wpath}" 2>/dev/null | cut -f1`, { encoding: 'utf8', timeout: 5000 });
              size = parseInt(out.trim()) || 0;
            } catch (_) {}
            worlds.push({ name: entry.name, path: wpath, size });
          }
        }
      }
    }
    res.json({ ok: true, worlds });
  } catch (e) {
    res.json({ ok: false, worlds: [], error: e.message });
  }
});

// ===========================================================
// Settings (server.properties)
// ===========================================================

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
    res.json({ ok: true, settings });
  } catch (e) {
    res.json({ ok: false, settings: {}, error: e.message });
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
    logAction('settings-update', { keys: Object.keys(updates) }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    logAction('settings-update', {}, 'fail');
    res.json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Server control
// ===========================================================

app.post('/api/server/restart', auth, async (req, res) => {
  try {
    const r = await getRcon();
    await r.command('save-all');
  } catch (_) {}
  logAction('server-restart', {}, 'ok');
  res.json({ ok: true, message: 'Server restarting...' });
  setTimeout(() => {
    try { execSync('kill 1'); } catch (_) { process.exit(1); }
  }, 2000);
});

app.post('/api/server/stop', auth, async (req, res) => {
  try {
    const r = await getRcon();
    await r.command('stop');
    logAction('server-stop', {}, 'ok');
    res.json({ ok: true, message: 'Server stopping...' });
  } catch (e) {
    logAction('server-stop', {}, 'fail');
    res.json({ ok: false, error: e.message });
  }
});

// ===========================================================
// File Manager API — reads/writes to /data, NEVER clears data
// ===========================================================

function safePath(p) {
  // Strip leading slashes so path.resolve treats it as relative to DATA_DIR
  const clean = (p || '').replace(/^\/+/, '');
  const resolved = path.resolve(DATA_DIR, clean);
  if (!resolved.startsWith(DATA_DIR)) return null;
  return resolved;
}

app.get('/api/files', auth, (req, res) => {
  const dirPath = safePath(req.query.path || '');
  if (!dirPath) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    if (!fs.existsSync(dirPath)) return res.status(404).json({ ok: false, error: 'Not found' });
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ ok: false, error: 'Not a directory' });
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
    res.json({ ok: true, path: path.relative(DATA_DIR, dirPath) || '.', entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/files/read', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    const stat = fs.statSync(fp);
    if (stat.size > 10 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'File too large to edit (>10MB)' });
    const content = fs.readFileSync(fp, 'utf8');
    res.json({ ok: true, content, size: stat.size });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/files/write', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    fs.writeFileSync(fp, req.body.content, 'utf8');
    logAction('file-write', { path: req.body.path }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    logAction('file-write', { path: req.body.path }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/mkdir', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    fs.mkdirSync(fp, { recursive: true });
    logAction('file-mkdir', { path: req.body.path }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/upload', auth, (req, res) => {
  const dir = safePath(req.query.path || '/');
  const name = req.query.name;
  if (!dir || !name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ ok: false, error: 'Invalid path or filename' });
  }
  const fp = path.join(dir, name);
  if (!fp.startsWith(DATA_DIR)) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    fs.writeFileSync(fp, req.body);
    logAction('file-upload', { path: req.query.path, name }, 'ok');
    res.json({ ok: true, size: req.body.length });
  } catch (e) {
    logAction('file-upload', { path: req.query.path, name }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/files', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp || fp === DATA_DIR) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true });
    else fs.unlinkSync(fp);
    logAction('file-delete', { path: req.query.path }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    logAction('file-delete', { path: req.query.path }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/files/download', auth, (req, res) => {
  const fp = safePath(req.query.path);
  if (!fp) return res.status(400).json({ ok: false, error: 'Invalid path' });
  try {
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      const dirName = path.basename(fp);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${dirName}.tar.gz"`);
      const tar = spawn('tar', ['-czf', '-', '-C', path.dirname(fp), dirName]);
      tar.stdout.pipe(res);
      tar.stderr.on('data', () => {});
      tar.on('error', (err) => {
        if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
      });
      tar.on('close', (code) => {
        if (code !== 0 && !res.headersSent) res.status(500).end();
      });
    } else {
      res.download(fp);
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/rename', auth, (req, res) => {
  const oldP = safePath(req.body.oldPath);
  const newP = safePath(req.body.newPath);
  if (!oldP || !newP || oldP === DATA_DIR || newP === DATA_DIR) {
    return res.status(400).json({ ok: false, error: 'Invalid path' });
  }
  try {
    fs.renameSync(oldP, newP);
    logAction('file-rename', { from: req.body.oldPath, to: req.body.newPath }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Extract — async via job system for large archives
app.post('/api/files/extract', auth, (req, res) => {
  const fp = safePath(req.body.path);
  if (!fp) return res.status(400).json({ ok: false, error: 'Invalid path' });
  if (!fs.existsSync(fp)) return res.status(404).json({ ok: false, error: 'File not found' });

  const dir = path.dirname(fp);
  const base = path.basename(fp);
  const job = createJob('extract', base);

  res.json({ ok: true, jobId: job.id });

  // Run extraction in background
  setImmediate(() => {
    try {
      let cmd;
      if (/\.zip$/i.test(base)) {
        cmd = `unzip -o "${fp}" -d "${dir}"`;
      } else if (/\.tar\.gz$|\.tgz$/i.test(base)) {
        cmd = `tar -xzf "${fp}" -C "${dir}"`;
      } else if (/\.tar\.bz2$/i.test(base)) {
        cmd = `tar -xjf "${fp}" -C "${dir}"`;
      } else if (/\.tar$/i.test(base)) {
        cmd = `tar -xf "${fp}" -C "${dir}"`;
      } else if (/\.gz$/i.test(base)) {
        cmd = `gunzip -k "${fp}"`;
      } else if (/\.rar$/i.test(base)) {
        cmd = `bsdtar xf "${fp}" -C "${dir}"`;
      } else {
        job.status = 'error';
        job.error = 'Unsupported archive format';
        logAction('file-extract', { path: req.body.path }, 'fail');
        return;
      }
      execSync(cmd, { timeout: 300000 });
      job.status = 'done';
      job.progress = 100;
      logAction('file-extract', { path: req.body.path }, 'ok');
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      logAction('file-extract', { path: req.body.path }, 'fail');
    }
  });
});

// ===========================================================
// Jobs API — poll long-running task status
// ===========================================================

app.get('/api/jobs/:id', auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  res.json({ ok: true, job });
});

// ===========================================================
// Backups API — create/list/download/restore/delete backups
// ===========================================================

app.get('/api/backups', auth, (req, res) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.tar.gz'));
    const backups = files.map(f => {
      const fp = path.join(BACKUPS_DIR, f);
      const st = fs.statSync(fp);
      return { name: f, size: st.size, created: st.mtime };
    });
    backups.sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ ok: true, backups });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/backups', auth, (req, res) => {
  const label = String(req.body.label || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'backup';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${label}_${timestamp}.tar.gz`;
  const job = createJob('backup', filename);

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  res.json({ ok: true, jobId: job.id, filename });

  // Run backup in background — backs up plugins, configs, worlds
  setImmediate(() => {
    const outPath = path.join(BACKUPS_DIR, filename);
    // Include key directories that exist
    const includes = ['plugins', 'server.properties', 'bukkit.yml', 'spigot.yml', 'paper.yml', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'];
    // Also include world directories (folders with level.dat)
    try {
      for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && fs.existsSync(path.join(DATA_DIR, entry.name, 'level.dat'))) {
          includes.push(entry.name);
        }
      }
    } catch (_) {}

    const existing = includes.filter(f => fs.existsSync(path.join(DATA_DIR, f)));
    if (existing.length === 0) {
      job.status = 'error';
      job.error = 'Nothing to back up';
      return;
    }

    try {
      const args = ['-czf', outPath, '-C', DATA_DIR, ...existing];
      execSync(`tar ${args.map(a => `"${a}"`).join(' ')}`, { timeout: 600000 });
      job.status = 'done';
      job.progress = 100;
      logAction('backup-create', { filename }, 'ok');
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      logAction('backup-create', { filename }, 'fail');
      // Clean up partial file
      try { fs.unlinkSync(outPath); } catch (_) {}
    }
  });
});

app.get('/api/backups/:name/download', auth, (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid name' });
  }
  const fp = path.join(BACKUPS_DIR, name);
  if (!fp.startsWith(BACKUPS_DIR) || !fs.existsSync(fp)) {
    return res.status(404).json({ ok: false, error: 'Backup not found' });
  }
  res.download(fp);
});

app.post('/api/backups/:name/restore', auth, (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid name' });
  }
  const fp = path.join(BACKUPS_DIR, name);
  if (!fp.startsWith(BACKUPS_DIR) || !fs.existsSync(fp)) {
    return res.status(404).json({ ok: false, error: 'Backup not found' });
  }
  const job = createJob('restore', name);
  res.json({ ok: true, jobId: job.id });

  setImmediate(() => {
    try {
      execSync(`tar -xzf "${fp}" -C "${DATA_DIR}"`, { timeout: 600000 });
      job.status = 'done';
      job.progress = 100;
      logAction('backup-restore', { name }, 'ok');
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
      logAction('backup-restore', { name }, 'fail');
    }
  });
});

app.delete('/api/backups/:name', auth, (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid name' });
  }
  const fp = path.join(BACKUPS_DIR, name);
  if (!fp.startsWith(BACKUPS_DIR) || !fs.existsSync(fp)) {
    return res.status(404).json({ ok: false, error: 'Backup not found' });
  }
  try {
    fs.unlinkSync(fp);
    logAction('backup-delete', { name }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Staff API — ops.json + LuckPerms groups via RCON
// ===========================================================

app.get('/api/staff', auth, async (req, res) => {
  const staff = [];
  // Read ops.json
  try {
    const opsPath = path.join(DATA_DIR, 'ops.json');
    if (fs.existsSync(opsPath)) {
      const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
      for (const op of ops) {
        staff.push({ name: op.name, uuid: op.uuid, level: op.level, source: 'ops' });
      }
    }
  } catch (_) {}
  // Try LuckPerms via RCON
  try {
    const r = await getRcon();
    // Get groups from LuckPerms
    for (const s of staff) {
      try {
        const resp = await r.command(`lp user ${s.name} info`);
        const groupMatch = resp.match(/Primary Group:\s*(\S+)/i);
        if (groupMatch) s.group = groupMatch[1];
      } catch (_) {}
    }
  } catch (_) {}
  res.json({ ok: true, staff });
});

app.get('/api/staff/groups', auth, async (req, res) => {
  try {
    const r = await getRcon();
    const resp = await r.command('lp listgroups');
    // Parse group names from LuckPerms output
    const groups = [];
    const lines = resp.replace(/§[0-9a-fk-or]/gi, '').split('\n');
    for (const line of lines) {
      const m = line.match(/- (\S+)/);
      if (m) groups.push(m[1]);
    }
    res.json({ ok: true, groups });
  } catch (e) {
    res.json({ ok: false, groups: [], error: e.message });
  }
});

app.post('/api/staff/op', auth, async (req, res) => {
  const { player, action } = req.body;
  if (!player || !['op', 'deop'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'Invalid request' });
  }
  try {
    const r = await getRcon();
    const result = await r.command(`${action} ${player}`);
    logAction('staff-op', { player, action }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('staff-op', { player, action }, 'fail');
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/staff/group', auth, async (req, res) => {
  const { player, group } = req.body;
  if (!player || !group) {
    return res.status(400).json({ ok: false, error: 'Missing player or group' });
  }
  try {
    const r = await getRcon();
    const result = await r.command(`lp user ${player} parent set ${group}`);
    logAction('staff-group', { player, group }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('staff-group', { player, group }, 'fail');
    res.json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Users API — real data from server files + RCON
// ===========================================================

app.get('/api/users', auth, async (req, res) => {
  const usersMap = new Map();
  const upsert = (name, patch) => {
    if (!name) return;
    const key = String(name).toLowerCase();
    const existing = usersMap.get(key) || {
      id: key,
      username: name,
      nickname: null,
      uuid: '',
      role: 'player',
      status: 'offline',
      isOpped: false,
      lastSeen: 'Unknown',
      playtime: '-',
      gamesPlayed: 0,
      banReason: undefined,
    };
    usersMap.set(key, { ...existing, ...patch, username: existing.username || name });
  };

  try {
    const userCachePath = path.join(DATA_DIR, 'usercache.json');
    if (fs.existsSync(userCachePath)) {
      const cache = JSON.parse(fs.readFileSync(userCachePath, 'utf8'));
      if (Array.isArray(cache)) {
        for (const u of cache) {
          if (!u?.name) continue;
          upsert(u.name, {
            id: u.uuid || String(u.name).toLowerCase(),
            uuid: u.uuid || '',
          });
        }
      }
    }
  } catch (_) {}

  try {
    const whitelistPath = path.join(DATA_DIR, 'whitelist.json');
    if (fs.existsSync(whitelistPath)) {
      const wl = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
      if (Array.isArray(wl)) {
        for (const u of wl) {
          if (!u?.name) continue;
          upsert(u.name, { uuid: u.uuid || '' });
        }
      }
    }
  } catch (_) {}

  try {
    const opsPath = path.join(DATA_DIR, 'ops.json');
    if (fs.existsSync(opsPath)) {
      const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
      if (Array.isArray(ops)) {
        for (const op of ops) {
          if (!op?.name) continue;
          upsert(op.name, {
            uuid: op.uuid || '',
            isOpped: true,
            role: op.level >= 4 ? 'admin' : 'moderator',
          });
        }
      }
    }
  } catch (_) {}

  try {
    const bannedPath = path.join(DATA_DIR, 'banned-players.json');
    if (fs.existsSync(bannedPath)) {
      const banned = JSON.parse(fs.readFileSync(bannedPath, 'utf8'));
      if (Array.isArray(banned)) {
        for (const b of banned) {
          if (!b?.name) continue;
          upsert(b.name, {
            uuid: b.uuid || '',
            status: 'banned',
            banReason: b.reason || 'Banned',
            lastSeen: b.created || 'Unknown',
          });
        }
      }
    }
  } catch (_) {}

  try {
    const r = await getRcon();
    const listResp = await r.command('list');
    const parts = listResp.split(':');
    const onlineNames = parts.length > 1
      ? parts.slice(1).join(':').trim().split(',').map(n => n.trim().replace(/\u00A7[0-9a-fk-or]/gi, '')).filter(Boolean)
      : [];
    for (const n of onlineNames) {
      upsert(n, { status: 'online', lastSeen: 'Now' });
    }
  } catch (_) {}

  const users = Array.from(usersMap.values()).sort((a, b) => a.username.localeCompare(b.username));
  res.json({ ok: true, users });
});

app.post('/api/users/add', auth, async (req, res) => {
  const player = String(req.body?.player || '').trim();
  const role = String(req.body?.role || 'player').trim().toLowerCase();
  if (!player) return res.status(400).json({ ok: false, error: 'Missing player' });

  try {
    const r = await getRcon();
    await r.command(`whitelist add ${player}`);

    if (role !== 'player') {
      await r.command(`op ${player}`);
      const lpRole = role === 'moderator' ? 'mod' : role;
      try { await r.command(`lp user ${player} parent set ${lpRole}`); } catch (_) {}
    }

    logAction('user-add', { player, role }, 'ok');
    res.json({ ok: true });
  } catch (e) {
    logAction('user-add', { player, role }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/users/ban', auth, async (req, res) => {
  const player = String(req.body?.player || '').trim();
  const reason = String(req.body?.reason || 'Banned by admin').trim();
  if (!player) return res.status(400).json({ ok: false, error: 'Missing player' });
  try {
    const r = await getRcon();
    const result = await r.command(`ban ${player} ${reason}`);
    logAction('user-ban', { player, reason }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('user-ban', { player, reason }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/users/unban', auth, async (req, res) => {
  const player = String(req.body?.player || '').trim();
  if (!player) return res.status(400).json({ ok: false, error: 'Missing player' });
  try {
    const r = await getRcon();
    const result = await r.command(`pardon ${player}`);
    logAction('user-unban', { player }, 'ok');
    res.json({ ok: true, result });
  } catch (e) {
    logAction('user-unban', { player }, 'fail');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Action logs API
// ===========================================================

app.get('/api/actions', auth, (req, res) => {
  try {
    if (!fs.existsSync(PANEL_LOG)) return res.json({ ok: true, actions: [] });
    const content = fs.readFileSync(PANEL_LOG, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const last200 = lines.slice(-200);
    const actions = [];
    for (const line of last200) {
      try { actions.push(JSON.parse(line)); } catch (_) {}
    }
    actions.reverse();
    res.json({ ok: true, actions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===========================================================
// Centralized error handler — catches unhandled route errors
// ===========================================================

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  logAction('error', { path: req.path, error: err.message }, 'fail');
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ===========================================================
// SPA fallback — serve React index.html for all non-API routes
// ===========================================================

app.get('*', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Panel not built. Run: cd panel && npm run build');
  }
});

// ===========================================================
// WebSocket — console log streaming + RCON command execution
// ===========================================================

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    const token = parseCookies(req.headers.cookie).session;
    if (!token || !sessions.has(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', ws => {
  let tail = null;

  // Start tailing latest.log
  const startTail = () => {
    try {
      tail = spawn('tail', ['-n', '200', '-f', LOG_FILE]);
      tail.stdout.on('data', chunk => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: chunk.toString() }));
      });
      tail.stderr.on('data', () => {});
      tail.on('error', () => {});
      tail.on('close', () => { tail = null; });
    } catch (_) {}
  };

  startTail();

  ws.on('message', async msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'command' && data.command) {
        const cmd = String(data.command).trim();
        try {
          const r = await getRcon();
          const result = await r.command(cmd);
          ws.send(JSON.stringify({ type: 'response', command: cmd, result }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', command: cmd, error: e.message }));
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    if (tail) { tail.kill(); tail = null; }
  });
});

// ===========================================================
// Crash protection — keep the panel alive
// ===========================================================

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  logAction('crash', { error: err.message, stack: err.stack }, 'recovered');
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('Unhandled rejection:', msg);
  logAction('crash', { error: msg }, 'recovered');
});

// ===========================================================
// Start server
// ===========================================================

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Panel running on port ${PORT} — serving from ${staticDir}`);
});
