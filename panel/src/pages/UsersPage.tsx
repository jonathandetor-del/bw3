import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, UserPlus, Shield, Crown, Ban, Trash2, MoreHorizontal, Star, ShieldOff, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  nickname: string | null;
  uuid: string;
  role: "owner" | "admin" | "moderator" | "player";
  status: "online" | "offline" | "banned";
  isOpped: boolean;
  lastSeen: string;
  playtime: string;
  gamesPlayed: number;
  banReason?: string;
}

const roleColors: Record<string, string> = {
  owner: "bg-console-warn/10 text-console-warn border-console-warn/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  moderator: "bg-console-info/10 text-console-info border-console-info/20",
  player: "bg-muted text-muted-foreground border-border",
};

const statusColors: Record<string, string> = {
  online: "bg-primary",
  offline: "bg-muted-foreground",
  banned: "bg-destructive",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [addDialog, setAddDialog] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState("player");
  const [activeTab, setActiveTab] = useState("all");
  const [savingAdd, setSavingAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: api.getUsers,
    refetchInterval: 10000,
  });

  const users: User[] = data?.users || [];

  const filtered = useMemo(() => users.filter((u) => {
    const matchesSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.nickname?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  }), [users, searchQuery, filterRole]);

  const bannedUsers = useMemo(() => users.filter((u) => u.status === "banned"), [users]);
  const oppedUsers = useMemo(() => users.filter((u) => u.isOpped), [users]);
  const online = users.filter((u) => u.status === "online").length;

  const refreshUsers = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const handleUnban = async (username: string) => {
    try {
      await api.unbanUser(username);
      toast.success(`${username} unbanned`);
      refreshUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unban failed");
    }
  };

  const handleBan = async (username: string) => {
    try {
      await api.banUser(username, 'Banned by admin');
      toast.success(`${username} banned`);
      refreshUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ban failed");
    }
  };

  const handleDeop = async (username: string) => {
    try {
      await api.setStaffOp(username, 'deop');
      toast.success(`${username} deopped`);
      refreshUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Deop failed");
    }
  };

  const handleOp = async (username: string) => {
    try {
      await api.setStaffOp(username, 'op');
      toast.success(`${username} opped`);
      refreshUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Op failed");
    }
  };

  const handleAddUser = async () => {
    const player = newUsername.trim();
    if (!player) {
      toast.error('Enter a username');
      return;
    }
    setSavingAdd(true);
    try {
      await api.addUser(player, newRole);
      toast.success(`${player} added`);
      setAddDialog(false);
      setNewUsername('');
      setNewRole('player');
      refreshUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Add user failed');
    } finally {
      setSavingAdd(false);
    }
  };

  return (
    <PanelLayout
      title="User Management"
      actions={
        <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setAddDialog(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Add User
        </Button>
      }
    >
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Users", value: users.length },
          { label: "Online", value: online, color: "text-primary" },
          { label: "Staff", value: users.filter((u) => u.role !== "player").length, color: "text-console-info" },
          { label: "Banned", value: bannedUsers.length, color: "text-destructive" },
          { label: "Opped", value: oppedUsers.length, color: "text-console-warn" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color || "text-foreground"}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="all">All Users</TabsTrigger>
          <TabsTrigger value="banned" className="data-[state=active]:text-destructive">
            <Ban className="h-3.5 w-3.5 mr-1.5" /> Banned ({bannedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="opped" className="data-[state=active]:text-console-warn">
            <Star className="h-3.5 w-3.5 mr-1.5" /> Opped ({oppedUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search users..." className="pl-9 bg-card border-border" />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-40 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="player">Player</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_80px_80px_100px_80px_48px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
              <span>User</span><span>Role</span><span>Status</span><span>Games</span><span>Playtime</span><span>Last Seen</span><span />
            </div>
            <div className="divide-y divide-border">
              {isLoading && (
                <div className="px-4 py-10 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {filtered.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_100px_80px_80px_100px_80px_48px] gap-4 px-4 py-3 items-center hover:bg-surface-hover group">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${statusColors[user.status]}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{user.username}</p>
                        {user.isOpped && <Star className="h-3 w-3 text-console-warn fill-console-warn" />}
                        {user.nickname && <span className="text-xs text-accent">aka "{user.nickname}"</span>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{user.uuid}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs w-fit ${roleColors[user.role]}`}>
                    {user.role === "owner" && <Crown className="h-3 w-3 mr-1" />}
                    {user.role === "admin" && <Shield className="h-3 w-3 mr-1" />}
                    {user.role}
                  </Badge>
                  <span className={`text-xs capitalize ${user.status === "banned" ? "text-destructive" : user.status === "online" ? "text-primary" : "text-muted-foreground"}`}>{user.status}</span>
                  <span className="text-sm text-muted-foreground">{user.gamesPlayed}</span>
                  <span className="text-sm text-muted-foreground">{user.playtime}</span>
                  <span className="text-xs text-muted-foreground">{user.lastSeen}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuItem onClick={() => toast.info('Role changes are managed by LuckPerms group commands')}>
                        <Shield className="h-4 w-4 mr-2" /> Change Role
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => user.isOpped ? handleDeop(user.username) : handleOp(user.username)}>
                        <Star className="h-4 w-4 mr-2" /> {user.isOpped ? "Deop" : "Op"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => user.status === "banned" ? handleUnban(user.username) : handleBan(user.username)}>
                        <Ban className="h-4 w-4 mr-2" /> {user.status === "banned" ? "Unban" : "Ban"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="banned">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_120px_100px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
              <span>Player</span><span>Reason</span><span>Last Seen</span><span>Action</span>
            </div>
            <div className="divide-y divide-border">
              {bannedUsers.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">No banned players</div>
              ) : bannedUsers.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_1fr_120px_100px] gap-4 px-4 py-3 items-center">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-destructive/10 text-destructive text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.username}</p>
                      {user.nickname && <span className="text-xs text-muted-foreground">aka "{user.nickname}"</span>}
                    </div>
                  </div>
                  <p className="text-sm text-destructive/80 truncate">{user.banReason || "No reason"}</p>
                  <span className="text-xs text-muted-foreground">{user.lastSeen}</span>
                  <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleUnban(user.username)}>
                    <ShieldOff className="h-3.5 w-3.5 mr-1" /> Unban
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="opped">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_100px_100px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
              <span>Player</span><span>Role</span><span>Status</span><span>Action</span>
            </div>
            <div className="divide-y divide-border">
              {oppedUsers.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">No opped players</div>
              ) : oppedUsers.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_100px_100px_100px] gap-4 px-4 py-3 items-center">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-console-warn/10 text-console-warn text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.username}</p>
                      {user.nickname && <span className="text-xs text-muted-foreground">aka "{user.nickname}"</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs w-fit ${roleColors[user.role]}`}>{user.role}</Badge>
                  <span className={`text-xs capitalize ${user.status === "online" ? "text-primary" : "text-muted-foreground"}`}>{user.status}</span>
                  <Button size="sm" variant="outline" className="border-console-warn/30 text-console-warn hover:bg-console-warn/10" onClick={() => handleDeop(user.username)}>
                    <ShieldOff className="h-3.5 w-3.5 mr-1" /> Deop
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add User</DialogTitle>
            <DialogDescription className="text-muted-foreground">Add a player or staff member to the server whitelist.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Minecraft username" className="bg-muted border-border" />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="player">Player</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleAddUser} disabled={savingAdd}>
              {savingAdd && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
