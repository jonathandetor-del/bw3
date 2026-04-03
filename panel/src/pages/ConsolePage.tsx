import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Trash2, RotateCcw, Square, Download, Copy, ArrowDown, Wifi, WifiOff } from "lucide-react";
import { useConsoleSocket } from "@/hooks/useConsoleSocket";
import { api } from "@/lib/api";
import { toast } from "sonner";

const levelColors: Record<string, string> = {
  info: "text-console-text",
  warn: "text-console-warn",
  error: "text-console-error",
  system: "text-console-info",
  chat: "text-accent-foreground",
  command: "text-console-warn",
};

const levelBg: Record<string, string> = {
  chat: "bg-accent/8 border-l-2 border-l-accent/40",
  command: "bg-console-warn/5 border-l-2 border-l-console-warn/30",
  error: "bg-console-error/5",
  warn: "",
  info: "",
  system: "",
};

export default function ConsolePage() {
  const { logs, connected, sendCommand: wsSendCommand, clearLogs } = useConsoleSocket();
  const [command, setCommand] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: info } = useQuery({
    queryKey: ['server-info'],
    queryFn: api.getInfo,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (autoScroll) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setAutoScroll(true);
  };

  const handleSend = () => {
    if (!command.trim()) return;
    wsSendCommand(command.trim());
    setCommand("");
  };

  const handleRestart = async () => {
    try {
      await api.restartServer();
      toast.success("Server restarting...");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Restart failed");
    }
  };

  const handleStop = async () => {
    try {
      await api.stopServer();
      toast.success("Server stopping...");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stop failed");
    }
  };

  const copyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-${new Date().toISOString().split("T")[0]}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatMem = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);

  const serverRunning = connected && info?.tps !== 'N/A';

  return (
    <PanelLayout
      title="Console"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLogs} className="text-muted-foreground">
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={downloadLogs} className="text-muted-foreground">
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs} className="text-muted-foreground">
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestart} className="text-console-warn border-console-warn/30">
            <RotateCcw className="h-4 w-4 mr-1" /> Restart
          </Button>
          <Button variant="outline" size="sm" onClick={handleStop} className="text-destructive border-destructive/30">
            <Square className="h-4 w-4 mr-1" /> Stop
          </Button>
        </div>
      }
    >
      <div className="flex flex-col h-[calc(100vh-8rem)] rounded-lg border border-border overflow-hidden">
        {/* Server stats bar */}
        <div className="flex items-center gap-6 px-4 py-2 bg-card border-b border-border text-xs">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${serverRunning ? "bg-primary animate-pulse" : "bg-destructive"}`} />
            <span className="text-muted-foreground">{serverRunning ? "Running" : "Stopped"}</span>
          </div>
          <span className="text-muted-foreground">RAM: <span className="text-foreground">{info ? `${formatMem(info.memUsed)} / ${formatMem(info.memTotal)} GB` : '...'}</span></span>
          <span className="text-muted-foreground">TPS: <span className="text-primary">{info?.tps ?? '...'}</span></span>
          <span className="text-muted-foreground">Uptime: <span className="text-foreground">{info ? formatUptime(info.uptime) : '...'}</span></span>
          <span className="text-muted-foreground">Players: <span className="text-foreground">{info?.playerCount ?? '...'}</span></span>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground/50">
            {connected ? <Wifi className="h-3 w-3 text-primary" /> : <WifiOff className="h-3 w-3 text-destructive" />}
            <span>{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Console output */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-auto p-4 bg-console-bg font-mono text-sm scrollbar-thin"
          >
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex gap-3 leading-6 px-2 rounded-sm ${levelBg[log.level] || "hover:bg-surface-hover/30"}`}
              >
                <span className="text-muted-foreground/50 select-none shrink-0">{log.timestamp}</span>
                {log.level === "chat" && <span className="text-accent select-none shrink-0">💬</span>}
                {log.level === "command" && <span className="text-console-warn select-none shrink-0">⚡</span>}
                <span className={levelColors[log.level]}>{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-muted-foreground/40 text-center mt-20">Console cleared</div>
            )}
          </div>
          {!autoScroll && (
            <Button
              size="sm"
              className="absolute bottom-3 right-5 bg-primary/90 text-primary-foreground shadow-lg"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-4 w-4 mr-1" /> Scroll to bottom
            </Button>
          )}
        </div>

        {/* Command input */}
        <div className="flex items-center gap-2 p-3 bg-card border-t border-border">
          <span className="text-primary font-mono text-sm select-none">{">"}</span>
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a command..."
            className="flex-1 bg-transparent border-none font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0"
          />
          <Button size="sm" onClick={handleSend} className="bg-primary text-primary-foreground">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </PanelLayout>
  );
}
