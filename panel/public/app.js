/* ============================================
   BedWars Panel — Client SPA
   ============================================ */
(function () {
  'use strict';

  // --- State ---
  let ws = null;
  let logFilter = 'ALL';
  const cmdHistory = [];
  let cmdIdx = -1;
  let infoTimer = null;

  // --- Helpers ---
  async function api(method, url, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401) { showLogin(); throw new Error('Unauthorized'); }
    return res.json();
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function formatUptime(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Auth ---
  function showLogin() {
    $('#login-screen').style.display = '';
    $('#panel').style.display = 'none';
    stopInfo();
    if (ws) { ws.close(); ws = null; }
  }

  function showPanel() {
    $('#login-screen').style.display = 'none';
    $('#panel').style.display = '';
    startInfo();
    navigate(location.hash || '#console');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('#login-user').value;
    const pass = $('#login-pass').value;
    try {
      const data = await api('POST', '/api/login', { username: user, password: pass });
      if (data.ok) showPanel();
      else $('#login-error').textContent = data.error || 'Login failed';
    } catch (err) {
      $('#login-error').textContent = err.message || 'Login failed';
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    await api('POST', '/api/logout');
    showLogin();
  });

  // --- Navigation ---
  function navigate(hash) {
    const page = hash.replace('#', '') || 'console';
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    renderPage(page);
  }

  window.addEventListener('hashchange', () => navigate(location.hash));
  $$('.nav-item').forEach(a => a.addEventListener('click', () => navigate(a.getAttribute('href'))));

  // --- Server Info Polling ---
  function startInfo() {
    fetchInfo();
    infoTimer = setInterval(fetchInfo, 5000);
  }
  function stopInfo() {
    if (infoTimer) { clearInterval(infoTimer); infoTimer = null; }
  }

  async function fetchInfo() {
    try {
      const d = await api('GET', '/api/info');
      $('#server-status').textContent = d.error && !d.tps ? 'Offline' : 'Online';
      $('#server-status').className = 'status-badge ' + (d.error && !d.tps ? 'offline' : 'online');
      $('#info-status').textContent = d.error && !d.tps ? 'Offline' : 'Online';
      $('#info-status').className = d.error && !d.tps ? 'text-red' : 'text-green';
      $('#info-tps').textContent = d.tps || 'N/A';
      const tpsVal = parseFloat(d.tps);
      $('#info-tps').className = tpsVal >= 19 ? 'text-green' : tpsVal >= 15 ? 'text-yellow' : 'text-red';
      $('#info-players').textContent = `${d.playerCount || 0} / ${d.maxPlayers || 0}`;
      $('#info-ram').textContent = d.memTotal ? `${formatBytes(d.memUsed)} / ${formatBytes(d.memTotal)}` : 'N/A';
      $('#info-cpu').textContent = d.cpuLoad !== undefined ? d.cpuLoad.toFixed(2) : 'N/A';
      $('#info-uptime').textContent = d.uptime ? formatUptime(d.uptime) : 'N/A';
      $('#info-world').textContent = d.worldSize ? formatBytes(d.worldSize) : 'N/A';
    } catch (_) {}

    // Quick player list
    try {
      const p = await api('GET', '/api/players');
      const el = $('#info-player-list');
      if (p.players && p.players.length > 0) {
        el.innerHTML = p.players.map(n => `<div>${escapeHtml(n)}</div>`).join('');
      } else {
        el.innerHTML = '<span class="text-muted">No players online</span>';
      }
    } catch (_) {}
  }

  // --- Server Controls ---
  $('#btn-restart').addEventListener('click', async () => {
    if (!confirm('Restart the server?')) return;
    await api('POST', '/api/server/restart');
  });

  $('#btn-stop').addEventListener('click', async () => {
    if (!confirm('Stop the server? You will need Railway to restart it.')) return;
    await api('POST', '/api/server/stop');
  });

  // --- Page Rendering ---
  function renderPage(page) {
    const c = $('#content');
    switch (page) {
      case 'console': return renderConsole(c);
      case 'players': return renderPlayers(c);
      case 'plugins': return renderPlugins(c);
      case 'worlds': return renderWorlds(c);
      case 'settings': return renderSettings(c);
      case 'files': return renderFiles(c);
      default: c.innerHTML = '<div class="empty-state">Page not found</div>';
    }
  }

  // --- Console ---
  function renderConsole(c) {
    c.innerHTML = `
      <div class="console-wrap">
        <div class="console-filters">
          <button class="filter-btn active" data-filter="ALL">All</button>
          <button class="filter-btn" data-filter="INFO">Info</button>
          <button class="filter-btn" data-filter="WARN">Warn</button>
          <button class="filter-btn" data-filter="ERROR">Error</button>
        </div>
        <div class="console-log" id="console-log"></div>
        <div class="console-input-wrap">
          <input class="console-input" id="console-input" placeholder="Enter command..." autocomplete="off">
          <button class="btn btn-accent" id="console-send">Send</button>
        </div>
      </div>`;

    const log = $('#console-log');
    const input = $('#console-input');

    // Filters
    $$('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        logFilter = btn.dataset.filter;
        $$('.log-line', log).forEach(applyFilter);
      });
    });

    // WebSocket
    connectWs(log);

    // Command send
    function sendCmd() {
      const cmd = input.value.trim();
      if (!cmd) return;
      cmdHistory.unshift(cmd);
      cmdIdx = -1;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'command', data: cmd }));
        appendLog(log, `> ${cmd}`, 'log-response');
      }
      input.value = '';
    }

    $('#console-send').addEventListener('click', sendCmd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendCmd();
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdIdx = Math.min(cmdIdx + 1, cmdHistory.length - 1); input.value = cmdHistory[cmdIdx] || ''; }
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIdx = Math.max(cmdIdx - 1, -1); input.value = cmdIdx >= 0 ? cmdHistory[cmdIdx] : ''; }
    });
  }

  function connectWs(logEl) {
    if (ws) ws.close();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'log') {
          const lines = msg.data.split('\n');
          for (const line of lines) {
            if (line.trim()) appendLog(logEl, line, classifyLog(line));
          }
        } else if (msg.type === 'response') {
          appendLog(logEl, `[RCON] ${msg.data}`, 'log-response');
        } else if (msg.type === 'error') {
          appendLog(logEl, `[ERROR] ${msg.data}`, 'log-error');
        }
      } catch (_) {}
    };
    ws.onclose = () => { setTimeout(() => { if ($('#console-log')) connectWs($('#console-log')); }, 3000); };
  }

  function appendLog(el, text, cls) {
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'log-line ' + (cls || '');
    div.textContent = text;
    applyFilter(div);
    el.appendChild(div);
    if (el.children.length > 2000) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function classifyLog(line) {
    if (/\bWARN/i.test(line)) return 'log-warn';
    if (/\bERROR|SEVERE|FATAL/i.test(line)) return 'log-error';
    return 'log-info';
  }

  function applyFilter(el) {
    if (logFilter === 'ALL') { el.style.display = ''; return; }
    const map = { INFO: 'log-info', WARN: 'log-warn', ERROR: 'log-error' };
    el.style.display = el.classList.contains(map[logFilter]) ? '' : 'none';
  }

  // --- Players ---
  async function renderPlayers(c) {
    c.innerHTML = '<div class="page-header"><h2>Players</h2></div><div id="player-container" class="player-list"><div class="empty-state">Loading...</div></div>';
    try {
      const data = await api('GET', '/api/players');
      const el = $('#player-container');
      if (!data.players || data.players.length === 0) {
        el.innerHTML = '<div class="empty-state">No players online</div>';
        return;
      }
      el.innerHTML = data.players.map(name => `
        <div class="player-card">
          <div class="player-info">
            <img class="player-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/36" alt="">
            <span class="player-name">${escapeHtml(name)}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-sm btn-warn" onclick="window._kickPlayer('${escapeHtml(name)}')">Kick</button>
            <button class="btn btn-sm btn-danger" onclick="window._banPlayer('${escapeHtml(name)}')">Ban</button>
          </div>
        </div>`).join('');
    } catch (e) {
      $('#player-container').innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  window._kickPlayer = async (name) => {
    if (!confirm(`Kick ${name}?`)) return;
    await api('POST', '/api/command', { command: `kick ${name}` });
    navigate('#players');
  };
  window._banPlayer = async (name) => {
    if (!confirm(`Ban ${name}?`)) return;
    await api('POST', '/api/command', { command: `ban ${name}` });
    navigate('#players');
  };

  // --- Plugins ---
  async function renderPlugins(c) {
    c.innerHTML = '<div class="page-header"><h2>Plugins</h2></div><div id="plugin-container" class="plugin-list"><div class="empty-state">Loading...</div></div>';
    try {
      const data = await api('GET', '/api/plugins');
      const el = $('#plugin-container');
      if (!data.plugins || data.plugins.length === 0) {
        el.innerHTML = '<div class="empty-state">No plugins found</div>';
        return;
      }
      el.innerHTML = data.plugins.map((p, i) => `
        <div class="plugin-item">
          <span class="plugin-name">${escapeHtml(p.name)}</span>
          <label class="toggle">
            <input type="checkbox" ${p.enabled ? 'checked' : ''} data-plugin="${escapeHtml(p.name)}" data-idx="${i}">
            <span class="toggle-slider"></span>
          </label>
        </div>`).join('');
      $$('.toggle input', el).forEach(inp => {
        inp.addEventListener('change', async () => {
          const name = inp.dataset.plugin;
          const enable = inp.checked;
          await api('POST', `/api/plugins/${encodeURIComponent(name)}/toggle`, { enable });
        });
      });
    } catch (e) {
      $('#plugin-container').innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // --- Worlds ---
  async function renderWorlds(c) {
    c.innerHTML = '<div class="page-header"><h2>Worlds</h2></div><div id="world-container" class="world-list"><div class="empty-state">Loading...</div></div>';
    try {
      const data = await api('GET', '/api/worlds');
      const el = $('#world-container');
      if (!data.worlds || data.worlds.length === 0) {
        el.innerHTML = '<div class="empty-state">No worlds found</div>';
        return;
      }
      el.innerHTML = data.worlds.map(w => `
        <div class="world-item">
          <span class="world-name">${escapeHtml(w.name)}</span>
          <span class="world-size">${formatBytes(w.size || 0)}</span>
        </div>`).join('');
    } catch (e) {
      $('#world-container').innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // --- Settings ---
  async function renderSettings(c) {
    c.innerHTML = '<div class="page-header"><h2>Server Settings</h2><button class="btn btn-accent" id="save-settings">Save</button></div><div id="settings-container" class="settings-form"><div class="empty-state">Loading...</div></div>';
    try {
      const data = await api('GET', '/api/settings');
      const el = $('#settings-container');
      const keys = Object.keys(data.settings || {}).sort();
      if (keys.length === 0) { el.innerHTML = '<div class="empty-state">No settings found</div>'; return; }
      el.innerHTML = keys.map(k => `
        <div class="setting-row">
          <span class="setting-key">${escapeHtml(k)}</span>
          <input class="setting-val" data-key="${escapeHtml(k)}" value="${escapeHtml(data.settings[k])}">
        </div>`).join('');

      $('#save-settings').addEventListener('click', async () => {
        const settings = {};
        $$('.setting-val', el).forEach(inp => { settings[inp.dataset.key] = inp.value; });
        const res = await api('PUT', '/api/settings', { settings });
        alert(res.ok ? 'Settings saved! Restart the server to apply changes.' : 'Error: ' + (res.error || 'Unknown'));
      });
    } catch (e) {
      $('#settings-container').innerHTML = `<div class="empty-state">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // --- Files ---
  function renderFiles(c) {
    c.innerHTML = '<iframe class="files-frame" src="/files/"></iframe>';
  }

  // --- Init: check if already authed ---
  (async function init() {
    try {
      const data = await api('GET', '/api/info');
      if (!data.error || data.tps) showPanel();
      else showLogin();
    } catch (_) {
      showLogin();
    }
  })();

})();
