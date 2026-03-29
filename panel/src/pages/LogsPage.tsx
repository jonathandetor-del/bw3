import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Download, FileText, AlertTriangle, XCircle, Filter, ChevronDown, ChevronRight, Copy, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

interface LogLine {
  id: number;
  time: string;
  level: "INFO" | "WARN" | "ERROR" | "FATAL";
  source: string;
  message: string;
  stackTrace?: string;
}

const levelColors: Record<string, string> = {
  INFO: "text-console-text",
  WARN: "text-console-warn",
  ERROR: "text-console-error",
  FATAL: "text-destructive font-bold",
};

const levelBadgeColors: Record<string, string> = {
  INFO: "bg-primary/10 text-primary border-primary/20",
  WARN: "bg-console-warn/10 text-console-warn border-console-warn/20",
  ERROR: "bg-console-error/10 text-console-error border-console-error/20",
  FATAL: "bg-destructive/10 text-destructive border-destructive/20",
};

// Parse Minecraft log lines: [HH:MM:SS LEVEL]: [Source] Message
// Also handles: [HH:MM:SS LEVEL]: Message (no source bracket)
function parseLogContent(text: string): LogLine[] {
  const lines = text.split("\n");
  const entries: LogLine[] = [];
  let id = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\s+(INFO|WARN|ERROR|FATAL)\]:\s*(.*)$/);
    if (match) {
      const [, time, level, rest] = match;
      const srcMatch = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
      const source = srcMatch ? srcMatch[1] : "Server";
      const message = srcMatch ? srcMatch[2] : rest;
      entries.push({ id: ++id, time, level: level as LogLine["level"], source, message });
    } else if (entries.length > 0 && line.startsWith("\t")) {
      // Stack trace continuation
      const last = entries[entries.length - 1];
      last.stackTrace = (last.stackTrace ? last.stackTrace + "\n" : "") + line;
    }
  }
  return entries;
}

export default function LogsPage() {
  const [selectedFile, setSelectedFile] = useState<string>("logs/latest.log");
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [expandedTraces, setExpandedTraces] = useState<Set<number>>(new Set());

  // List log files
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["log-files"],
    queryFn: () => api.listFiles("logs"),
  });

  const logFiles: { name: string; size: number; modified: string }[] = useMemo(() => {
    if (!filesData?.files) return [];
    return filesData.files
      .filter((f: any) => !f.isDir && (f.name.endsWith(".log") || f.name.endsWith(".log.gz")))
      .sort((a: any, b: any) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  }, [filesData]);

  // Read selected log file
  const { data: fileContent, isLoading: contentLoading } = useQuery({
    queryKey: ["log-content", selectedFile],
    queryFn: () => api.readFile(selectedFile),
    enabled: !!selectedFile,
  });

  const entries = useMemo(() => {
    if (!fileContent?.content) return [];
    return parseLogContent(fileContent.content);
  }, [fileContent]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchesSearch = searchQuery === "" || e.message.toLowerCase().includes(searchQuery.toLowerCase()) || e.source.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = levelFilter === "all" || e.level === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [entries, searchQuery, levelFilter]);

  const errorCount = entries.filter((e) => e.level === "ERROR" || e.level === "FATAL").length;
  const warnCount = entries.filter((e) => e.level === "WARN").length;

  const toggleTrace = (id: number) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyLogs = () => {
    const text = filteredEntries.map((e) => `[${e.time}] [${e.level}] [${e.source}] ${e.message}${e.stackTrace ? "\n" + e.stackTrace : ""}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  const downloadLogs = () => {
    const text = filteredEntries.map((e) => `[${e.time}] [${e.level}] [${e.source}] ${e.message}${e.stackTrace ? "\n" + e.stackTrace : ""}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.split("/").pop() || "server.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PanelLayout
      title="Logs & Error Tracking"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={filteredEntries.length === 0}>
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={downloadLogs} disabled={filteredEntries.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        </div>
      }
    >
      {/* Log file selector */}
      <div className="space-y-2 mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-2">Log Files</p>
        {filesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading log files...
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
            {logFiles.map((file) => (
              <button
                key={file.name}
                onClick={() => { setSelectedFile(`logs/${file.name}`); setExpandedTraces(new Set()); }}
                className={`flex-shrink-0 rounded-lg border p-3 text-left transition-colors ${
                  selectedFile === `logs/${file.name}`
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                  {file.name === "latest.log" && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">LIVE</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                  <span>{new Date(file.modified).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
            {logFiles.length === 0 && (
              <p className="text-sm text-muted-foreground">No log files found.</p>
            )}
          </div>
        )}
      </div>

      {/* Search and filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs..." className="pl-9 bg-card border-border" />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-36 bg-card border-border">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
            <SelectItem value="WARN">Warnings</SelectItem>
            <SelectItem value="ERROR">Errors</SelectItem>
            <SelectItem value="FATAL">Fatal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error summary */}
      {(errorCount > 0 || warnCount > 0) && (
        <div className="flex gap-4 mb-4">
          {errorCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-console-error/20 bg-console-error/5 px-3 py-2">
              <XCircle className="h-4 w-4 text-console-error" />
              <span className="text-sm text-console-error">{errorCount} Errors</span>
            </div>
          )}
          {warnCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-console-warn/20 bg-console-warn/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-console-warn" />
              <span className="text-sm text-console-warn">{warnCount} Warnings</span>
            </div>
          )}
        </div>
      )}

      {/* Log entries */}
      <div className="rounded-lg border border-border overflow-hidden bg-console-bg">
        <div className="max-h-[calc(100vh-22rem)] overflow-auto scrollbar-thin font-mono text-sm p-4 space-y-0.5">
          {contentLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground/40">
              {entries.length === 0 ? "No log entries found in this file" : "No log entries match your filters"}
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div key={entry.id}>
                <div
                  className={`flex gap-3 leading-6 px-2 rounded ${
                    entry.level === "ERROR" || entry.level === "FATAL"
                      ? "bg-console-error/5 hover:bg-console-error/10"
                      : entry.level === "WARN"
                      ? "bg-console-warn/5 hover:bg-console-warn/8"
                      : "hover:bg-surface-hover/30"
                  } ${entry.stackTrace ? "cursor-pointer" : ""}`}
                  onClick={() => entry.stackTrace && toggleTrace(entry.id)}
                >
                  <span className="text-muted-foreground/50 select-none shrink-0">{entry.time}</span>
                  <Badge variant="outline" className={`text-[10px] h-5 shrink-0 ${levelBadgeColors[entry.level]}`}>
                    {entry.level}
                  </Badge>
                  <span className="text-console-info shrink-0">[{entry.source}]</span>
                  <span className={levelColors[entry.level]}>{entry.message}</span>
                  {entry.stackTrace && (
                    expandedTraces.has(entry.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </div>
                {entry.stackTrace && expandedTraces.has(entry.id) && (
                  <pre className="ml-20 px-3 py-2 text-xs text-console-error/70 bg-console-error/5 rounded border-l-2 border-console-error/30 whitespace-pre-wrap mb-1">
                    {entry.stackTrace}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </PanelLayout>
  );
}
