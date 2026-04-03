import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, UserX, VolumeX, Clock, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function PlayersLivePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [actionDialog, setActionDialog] = useState<{ open: boolean; type: "kick" | "mute" | "tempban"; player: string }>({ open: false, type: "kick", player: "" });
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState("15m");
  const [executing, setExecuting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: api.getPlayers,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
  });

  const players: string[] = data?.players || [];
  const filtered = players.filter((p) =>
    p.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAction = async () => {
    const { type, player } = actionDialog;
    setExecuting(true);
    try {
      let cmd = "";
      if (type === "kick") {
        cmd = `kick ${player} ${actionReason || "Kicked by admin"}`;
      } else if (type === "mute") {
        cmd = `mute ${player} ${actionDuration} ${actionReason || "Muted by admin"}`;
      } else if (type === "tempban") {
        cmd = `tempban ${player} ${actionDuration} ${actionReason || "Banned by admin"}`;
      }
      await api.sendCommand(cmd);
      toast.success(`${type} executed on ${player}`);
      setActionDialog(prev => ({ ...prev, open: false }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <PanelLayout
      title="Player Live View"
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium text-primary">{players.length} Online</span>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-[calc(100vh-9rem)]">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search players..." className="pl-9 bg-card border-border" />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Player list */}
        <div className="rounded-lg border border-border overflow-hidden flex-1 min-h-0">
          <div className="grid grid-cols-[1fr_120px] gap-3 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
            <span>Player</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="overflow-auto max-h-[calc(100vh-16rem)] scrollbar-thin divide-y divide-border">
            {filtered.map((player) => (
              <div key={player} className="grid grid-cols-[1fr_120px] gap-3 px-4 py-2.5 items-center hover:bg-surface-hover group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-[10px]">
                        {player.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card" />
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{player}</p>
                </div>
                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-console-warn" onClick={() => { setActionDialog({ open: true, type: "kick", player }); setActionReason(""); }}>
                    <UserX className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground" onClick={() => { setActionDialog({ open: true, type: "mute", player }); setActionReason(""); }}>
                    <VolumeX className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-destructive" onClick={() => { setActionDialog({ open: true, type: "tempban", player }); setActionReason(""); }}>
                    <Clock className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "No players match" : "No players online"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground capitalize">{actionDialog.type} {actionDialog.player}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {actionDialog.type === "kick" && "This will remove the player from the server."}
              {actionDialog.type === "mute" && "This will prevent the player from chatting."}
              {actionDialog.type === "tempban" && "This will temporarily ban the player."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Reason..." className="bg-muted border-border" />
            {(actionDialog.type === "mute" || actionDialog.type === "tempban") && (
              <Select value={actionDuration} onValueChange={setActionDuration}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="5m">5 Minutes</SelectItem>
                  <SelectItem value="15m">15 Minutes</SelectItem>
                  <SelectItem value="30m">30 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="6h">6 Hours</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog((prev) => ({ ...prev, open: false }))}>Cancel</Button>
            <Button variant="destructive" onClick={handleAction} disabled={executing}>
              {executing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {actionDialog.type === "kick" && "Kick Player"}
              {actionDialog.type === "mute" && "Mute Player"}
              {actionDialog.type === "tempban" && "Temp Ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
