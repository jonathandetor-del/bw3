import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

// Key server.properties fields to show in a friendly UI
const textFields: { key: string; label: string; section: string; mono?: boolean }[] = [
  { key: "motd", label: "MOTD", section: "server", mono: true },
  { key: "server-port", label: "Port", section: "server" },
  { key: "max-players", label: "Max Players", section: "server" },
  { key: "level-name", label: "Level Name", section: "server" },
  { key: "level-seed", label: "Level Seed", section: "server" },
  { key: "view-distance", label: "View Distance", section: "performance" },
  { key: "simulation-distance", label: "Simulation Distance", section: "performance" },
  { key: "max-tick-time", label: "Max Tick Time (ms)", section: "performance" },
  { key: "network-compression-threshold", label: "Network Compression Threshold", section: "performance" },
];

const selectFields: { key: string; label: string; section: string; options: { value: string; label: string }[] }[] = [
  { key: "gamemode", label: "Default Game Mode", section: "server", options: [
    { value: "survival", label: "Survival" }, { value: "creative", label: "Creative" },
    { value: "adventure", label: "Adventure" }, { value: "spectator", label: "Spectator" },
  ]},
  { key: "difficulty", label: "Difficulty", section: "server", options: [
    { value: "peaceful", label: "Peaceful" }, { value: "easy", label: "Easy" },
    { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" },
  ]},
];

const booleanFields: { key: string; label: string; desc: string }[] = [
  { key: "white-list", label: "Whitelist", desc: "Only whitelisted players can join" },
  { key: "online-mode", label: "Online Mode", desc: "Verify player accounts with Mojang" },
  { key: "pvp", label: "PvP", desc: "Allow player vs player combat" },
  { key: "enable-command-block", label: "Command Blocks", desc: "Enable command block functionality" },
  { key: "allow-flight", label: "Allow Flight", desc: "Don't kick players for flying" },
  { key: "spawn-npcs", label: "Spawn NPCs", desc: "Allow villager spawning" },
  { key: "spawn-animals", label: "Spawn Animals", desc: "Allow animal spawning" },
  { key: "spawn-monsters", label: "Spawn Monsters", desc: "Allow hostile mob spawning" },
  { key: "allow-nether", label: "Allow Nether", desc: "Enable Nether portal travel" },
  { key: "force-gamemode", label: "Force Gamemode", desc: "Force default gamemode on join" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Sync fetched settings to draft state
  useEffect(() => {
    if (data?.settings) setDraft(data.settings);
  }, [data]);

  const update = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const isDirty = data?.settings && JSON.stringify(data.settings) !== JSON.stringify(draft);

  const handleSave = async () => {
    if (!isDirty) return;
    // Only send fields that changed
    const changes: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (data?.settings?.[k] !== v) changes[k] = v;
    }
    setSaving(true);
    try {
      await api.updateSettings(changes);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Settings saved", description: "server.properties updated. Restart the server to apply changes." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <PanelLayout title="Settings">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PanelLayout>
    );
  }

  const serverTextFields = textFields.filter((f) => f.section === "server");
  const perfTextFields = textFields.filter((f) => f.section === "performance");

  return (
    <PanelLayout
      title="Settings"
      actions={
        <Button size="sm" className="bg-primary text-primary-foreground" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      }
    >
      <div className="max-w-2xl space-y-8">
        {/* Server configuration */}
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Server Configuration</h2>
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {serverTextFields.map((f) => (
                <div key={f.key} className={f.key === "motd" ? "col-span-2" : ""}>
                  <Label className="text-muted-foreground">{f.label}</Label>
                  <Input
                    value={draft[f.key] ?? ""}
                    onChange={(e) => update(f.key, e.target.value)}
                    className={`mt-1 bg-muted border-border ${f.mono ? "font-mono text-sm" : ""}`}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {selectFields.filter((f) => f.section === "server").map((f) => (
                <div key={f.key}>
                  <Label className="text-muted-foreground">{f.label}</Label>
                  <Select value={draft[f.key] ?? ""} onValueChange={(v) => update(f.key, v)}>
                    <SelectTrigger className="mt-1 bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature toggles */}
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Features</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {booleanFields.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={draft[item.key] === "true"}
                  onCheckedChange={(v) => update(item.key, v ? "true" : "false")}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Performance */}
        <section>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Performance</h2>
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {perfTextFields.map((f) => (
                <div key={f.key}>
                  <Label className="text-muted-foreground">{f.label}</Label>
                  <Input
                    value={draft[f.key] ?? ""}
                    onChange={(e) => update(f.key, e.target.value)}
                    className="mt-1 bg-muted border-border"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PanelLayout>
  );
}
