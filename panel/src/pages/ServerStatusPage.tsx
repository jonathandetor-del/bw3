import { useQuery } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Progress } from "@/components/ui/progress";
import { Activity, Cpu, HardDrive, MemoryStick, Users, Clock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMB(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return Math.round(mb) + " MB";
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

export default function ServerStatusPage() {
  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ["server-info"],
    queryFn: api.getInfo,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  const { data: actionsData, isLoading: actionsLoading } = useQuery({
    queryKey: ["actions"],
    queryFn: api.getActions,
    refetchInterval: 10000,
  });

  const actions = actionsData?.actions?.slice(0, 10) ?? [];

  if (infoLoading) {
    return (
      <PanelLayout title="Server Status">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PanelLayout>
    );
  }

  const tps = parseFloat(info?.tps ?? "0");
  const memUsed = info?.memUsed ?? 0;
  const memTotal = info?.memTotal ?? 1;
  const cpuLoad = info?.cpuLoad ?? 0;
  const diskUsed = info?.diskUsed ?? 0;
  const diskTotal = info?.diskTotal ?? 1;
  const playerCount = info?.playerCount ?? 0;
  const maxPlayers = info?.maxPlayers ?? 0;
  const uptime = info?.uptime ?? 0;

  const gameStats = [
    { label: "Players Online", value: `${playerCount} / ${maxPlayers}`, icon: Users },
    { label: "TPS", value: tps.toFixed(1), icon: Activity },
    { label: "Uptime", value: formatUptime(uptime), icon: Clock },
    { label: "World Size", value: formatMB(info?.worldSize ?? 0), icon: HardDrive },
  ];

  const resources = [
    { label: "CPU Usage", value: cpuLoad, max: 100, display: `${cpuLoad.toFixed(1)}%`, icon: Cpu, color: "text-console-info" },
    { label: "Memory", value: memUsed, max: memTotal, display: `${formatMB(memUsed)} / ${formatMB(memTotal)}`, icon: MemoryStick, color: "text-accent" },
    { label: "Disk", value: diskUsed, max: diskTotal, display: `${formatMB(diskUsed)} / ${formatMB(diskTotal)}`, icon: HardDrive, color: "text-console-warn" },
  ];

  return (
    <PanelLayout title="Server Status">
      {/* Game stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {gameStats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resource usage */}
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Resource Usage</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {resources.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-sm font-medium text-foreground">{stat.label}</span>
              </div>
              <span className={`text-sm font-bold ${stat.color}`}>{stat.display}</span>
            </div>
            <Progress value={stat.max > 0 ? (stat.value / stat.max) * 100 : 0} className="h-2" />
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Recent Activity</h2>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {actionsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : actions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No recent activity</div>
        ) : (
          actions.map((item, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className={`h-2 w-2 rounded-full shrink-0 ${
                item.status === "fail" ? "bg-destructive" : "bg-primary"
              }`} />
              <span className="text-sm text-foreground flex-1">
                {item.action}
                {item.details && Object.keys(item.details).length > 0 && (
                  <span className="text-muted-foreground"> — {Object.values(item.details).join(", ")}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">{timeAgo(item.time)}</span>
            </div>
          ))
        )}
      </div>
    </PanelLayout>
  );
}
