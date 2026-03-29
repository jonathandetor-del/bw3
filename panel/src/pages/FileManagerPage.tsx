import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderOpen, File, FileText, FileCode, Image, Archive, Upload, FolderPlus, FilePlus,
  Download, Trash2, Pencil, Eye, ArrowLeft, MoreHorizontal, Search, ChevronRight, Package, Loader2
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

const fileIcons: Record<string, React.ReactNode> = {
  yml: <FileCode className="h-4 w-4 text-console-info" />,
  yaml: <FileCode className="h-4 w-4 text-console-info" />,
  properties: <FileCode className="h-4 w-4 text-console-info" />,
  json: <FileCode className="h-4 w-4 text-console-warn" />,
  txt: <FileText className="h-4 w-4 text-muted-foreground" />,
  log: <FileText className="h-4 w-4 text-muted-foreground" />,
  jar: <Package className="h-4 w-4 text-accent" />,
  zip: <Archive className="h-4 w-4 text-console-warn" />,
  "tar.gz": <Archive className="h-4 w-4 text-console-warn" />,
  gz: <Archive className="h-4 w-4 text-console-warn" />,
  rar: <Archive className="h-4 w-4 text-console-warn" />,
  png: <Image className="h-4 w-4 text-primary" />,
  jpg: <Image className="h-4 w-4 text-primary" />,
};

