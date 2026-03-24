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

      // CPU gauge (load avg — cap at 100% based on 4-core assumption)
      const cpuPct = Math.min(100, Math.round((d.cpuLoad || 0) * 25));
      const cpuEl = $('#gauge-cpu');
      if (cpuEl) { cpuEl.style.width = cpuPct + '%'; }
      const cpuVal = $('#gauge-cpu-val');
      if (cpuVal) cpuVal.textContent = cpuPct + '%';

      // Disk gauge
      if (d.diskTotal > 0) {
        const diskPct = Math.round(d.diskUsed / d.diskTotal * 100);
        const diskEl = $('#gauge-disk');
        if (diskEl) diskEl.style.width = diskPct + '%';
        const diskVal = $('#gauge-disk-val');
        if (diskVal) diskVal.textContent = `${formatBytes(d.diskUsed)} / ${formatBytes(d.diskTotal)}`;
      }
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
            <button class="btn btn-sm btn-warn player-kick" data-name="${escapeHtml(name)}">Kick</button>
            <button class="btn btn-sm btn-danger player-ban" data-name="${escapeHtml(name)}">Ban</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('.player-kick').forEach(btn => {
        btn.addEventListener('click', () => window._kickPlayer(btn.dataset.name));
      });
      el.querySelectorAll('.player-ban').forEach(btn => {
        btn.addEventListener('click', () => window._banPlayer(btn.dataset.name));
      });
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
    c.innerHTML = `
      <div class="page-header"><h2>Plugins</h2></div>
      <div class="plugin-toolbar">
        <input type="text" id="plugin-search" class="plugin-search" placeholder="Search plugins...">
        <div class="plugin-toolbar-actions">
          <input type="file" id="plugin-upload-input" accept=".jar" multiple style="display:none">
          <button class="btn btn-green" id="plugin-upload-btn">&#8593; Upload Plugin</button>
        </div>
      </div>
      <div id="plugin-container" class="plugin-list"><div class="empty-state">Loading...</div></div>`;

    const searchInput = $('#plugin-search');
    const uploadInput = $('#plugin-upload-input');
    const uploadBtn = $('#plugin-upload-btn');

    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      const files = uploadInput.files;
      if (!files.length) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';
      for (const file of files) {
        try {
          const buf = await file.arrayBuffer();
          await fetch(`/api/plugins/upload?name=${encodeURIComponent(file.name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf
          });
        } catch (e) { alert('Upload failed: ' + e.message); }
      }
      uploadBtn.disabled = false;
      uploadBtn.textContent = '\u2191 Upload Plugin';
      uploadInput.value = '';
      alert('Plugin(s) uploaded and auto-loaded!');
      renderPlugins(c);
    });

    try {
      const data = await api('GET', '/api/plugins');
      const el = $('#plugin-container');
      if (!data.plugins || data.plugins.length === 0) {
        el.innerHTML = '<div class="empty-state">No plugins found</div>';
        return;
      }
      let allPlugins = data.plugins;

      function renderList(filter) {
        const filtered = filter ? allPlugins.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())) : allPlugins;
        if (filtered.length === 0) {
          el.innerHTML = '<div class="empty-state">No matching plugins</div>';
          return;
        }
        el.innerHTML = filtered.map((p) => `
          <div class="plugin-item">
            <span class="plugin-name">${escapeHtml(p.name)}</span>
            <label class="toggle">
              <input type="checkbox" ${p.enabled ? 'checked' : ''} data-plugin="${escapeHtml(p.name)}">
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
      }

      renderList('');
      searchInput.addEventListener('input', () => renderList(searchInput.value.trim()));
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
  let filePath = [];

  async function renderFiles(c) {
    const pathStr = filePath.join('/');
    c.innerHTML = `
      <div class="fm">
        <div class="fm-toolbar">
          <div class="fm-breadcrumb" id="fm-bread"></div>
          <div class="fm-search">
            <input type="text" id="fm-search-input" placeholder="Search files..." autocomplete="off">
          </div>
          <div class="fm-actions">
            <label class="btn btn-green btn-sm fm-upload-btn">&#x2B06; Upload
              <input type="file" id="fm-upload-input" multiple style="display:none">
            </label>
            <button class="btn btn-accent btn-sm" id="fm-new-folder">&#x1F4C1; New Folder</button>
            <button class="btn btn-accent btn-sm" id="fm-new-file">&#x1F4C4; New File</button>
          </div>
        </div>
        <div class="fm-table-wrap">
          <table class="fm-table">
            <thead>
              <tr>
                <th class="fm-th-name">Name</th>
                <th class="fm-th-size">Size</th>
                <th class="fm-th-mod">Modified</th>
                <th class="fm-th-perm">Permissions</th>
                <th class="fm-th-act">Actions</th>
              </tr>
            </thead>
            <tbody id="fm-body"><tr><td colspan="5" class="empty-state">Loading...</td></tr></tbody>
          </table>
        </div>
      </div>`;

    renderBreadcrumb();
    await loadDir();

    $('#fm-upload-input').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        const reader = new FileReader();
        reader.onload = async () => {
          await fetch(`/api/files/upload?path=${encodeURIComponent(pathStr)}&name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            credentials: 'same-origin',
            body: reader.result
          });
          loadDir();
        };
        reader.readAsArrayBuffer(file);
      }
    });

    $('#fm-new-folder').addEventListener('click', async () => {
      const name = prompt('Folder name:');
      if (!name) return;
      await api('POST', '/api/files/mkdir', { path: pathStr ? pathStr + '/' + name : name });
      loadDir();
    });

    $('#fm-new-file').addEventListener('click', async () => {
      const name = prompt('File name:');
      if (!name) return;
      await api('PUT', '/api/files/write', { path: pathStr ? pathStr + '/' + name : name, content: '' });
      loadDir();
    });

    $('#fm-search-input').addEventListener('input', () => {
      const q = $('#fm-search-input').value.toLowerCase();
      $$('#fm-body .fm-row').forEach(row => {
        const name = row.dataset.name.toLowerCase();
        row.style.display = name.includes(q) ? '' : 'none';
      });
    });
  }

  function renderBreadcrumb() {
    const el = $('#fm-bread');
    if (!el) return;
    let html = '<span class="fm-crumb" data-idx="-1">&#x1F3E0; server</span>';
    filePath.forEach((seg, i) => {
      html += ` <span class="fm-sep">›</span> <span class="fm-crumb" data-idx="${i}">${escapeHtml(seg)}</span>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.fm-crumb').forEach(cr => {
      cr.addEventListener('click', () => {
        const idx = parseInt(cr.dataset.idx);
        filePath = idx < 0 ? [] : filePath.slice(0, idx + 1);
        renderBreadcrumb();
        loadDir();
      });
    });
  }

  async function loadDir() {
    const pathStr = filePath.join('/');
    const tbody = $('#fm-body');
    if (!tbody) return;
    try {
      const data = await api('GET', `/api/files?path=${encodeURIComponent(pathStr)}`);
      if (!data.entries || data.entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Empty folder</td></tr>';
        return;
      }
      tbody.innerHTML = data.entries.map(e => {
        const icon = e.isDir ? '&#x1F4C1;' : getFileIcon(e.name);
        const sizeStr = e.isDir ? '&mdash;' : formatBytes(e.size);
        const modStr = e.modified ? new Date(e.modified).toLocaleString('en-GB', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '&mdash;';
        const permStr = e.permissions || '&mdash;';
        const editable = !e.isDir && isEditable(e.name);
        const fp = pathStr ? pathStr + '/' + e.name : e.name;
        return `<tr class="fm-row" data-name="${escapeHtml(e.name)}" data-dir="${e.isDir}" data-path="${escapeHtml(fp)}">
          <td class="fm-cell-name">
            <span class="fm-icon">${icon}</span>
            <span class="fm-name-text">${escapeHtml(e.name)}</span>
            ${editable ? '<span class="fm-badge">editable</span>' : ''}
          </td>
          <td>${sizeStr}</td>
          <td>${modStr}</td>
          <td class="fm-perm">${permStr}</td>
          <td class="fm-cell-actions">
            ${!e.isDir ? `<button class="fm-act-btn" data-action="download" title="Download">&#x2B07;</button>` : ''}
            ${editable ? `<button class="fm-act-btn" data-action="edit" title="Edit">&#x270E;</button>` : ''}
            <button class="fm-act-btn" data-action="rename" title="Rename">&#x270D;</button>
            ${isArchive(e.name) ? `<button class="fm-act-btn fm-act-extract" data-action="extract" title="Extract">&#x1F4E6;</button>` : ''}
            <button class="fm-act-btn fm-act-del" data-action="delete" title="Delete">&#x1F5D1;</button>
          </td>
        </tr>`;
      }).join('');

      // Click handlers
      tbody.querySelectorAll('.fm-row').forEach(row => {
        row.querySelector('.fm-cell-name').addEventListener('click', () => {
          if (row.dataset.dir === 'true') {
            filePath.push(row.dataset.name);
            renderBreadcrumb();
            loadDir();
          }
        });
        row.querySelectorAll('.fm-act-btn').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const action = btn.dataset.action;
            const fp = row.dataset.path;
            if (action === 'delete') deleteFile(fp);
            else if (action === 'download') downloadFile(fp);
            else if (action === 'edit') editFile(fp);
            else if (action === 'extract') extractFile(fp);
            else if (action === 'rename') renameFile(fp, row.dataset.name);
          });
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function isEditable(name) {
    return /\.(yml|yaml|json|properties|txt|cfg|conf|sk|toml|xml|log|md|csv|sh|bat)$/i.test(name);
  }

  function isArchive(name) {
    return /\.(zip|tar|tar\.gz|tgz|tar\.bz2|gz)$/i.test(name);
  }

  function getFileIcon(name) {
    if (/\.jar$/i.test(name)) return '<span style="color:var(--red)">&#x1F4E6;</span>';
    if (/\.(zip|tar|tar\.gz|tgz|tar\.bz2|gz)$/i.test(name)) return '<span style="color:var(--orange)">&#x1F4E6;</span>';
    if (/\.(yml|yaml|json|properties|toml|xml|cfg|conf)$/i.test(name)) return '<span style="color:var(--green)">&#x1F4C4;</span>';
    if (/\.(txt|md|log)$/i.test(name)) return '&#x1F4C3;';
    return '&#x1F4C4;';
  }

  async function renameFile(fp, oldName) {
    const newName = prompt('Rename to:', oldName);
    if (!newName || newName === oldName) return;
    const dir = fp.substring(0, fp.length - oldName.length);
    try {
      const res = await api('POST', '/api/files/rename', { oldPath: fp, newPath: dir + newName });
      if (res.ok) loadDir();
      else alert('Error: ' + (res.error || 'Unknown'));
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function extractFile(fp) {
    if (!confirm(`Extract "${fp}" to the same folder?`)) return;
    try {
      const res = await api('POST', '/api/files/extract', { path: fp });
      if (res.ok) { alert('Extracted successfully!'); loadDir(); }
      else alert('Error: ' + (res.error || 'Unknown'));
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function deleteFile(fp) {
    if (!confirm(`Delete "${fp}"?`)) return;
    await api('DELETE', `/api/files?path=${encodeURIComponent(fp)}`);
    loadDir();
  }

  function downloadFile(fp) {
    const a = document.createElement('a');
    a.href = `/api/files/download?path=${encodeURIComponent(fp)}`;
    a.download = '';
    a.click();
  }

  async function editFile(fp) {
    const c = $('#content');
    c.innerHTML = `
      <div class="fm-editor">
        <div class="fm-editor-header">
          <span class="fm-editor-path">&#x270E; ${escapeHtml(fp)}</span>
          <div>
            <button class="btn btn-accent btn-sm" id="fm-save">Save</button>
            <button class="btn btn-muted btn-sm" id="fm-back">Back</button>
          </div>
        </div>
        <textarea class="fm-editor-area" id="fm-editor-content">Loading...</textarea>
      </div>`;
    try {
      const data = await api('GET', `/api/files/read?path=${encodeURIComponent(fp)}`);
      $('#fm-editor-content').value = data.content;
    } catch (e) {
      $('#fm-editor-content').value = 'Error: ' + e.message;
    }
    $('#fm-save').addEventListener('click', async () => {
      await api('PUT', '/api/files/write', { path: fp, content: $('#fm-editor-content').value });
      alert('Saved!');
    });
    $('#fm-back').addEventListener('click', () => renderFiles($('#content')));
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
