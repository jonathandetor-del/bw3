import { useEffect, useRef, useState, useCallback } from 'react';

interface ConsoleMessage {
  type: 'log' | 'response' | 'error';
  data?: string;
  command?: string;
  result?: string;
  error?: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'system' | 'chat' | 'command';
  message: string;
}

function parseLevel(line: string): LogEntry['level'] {
  if (/\[WARN\b/i.test(line)) return 'warn';
  if (/\[ERROR\b|Exception|at\s+\w+\./i.test(line)) return 'error';
  if (/^<\w+>/.test(line.replace(/^\[[\d:]+\]\s*/, ''))) return 'chat';
  if (/^\[[\d:]+\]\s*\[Server\]/i.test(line) || /\[INFO\].*Starting|Done|Stopping/i.test(line)) return 'system';
  return 'info';
}

function parseTimestamp(line: string): string {
  const m = line.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
  return m ? m[1] : new Date().toLocaleTimeString('en-US', { hour12: false });
}

const MAX_LINES = 2000;
let nextId = 1;

export function useConsoleSocket() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: ConsoleMessage = JSON.parse(event.data);
        if (msg.type === 'log' && msg.data) {
          const lines = msg.data.split('\n').filter(Boolean);
          const entries: LogEntry[] = lines.map(line => ({
            id: nextId++,
            timestamp: parseTimestamp(line),
            level: parseLevel(line),
            message: line.replace(/^\[[\d:]+\]\s*/, ''),
          }));
          setLogs(prev => {
            const combined = [...prev, ...entries];
            return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
          });
        } else if (msg.type === 'response') {
          setLogs(prev => {
            const entry: LogEntry = {
              id: nextId++,
              timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
              level: 'system',
              message: `[RCON] ${msg.result || 'OK'}`,
            };
            const combined = [...prev, entry];
            return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
          });
        } else if (msg.type === 'error') {
          setLogs(prev => {
            const entry: LogEntry = {
              id: nextId++,
              timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
              level: 'error',
              message: `[RCON Error] ${msg.error || 'Unknown error'}`,
            };
            const combined = [...prev, entry];
            return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendCommand = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setLogs(prev => {
        const entry: LogEntry = {
          id: nextId++,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'command',
          message: `> ${command}`,
        };
        const combined = [...prev, entry];
        return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
      });
      wsRef.current.send(JSON.stringify({ type: 'command', command }));
    }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, sendCommand, clearLogs };
}
