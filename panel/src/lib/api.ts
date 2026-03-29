const API_BASE = '/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  const data = await res.json();

  if (!res.ok || data.ok === false) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }

  return data as T;
}

// Auth
export const api = {
  login: (username: string, password: string) =>
    request<{ ok: boolean }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request('/logout', { method: 'POST' }),

  checkAuth: () =>
    request<{ ok: boolean }>('/auth/check'),

  // Server info
  getInfo: () =>
    request<{
      ok: boolean; tps: string; playerCount: number; maxPlayers: number;
      memUsed: number; memTotal: number; cpuLoad: number; uptime: number;
      worldSize: number; diskUsed: number; diskTotal: number;
    }>('/info'),

  // Players
  getPlayers: () =>
    request<{ ok: boolean; players: string[] }>('/players'),

  // Commands
  sendCommand: (command: string) =>
    request<{ ok: boolean; result: string }>('/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  // Plugins
  getPlugins: () =>
    request<{ ok: boolean; plugins: { name: string; enabled: boolean }[] }>('/plugins'),

  togglePlugin: (name: string, enable: boolean) =>
    request<{ ok: boolean; result: string }>(`/plugins/${encodeURIComponent(name)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enable }),
    }),

  deletePlugin: (name: string) =>
    request<{ ok: boolean; deleted?: string }>(`/plugins/${encodeURIComponent(name)}/delete`, {
      method: 'POST',
    }),

  uploadPlugin: (name: string, data: ArrayBuffer) =>
    fetch(`${API_BASE}/plugins/upload?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    }).then(r => r.json()),

  downloadPlugin: (url: string, name?: string) =>
    request<{ ok: boolean; name: string; loaded: string }>('/plugins/download', {
      method: 'POST',
      body: JSON.stringify({ url, name }),
    }),

  downloadPluginUrl: (name: string) =>
    `${API_BASE}/plugins/${encodeURIComponent(name)}/download`,

  // Worlds
  getWorlds: () =>
    request<{ ok: boolean; worlds: { name: string; path: string; size: number }[] }>('/worlds'),

  // Settings
  getSettings: () =>
    request<{ ok: boolean; settings: Record<string, string> }>('/settings'),

  updateSettings: (settings: Record<string, string>) =>
    request<{ ok: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),

  // Server control
  restartServer: () =>
    request<{ ok: boolean; message: string }>('/server/restart', { method: 'POST' }),

  stopServer: () =>
    request<{ ok: boolean; message: string }>('/server/stop', { method: 'POST' }),

  // Files
  listFiles: (dirPath: string) =>
    request<{
      ok: boolean; path: string;
      entries: { name: string; isDir: boolean; size: number; modified: string; permissions: string }[];
    }>(`/files?path=${encodeURIComponent(dirPath)}`),

  readFile: (filePath: string) =>
    request<{ ok: boolean; content: string; size: number }>(`/files/read?path=${encodeURIComponent(filePath)}`),

  writeFile: (filePath: string, content: string) =>
    request<{ ok: boolean }>('/files/write', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),

  createDir: (dirPath: string) =>
    request<{ ok: boolean }>('/files/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    }),

  uploadFile: (dirPath: string, name: string, data: ArrayBuffer) =>
    fetch(`${API_BASE}/files/upload?path=${encodeURIComponent(dirPath)}&name=${encodeURIComponent(name)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    }).then(r => r.json()),

  deleteFile: (filePath: string) =>
    request<{ ok: boolean }>(`/files?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    }),

  renameFile: (oldPath: string, newPath: string) =>
    request<{ ok: boolean }>('/files/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    }),

  moveFile: (oldPath: string, targetDir: string) => {
    const trimmedTarget = targetDir.trim();
    const normalizedTarget = trimmedTarget === '' ? '/' : (trimmedTarget.startsWith('/') ? trimmedTarget : `/${trimmedTarget}`);
    const baseName = oldPath.split('/').filter(Boolean).pop() || '';
    const destination = normalizedTarget === '/' ? `/${baseName}` : `${normalizedTarget}/${baseName}`;
    return request<{ ok: boolean }>('/files/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath: destination }),
    });
  },

  extractFile: (filePath: string) =>
    request<{ ok: boolean; jobId: string }>('/files/extract', {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),

  downloadFileUrl: (filePath: string) =>
    `${API_BASE}/files/download?path=${encodeURIComponent(filePath)}`,

  // Jobs
  getJob: (jobId: string) =>
    request<{ ok: boolean; job: { id: string; type: string; status: string; progress: number; error: string | null } }>(`/jobs/${jobId}`),

  // Backups
  getBackups: () =>
    request<{ ok: boolean; backups: { name: string; size: number; created: string }[] }>('/backups'),

  createBackup: (label: string) =>
    request<{ ok: boolean; jobId: string; filename: string }>('/backups', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  downloadBackupUrl: (name: string) =>
    `${API_BASE}/backups/${encodeURIComponent(name)}/download`,

  restoreBackup: (name: string) =>
    request<{ ok: boolean; jobId: string }>(`/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    }),

  deleteBackup: (name: string) =>
    request<{ ok: boolean }>(`/backups/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  // Staff
  getStaff: () =>
    request<{ ok: boolean; staff: { name: string; uuid: string; level: number; source: string; group?: string }[] }>('/staff'),

  getStaffGroups: () =>
    request<{ ok: boolean; groups: string[] }>('/staff/groups'),

  setStaffOp: (player: string, action: 'op' | 'deop') =>
    request<{ ok: boolean; result: string }>('/staff/op', {
      method: 'POST',
      body: JSON.stringify({ player, action }),
    }),

  setStaffGroup: (player: string, group: string) =>
    request<{ ok: boolean; result: string }>('/staff/group', {
      method: 'POST',
      body: JSON.stringify({ player, group }),
    }),

  // Users
  getUsers: () =>
    request<{
      ok: boolean;
      users: {
        id: string;
        username: string;
        nickname: string | null;
        uuid: string;
        role: 'owner' | 'admin' | 'moderator' | 'player';
        status: 'online' | 'offline' | 'banned';
        isOpped: boolean;
        lastSeen: string;
        playtime: string;
        gamesPlayed: number;
        banReason?: string;
      }[];
    }>('/users'),

  addUser: (player: string, role: string) =>
    request<{ ok: boolean }>('/users/add', {
      method: 'POST',
      body: JSON.stringify({ player, role }),
    }),

  banUser: (player: string, reason?: string) =>
    request<{ ok: boolean; result: string }>('/users/ban', {
      method: 'POST',
      body: JSON.stringify({ player, reason }),
    }),

  unbanUser: (player: string) =>
    request<{ ok: boolean; result: string }>('/users/unban', {
      method: 'POST',
      body: JSON.stringify({ player }),
    }),

  // Action logs
  getActions: () =>
    request<{ ok: boolean; actions: { time: string; action: string; details: Record<string, unknown>; status: string }[] }>('/actions'),
};

export { ApiError };
