import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, Shield, Crown, MoreHorizontal, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface StaffMember {
  name: string;
  uuid: string;
  level: number;
  source: string;
  group?: string;
}

const groupColors: Record<string, string> = {
  owner: "bg-console-warn/10 text-console-warn border-console-warn/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  dev: "bg-accent/10 text-accent border-accent/20",
  default: "bg-muted text-muted-foreground border-border",
};

function getGroupColor(group?: string) {
  if (!group) return groupColors.default;
  return groupColors[group.toLowerCase()] || "bg-console-info/10 text-console-info border-console-info/20";
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; staff: StaffMember | null; selectedGroup: string; saving: boolean }>({ open: false, staff: null, selectedGroup: "", saving: false });

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: api.getStaff,
  });

  const { data: groupsData } = useQuery({
    queryKey: ['staff-groups'],
    queryFn: api.getStaffGroups,
  });

  const staff: StaffMember[] = data?.staff || [];
  const groups: string[] = groupsData?.groups || [];

  const filtered = staff.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeop = async (name: string) => {
    try {
      await api.setStaffOp(name, 'deop');
      toast.success(`${name} deoped`);
      qc.invalidateQueries({ queryKey: ['staff'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Deop failed");
    }
  };

  const handleSetGroup = async () => {
    if (!groupDialog.staff || !groupDialog.selectedGroup) return;
    setGroupDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.setStaffGroup(groupDialog.staff.name, groupDialog.selectedGroup);
      toast.success(`${groupDialog.staff.name} set to ${groupDialog.selectedGroup}`);
      setGroupDialog({ open: false, staff: null, selectedGroup: "", saving: false });
      qc.invalidateQueries({ queryKey: ['staff'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to set group");
      setGroupDialog(prev => ({ ...prev, saving: false }));
    }
  };

  return (
    <PanelLayout
      title="Staff Management"
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Staff</p>
          <p className="text-2xl font-bold text-foreground">{staff.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Op Level 4</p>
          <p className="text-2xl font-bold text-console-warn">{staff.filter(s => s.level === 4).length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Groups Loaded</p>
          <p className="text-2xl font-bold text-console-info">{groups.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative flex-1 mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search staff..." className="pl-9 bg-card border-border" />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Staff table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_80px_80px_48px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
          <span>User</span>
          <span>Group</span>
          <span>Op Level</span>
          <span>Source</span>
          <span />
        </div>
        <div className="divide-y divide-border">
          {filtered.map((user) => (
            <div key={user.uuid} className="grid grid-cols-[1fr_120px_80px_80px_48px] gap-4 px-4 py-3 items-center hover:bg-surface-hover group">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    {user.level === 4 && <Crown className="h-3 w-3 text-console-warn" />}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{user.uuid.slice(0, 8)}...</p>
                </div>
              </div>
              <Badge variant="outline" className={`text-xs w-fit ${getGroupColor(user.group)}`}>
                {user.group || "—"}
              </Badge>
              <span className="text-sm text-muted-foreground">{user.level}</span>
              <span className="text-xs text-muted-foreground capitalize">{user.source}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={() => setGroupDialog({ open: true, staff: user, selectedGroup: user.group || "", saving: false })}>
                    <Shield className="h-4 w-4 mr-2" /> Change Group
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeop(user.name)}>
                    <Shield className="h-4 w-4 mr-2" /> Deop
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "No staff match your search" : "No staff members found"}
            </div>
          )}
        </div>
      </div>

      {/* Change Group Dialog */}
      <Dialog open={groupDialog.open} onOpenChange={(open) => setGroupDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Change Group for {groupDialog.staff?.name}</DialogTitle>
            <DialogDescription className="text-muted-foreground">Select a LuckPerms group to assign</DialogDescription>
          </DialogHeader>
          <Select value={groupDialog.selectedGroup} onValueChange={(v) => setGroupDialog(prev => ({ ...prev, selectedGroup: v }))}>
            <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select group" /></SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleSetGroup} disabled={groupDialog.saving || !groupDialog.selectedGroup}>
              {groupDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Set Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
