import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Archive, Download, Trash2, RotateCcw, Clock, HardDrive, Plus, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

interface Backup {
  name: string;
  size: number;
  created: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { hour12: false }).replace(",", "");
}

async function pollJob(jobId: string): Promise<void> {
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { job } = await api.getJob(jobId);
    if (job.status === "done") return;
    if (job.status === "error") throw new Error(job.error || "Job failed");
  }
  throw new Error("Job timed out");
}

export default function BackupsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["backups"], queryFn: api.getBackups });
  const backups: Backup[] = data?.backups ?? [];

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [createDialog, setCreateDialog] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState<Backup | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Backup | null>(null);

  const handleCreate = async () => {
    const label = labelInput.trim() || "backup";
    setBackingUp(true);
    try {
      const { jobId } = await api.createBackup(label);
      toast({ title: "Backup started", description: "Creating backup in background..." });
      setCreateDialog(false);
      setLabelInput("");
      await pollJob(jobId);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Backup complete", description: `Backup "${label}" created successfully.` });
    } catch (e: any) {
      toast({ title: "Backup failed", description: e.message, variant: "destructive" });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreDialog) return;
    const name = restoreDialog.name;
    setRestoring(true);
    try {
      const { jobId } = await api.restoreBackup(name);
      toast({ title: "Restore started", description: "Restoring backup..." });
      setRestoreDialog(null);
      await pollJob(jobId);
      toast({ title: "Restore complete", description: `Restored from "${name}".` });
    } catch (e: any) {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    const name = deleteDialog.name;
    setDeleting(true);
    try {
      await api.deleteBackup(name);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setDeleteDialog(null);
      toast({ title: "Deleted", description: `Backup "${name}" deleted.` });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const totalSize = backups.reduce((acc, b) => acc + b.size, 0);

  return (
    <PanelLayout
      title="Backups"
      actions={
        <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setCreateDialog(true)} disabled={backingUp}>
          {backingUp ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          {backingUp ? "Backing Up..." : "Backup Now"}
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Backups", value: String(backups.length), icon: Archive },
          { label: "Storage Used", value: formatSize(totalSize), icon: HardDrive },
          { label: "Last Backup", value: backups[0] ? formatDate(backups[0].created) : "Never", icon: Clock },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Backup list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : backups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No backups yet. Create your first backup above.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_160px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
            <span>Backup</span>
            <span>Size</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {backups.map((backup) => (
              <div key={backup.name} className="grid grid-cols-[1fr_100px_160px] gap-4 px-4 py-3 items-center hover:bg-surface-hover group">
                <div>
                  <p className="text-sm font-medium text-foreground">{backup.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(backup.created)}</p>
                </div>
                <span className="text-sm text-muted-foreground">{formatSize(backup.size)}</span>
                <div className="flex items-center gap-1 justify-end">
                  <a href={api.downloadBackupUrl(backup.name)} download>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-console-warn hover:text-console-warn" onClick={() => setRestoreDialog(backup)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(backup)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Backup Dialog */}
      <Dialog open={createDialog} onOpenChange={(open) => { if (!backingUp) setCreateDialog(open); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Backup</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will back up plugins, configs, and world data.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Label (optional)</label>
            <Input
              placeholder="backup"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              className="bg-muted border-border"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)} disabled={backingUp}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleCreate} disabled={backingUp}>
              {backingUp ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              {backingUp ? "Creating..." : "Create Backup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={!!restoreDialog} onOpenChange={(open) => { if (!restoring) { setRestoreDialog(open ? restoreDialog : null); } }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Restore Backup</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Restore from "{restoreDialog?.name}"? This will overwrite current server files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog(null)} disabled={restoring}>Cancel</Button>
            <Button className="bg-console-warn text-primary-foreground hover:bg-console-warn/90" onClick={handleRestore} disabled={restoring}>
              {restoring ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              {restoring ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!deleting) { setDeleteDialog(open ? deleteDialog : null); } }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Backup</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Delete "{deleteDialog?.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
