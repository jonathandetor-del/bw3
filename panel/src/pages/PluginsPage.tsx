import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Puzzle, Search, Upload, Trash2, Loader2, Download,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Plugin {
  name: string;
  enabled: boolean;
}

export default function PluginsPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; plugin: Plugin | null; saving: boolean }>({ open: false, plugin: null, saving: false });
  const [togglingSet, setTogglingSet] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: api.getPlugins,
  });

  const plugins: Plugin[] = data?.plugins || [];
  const filtered = plugins.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const togglePlugin = async (plugin: Plugin) => {
    setTogglingSet(prev => new Set(prev).add(plugin.name));
    try {
      await api.togglePlugin(plugin.name, !plugin.enabled);
      toast.success(`${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}`);
      qc.invalidateQueries({ queryKey: ['plugins'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setTogglingSet(prev => {
        const n = new Set(prev);
        n.delete(plugin.name);
        return n;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.plugin) return;
    setDeleteDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.deletePlugin(deleteDialog.plugin.name);
      toast.success(`${deleteDialog.plugin.name} removed`);
      setDeleteDialog({ open: false, plugin: null, saving: false });
      qc.invalidateQueries({ queryKey: ['plugins'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleteDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.name.endsWith(".jar")) {
        toast.error(`${file.name} is not a .jar file`);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        await api.uploadPlugin(file.name, buf);
        toast.success(`Uploaded ${file.name}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : `Upload failed: ${file.name}`);
      }
    }
    qc.invalidateQueries({ queryKey: ['plugins'] });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const activeCount = plugins.filter(p => p.enabled).length;

  return (
    <PanelLayout
      title="Plugins"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Install Plugin
          </Button>
          <input ref={fileInputRef} type="file" multiple accept=".jar" className="hidden" onChange={handleUpload} />
        </div>
      }
    >
      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search plugins..."
          className="pl-9 bg-card border-border"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Plugins", value: plugins.length, color: "text-foreground" },
          { label: "Active", value: activeCount, color: "text-primary" },
          { label: "Disabled", value: plugins.length - activeCount, color: "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Plugin list */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((plugin) => (
          <div
            key={plugin.name}
            className={`rounded-lg border border-border bg-card p-4 transition-colors hover:bg-surface-hover ${!plugin.enabled ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Puzzle className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{plugin.name}</h3>
                    <Badge variant="secondary" className="text-xs">{plugin.enabled ? "Active" : "Disabled"}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Button asChild variant="ghost" size="sm" className="text-primary">
                  <a href={api.downloadPluginUrl(plugin.name)} download>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteDialog({ open: true, plugin, saving: false })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Switch
                  checked={plugin.enabled}
                  disabled={togglingSet.has(plugin.name)}
                  onCheckedChange={() => togglePlugin(plugin)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Remove {deleteDialog.plugin?.name}?</DialogTitle>
            <DialogDescription className="text-muted-foreground">This will delete the plugin JAR and unload it from the server.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, plugin: null, saving: false })}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog.saving}>
              {deleteDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Remove Plugin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