function getExtension(name: string): string {
  if (name.endsWith(".tar.gz")) return "tar.gz";
  if (name.endsWith(".log.gz")) return "log.gz";
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function getFileIcon(entry: FileEntry) {
  if (entry.isDir) return <FolderOpen className="h-4 w-4 text-console-warn" />;
  return fileIcons[getExtension(entry.name)] || <File className="h-4 w-4 text-muted-foreground" />;
}

function isArchive(name: string) {
  const ext = getExtension(name);
  return ["zip", "tar.gz", "rar", "gz", "7z"].includes(ext);
}

function isEditable(name: string) {
  const ext = getExtension(name);
  return ["yml", "yaml", "properties", "json", "txt", "log", "cfg", "conf", "xml", "html", "css", "js", "ts", "sk", "md", "toml"].includes(ext);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileManagerPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [editDialog, setEditDialog] = useState<{ open: boolean; filePath: string; fileName: string; content: string; saving: boolean }>({ open: false, filePath: "", fileName: "", content: "", saving: false });
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; oldName: string; newName: string; saving: boolean }>({ open: false, oldName: "", newName: "", saving: false });
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; name: string; destination: string; saving: boolean }>({ open: false, name: "", destination: "/", saving: false });
  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: "file" | "folder"; name: string; saving: boolean }>({ open: false, type: "file", name: "", saving: false });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; name: string; saving: boolean }>({ open: false, name: "", saving: false });

  const { data, isLoading } = useQuery({
    queryKey: ['files', currentPath],
    queryFn: () => api.listFiles(currentPath),
  });

  const entries: FileEntry[] = (data?.entries || []) as FileEntry[];
  const filteredFiles = entries.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbs = currentPath.split("/").filter(Boolean);
  const fullPath = (name: string) => currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['files', currentPath] });
  }, [qc, currentPath]);

  const navigateTo = (folder: string) => {
    setCurrentPath(fullPath(folder));
    setSelectedFiles([]);
    setSearchQuery("");
  };

  const goBack = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? "/" : `/${parts.join("/")}`);
    setSelectedFiles([]);
  };

  const toggleSelect = (name: string) => {
    setSelectedFiles((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleOpenFile = async (entry: FileEntry) => {
    if (!isEditable(entry.name)) return;
    try {
      const data = await api.readFile(fullPath(entry.name));
      setEditDialog({ open: true, filePath: fullPath(entry.name), fileName: entry.name, content: data.content, saving: false });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
    }
  };

  const handleSaveFile = async () => {
    setEditDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.writeFile(editDialog.filePath, editDialog.content);
      toast.success("File saved");
      setEditDialog(prev => ({ ...prev, open: false, saving: false }));
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save file");
      setEditDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleRename = async () => {
    setRenameDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.renameFile(fullPath(renameDialog.oldName), fullPath(renameDialog.newName));
      toast.success("Renamed");
      setRenameDialog(prev => ({ ...prev, open: false, saving: false }));
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      setRenameDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleMove = async () => {
    setMoveDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.moveFile(fullPath(moveDialog.name), moveDialog.destination);
      toast.success("Moved");
      setMoveDialog({ open: false, name: "", destination: "/", saving: false });
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Move failed");
      setMoveDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleCreate = async () => {
    setCreateDialog(prev => ({ ...prev, saving: true }));
    try {
      const newPath = fullPath(createDialog.name);
      if (createDialog.type === "folder") {
        await api.createDir(newPath);
      } else {
        await api.writeFile(newPath, "");
      }
      toast.success(`${createDialog.type === "folder" ? "Folder" : "File"} created`);
      setCreateDialog(prev => ({ ...prev, open: false, saving: false }));
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
      setCreateDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleDelete = async () => {
    setDeleteDialog(prev => ({ ...prev, saving: true }));
    try {
      await api.deleteFile(fullPath(deleteDialog.name));
      toast.success("Deleted");
      setDeleteDialog(prev => ({ ...prev, open: false, saving: false }));
      setSelectedFiles(prev => prev.filter(n => n !== deleteDialog.name));
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleteDialog(prev => ({ ...prev, saving: false }));
    }
  };

  const handleBulkDelete = async () => {
    for (const name of selectedFiles) {
      try {
        await api.deleteFile(fullPath(name));
      } catch (_) {}
    }
    toast.success(`Deleted ${selectedFiles.length} item(s)`);
    setSelectedFiles([]);
    invalidate();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        await api.uploadFile(currentPath, file.name, buf);
        toast.success(`Uploaded ${file.name}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : `Upload failed: ${file.name}`);
      }
    }
    invalidate();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const dirs = new Set<string>();
    for (const file of Array.from(files)) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }

    // Create parent directories first so nested uploads succeed.
    for (const dir of Array.from(dirs).sort((a, b) => a.split('/').length - b.split('/').length)) {
      try {
        await api.createDir(fullPath(dir));
      } catch (_) {}
    }

    let successCount = 0;
    for (const file of Array.from(files)) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split('/').filter(Boolean);
      const fileName = parts[parts.length - 1];
      const relativeDir = parts.slice(0, -1).join('/');
      const targetDir = relativeDir ? fullPath(relativeDir) : currentPath;
      try {
        const buf = await file.arrayBuffer();
        await api.uploadFile(targetDir, fileName, buf);
        successCount += 1;
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : `Upload failed: ${fileName}`);
      }
    }

    toast.success(`Uploaded ${successCount} file(s) from folder`);
    invalidate();
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleExtract = async (name: string) => {
    try {
      const data = await api.extractFile(fullPath(name));
      toast.info("Extracting...");
      const poll = async () => {
        const job = await api.getJob(data.jobId);
        if (job.job.status === "done") {
          toast.success("Extraction complete");
          invalidate();
        } else if (job.job.status === "error") {
          toast.error(`Extraction failed: ${job.job.error}`);
        } else {
          setTimeout(poll, 1000);
        }
      };
      poll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Extract failed");
    }
  };

  return (
    <PanelLayout
      title="File Manager"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateDialog({ open: true, type: "folder", name: "", saving: false })}>
            <FolderPlus className="h-4 w-4 mr-1" /> New Folder
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCreateDialog({ open: true, type: "file", name: "", saving: false })}>
            <FilePlus className="h-4 w-4 mr-1" /> New File
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
            <FolderOpen className="h-4 w-4 mr-1" /> Upload Folder
          </Button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUploadFolder}
            // Non-standard but widely supported for folder picking.
            webkitdirectory=""
            directory=""
          />
          {selectedFiles.length > 0 && (
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete ({selectedFiles.length})
            </Button>
          )}
        </div>
      }
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 text-sm">
        {currentPath !== "/" && (
          <Button variant="ghost" size="sm" onClick={goBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <button onClick={() => { setCurrentPath("/"); setSearchQuery(""); }} className="text-primary hover:underline font-medium">
          root
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              onClick={() => { setCurrentPath(`/${breadcrumbs.slice(0, i + 1).join("/")}`); setSearchQuery(""); }}
              className="text-primary hover:underline font-medium"
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files and folders..."
          className="pl-9 bg-card border-border"
        />
      </div>

      {/* File table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_100px_140px_48px] gap-4 px-4 py-2 bg-card text-xs uppercase tracking-wider text-muted-foreground/60 border-b border-border">
          <span className="w-5" />
          <span>Name</span>
          <span>Size</span>
          <span>Modified</span>
          <span />
        </div>
        <div className="divide-y divide-border">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && sortedFiles.map((item) => (
            <div
              key={item.name}
              className={`grid grid-cols-[auto_1fr_100px_140px_48px] gap-4 px-4 py-2.5 items-center transition-colors hover:bg-surface-hover group cursor-pointer ${
                selectedFiles.includes(item.name) ? "bg-primary/5" : ""
              }`}
              onClick={() => item.isDir ? navigateTo(item.name) : toggleSelect(item.name)}
              onDoubleClick={() => {
                if (!item.isDir && isEditable(item.name)) {
                  handleOpenFile(item);
                }
              }}
            >
              <input
                type="checkbox"
                checked={selectedFiles.includes(item.name)}
                onChange={(e) => { e.stopPropagation(); toggleSelect(item.name); }}
                className="rounded border-border"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex items-center gap-3 min-w-0">
                {getFileIcon(item)}
                <span className="text-sm text-foreground truncate">{item.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{item.isDir ? "—" : formatSize(item.size)}</span>
              <span className="text-xs text-muted-foreground">{item.modified ? new Date(item.modified).toLocaleDateString() : "—"}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  {!item.isDir && isEditable(item.name) && (
                    <DropdownMenuItem onClick={() => handleOpenFile(item)}>
                      <Eye className="h-4 w-4 mr-2" /> View / Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setRenameDialog({ open: true, oldName: item.name, newName: item.name, saving: false })}>
                    <Pencil className="h-4 w-4 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMoveDialog({ open: true, name: item.name, destination: currentPath, saving: false })}>
                    <FolderOpen className="h-4 w-4 mr-2" /> Move
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={api.downloadFileUrl(fullPath(item.name))} download>
                      <Download className="h-4 w-4 mr-2" /> Download
                    </a>
                  </DropdownMenuItem>
                  {!item.isDir && isArchive(item.name) && (
                    <DropdownMenuItem onClick={() => handleExtract(item.name)}>
                      <Archive className="h-4 w-4 mr-2" /> Extract / Unzip
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteDialog({ open: true, name: item.name, saving: false })}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {!isLoading && sortedFiles.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "No files match your search" : "This folder is empty"}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-3xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <FileCode className="h-5 w-5 text-console-info" />
              {editDialog.fileName}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">Edit file contents below</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editDialog.content}
            onChange={(e) => setEditDialog((prev) => ({ ...prev, content: e.target.value }))}
            className="min-h-[400px] font-mono text-sm bg-console-bg text-console-text border-border"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleSaveFile} disabled={editDialog.saving}>
              {editDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rename</DialogTitle>
            <DialogDescription className="text-muted-foreground">Enter a new name for "{renameDialog.oldName}"</DialogDescription>
          </DialogHeader>
          <Input
            value={renameDialog.newName}
            onChange={(e) => setRenameDialog((prev) => ({ ...prev, newName: e.target.value }))}
            className="bg-muted border-border"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog((prev) => ({ ...prev, open: false }))}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleRename} disabled={renameDialog.saving}>
              {renameDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialog.open} onOpenChange={(open) => setCreateDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New {createDialog.type === "folder" ? "Folder" : "File"}</DialogTitle>
            <DialogDescription className="text-muted-foreground">Enter a name for the new {createDialog.type}</DialogDescription>
          </DialogHeader>
          <Input
            value={createDialog.name}
            onChange={(e) => setCreateDialog((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={createDialog.type === "folder" ? "folder-name" : "filename.txt"}
            className="bg-muted border-border"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog((prev) => ({ ...prev, open: false }))}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleCreate} disabled={createDialog.saving}>
              {createDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveDialog.open} onOpenChange={(open) => setMoveDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Move "{moveDialog.name}"</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter destination directory path (example: /plugins or /world/maps).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={moveDialog.destination}
            onChange={(e) => setMoveDialog((prev) => ({ ...prev, destination: e.target.value }))}
            className="bg-muted border-border"
            placeholder="/"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog((prev) => ({ ...prev, open: false }))}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleMove} disabled={moveDialog.saving}>
              {moveDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete "{deleteDialog.name}"?</DialogTitle>
            <DialogDescription className="text-muted-foreground">This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog((prev) => ({ ...prev, open: false }))}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDialog.saving}>
              {deleteDialog.saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelLayout>
  );
}
