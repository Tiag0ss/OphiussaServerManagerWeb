"use client";

import { format } from "date-fns";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { FileCodeEditor } from "@/components/file-code-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Entry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime?: string;
};

type Clip = { mode: "copy" | "cut"; paths: string[] };

const TEXT_EXT = new Set([
  "txt",
  "cfg",
  "ini",
  "json",
  "yml",
  "yaml",
  "xml",
  "log",
  "md",
  "properties",
  "conf",
  "lua",
  "vdf",
  "toml",
  "env",
  "sh",
  "bat",
  "css",
  "js",
  "ts",
  "html",
  "csv",
  "sql",
  "nfo",
  "list",
  "rc",
]);

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isTextFile(name: string) {
  return TEXT_EXT.has(extOf(name));
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatMtime(iso?: string) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yyyy HH:mm");
  } catch {
    return "—";
  }
}

function breadcrumbs(cwd: string) {
  if (!cwd || cwd === ".") return [{ label: "Files", path: "." }];
  const parts = cwd.split("/").filter(Boolean);
  const crumbs = [{ label: "Files", path: "." }];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    crumbs.push({ label: p, path: acc });
  }
  return crumbs;
}

function parentPath(cwd: string) {
  if (!cwd || cwd === ".") return ".";
  const i = cwd.lastIndexOf("/");
  return i <= 0 ? "." : cwd.slice(0, i);
}

function joinPath(cwd: string, name: string) {
  return cwd === "." ? name : `${cwd}/${name}`;
}

function basename(p: string) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function EntryGlyph({ entry }: { entry: Entry }) {
  if (entry.isDirectory) {
    return <Folder className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />;
  }
  const ext = extOf(entry.name);
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
    return <FileArchive className="h-4 w-4 shrink-0 text-warn" strokeWidth={1.75} />;
  }
  if (["json", "yml", "yaml", "toml", "xml"].includes(ext)) {
    return <FileJson className="h-4 w-4 shrink-0 text-ok" strokeWidth={1.75} />;
  }
  if (["lua", "js", "ts", "sh", "py", "css", "html"].includes(ext)) {
    return <FileCode className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />;
  }
  if (isTextFile(entry.name)) {
    return <FileText className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />;
  }
  return <FileIcon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />;
}

export function FilesBrowser({
  serverId,
  onMessage,
}: {
  serverId: string;
  onMessage: (msg: string) => void;
}) {
  const [cwd, setCwd] = useState(".");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "size" | "mtime">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [history, setHistory] = useState<string[]>(["."]);
  const [histIdx, setHistIdx] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [creating, setCreating] = useState<"folder" | "file" | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editor, setEditor] = useState<{ path: string; content: string } | null>(
    null,
  );
  const [editorMaximized, setEditorMaximized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastClickRef = useRef<{ path: string; at: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/servers/${serverId}/files?path=${encodeURIComponent(cwd)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to list files");
        setEntries([]);
        return;
      }
      setEntries(data.entries || []);
    } catch {
      setError("Failed to list files");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, cwd]);

  useEffect(() => {
    reload();
    setSelected([]);
    setCreating(null);
    setRenaming(null);
  }, [reload]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const goTo = useCallback(
    (path: string, push = true) => {
      if (path === cwd) return;
      if (push) {
        setHistory((h) => {
          const next = [...h.slice(0, histIdx + 1), path];
          return next.slice(-40);
        });
        setHistIdx((i) => i + 1);
      }
      setCwd(path);
    },
    [cwd, histIdx],
  );

  const goBack = () => {
    if (histIdx <= 0) return;
    const next = histIdx - 1;
    setHistIdx(next);
    setCwd(history[next] || ".");
  };

  const goForward = () => {
    if (histIdx >= history.length - 1) return;
    const next = histIdx + 1;
    setHistIdx(next);
    setCwd(history[next] || ".");
  };

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q))
      : [...entries];
    list.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      let cmp = 0;
      if (sortKey === "size") cmp = a.size - b.size;
      else if (sortKey === "mtime") {
        cmp = (a.mtime || "").localeCompare(b.mtime || "");
      } else cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [entries, filter, sortKey, sortDir]);

  const selectedEntries = entries.filter((e) => selected.includes(e.path));

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function onItemClick(e: ReactMouseEvent, entry: Entry) {
    e.stopPropagation();
    setMenu(null);
    const now = Date.now();
    const last = lastClickRef.current;
    if (
      last &&
      last.path === entry.path &&
      now - last.at < 400 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey
    ) {
      lastClickRef.current = null;
      openEntry(entry);
      return;
    }
    lastClickRef.current = { path: entry.path, at: now };

    if (e.shiftKey && selected.length) {
      const paths = visible.map((x) => x.path);
      const from = paths.indexOf(selected[selected.length - 1]!);
      const to = paths.indexOf(entry.path);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        setSelected(paths.slice(a, b + 1));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) =>
        prev.includes(entry.path)
          ? prev.filter((p) => p !== entry.path)
          : [...prev, entry.path],
      );
      return;
    }
    setSelected([entry.path]);
  }

  function onContext(e: ReactMouseEvent, entry?: Entry) {
    e.preventDefault();
    e.stopPropagation();
    if (entry && !selected.includes(entry.path)) setSelected([entry.path]);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      path: entry?.path || cwd,
    });
  }

  async function openEntry(entry: Entry) {
    if (entry.isDirectory) {
      goTo(entry.path);
      return;
    }
    if (!isTextFile(entry.name) || entry.size > 2_000_000) {
      downloadPaths([entry.path]);
      return;
    }
    const res = await fetch(
      `/api/servers/${serverId}/files?mode=read&path=${encodeURIComponent(entry.path)}`,
    );
    const data = await res.json();
    if (!res.ok) {
      onMessage(data.error || "Cannot open file");
      return;
    }
    setEditor({ path: entry.path, content: data.content ?? "" });
  }

  async function saveEditor() {
    if (!editor) return;
    setSaving(true);
    const res = await fetch(`/api/servers/${serverId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: editor.path, content: editor.content }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) onMessage(data.error || "Save failed");
    else onMessage("File saved");
  }

  async function removeSelected(paths = selected) {
    if (!paths.length) return;
    const label =
      paths.length === 1 ? basename(paths[0]!) : `${paths.length} items`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    for (const path of paths) {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(data.error || "Delete failed");
        return;
      }
    }
    if (editor && paths.some((p) => editor.path === p || editor.path.startsWith(p + "/"))) {
      setEditor(null);
    }
    setSelected([]);
    reload();
  }

  async function submitCreate() {
    const name = newName.trim();
    if (!name || name.includes("/") || name.includes("\\")) {
      onMessage("Invalid name");
      return;
    }
    const path = joinPath(cwd, name);
    if (creating === "folder") {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(data.error || "Could not create folder");
        return;
      }
    } else {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(data.error || "Could not create file");
        return;
      }
    }
    setCreating(null);
    setNewName("");
    reload();
  }

  async function submitRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name || name.includes("/") || name.includes("\\")) {
      onMessage("Invalid name");
      return;
    }
    const to = joinPath(cwd, name);
    if (to === renaming) {
      setRenaming(null);
      return;
    }
    const res = await fetch(`/api/servers/${serverId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", from: renaming, to }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onMessage(data.error || "Rename failed");
      return;
    }
    setRenaming(null);
    setSelected([to]);
    reload();
  }

  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    for (const file of files) {
      const form = new FormData();
      form.set("action", "upload");
      form.set("path", cwd);
      form.set("file", file);
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: "PUT",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(data.error || `Upload failed: ${file.name}`);
        return;
      }
    }
    onMessage(
      files.length === 1 ? `Uploaded ${files[0]!.name}` : `Uploaded ${files.length} files`,
    );
    reload();
  }

  function downloadPaths(paths: string[]) {
    for (const path of paths) {
      const entry = entries.find((e) => e.path === path);
      if (entry?.isDirectory) continue;
      const a = document.createElement("a");
      a.href = `/api/servers/${serverId}/files?mode=download&path=${encodeURIComponent(path)}`;
      a.download = basename(path);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  function copySelected() {
    if (!selected.length) return;
    setClip({ mode: "copy", paths: selected });
    onMessage(
      selected.length === 1 ? "Copied" : `${selected.length} items copied`,
    );
  }

  function cutSelected() {
    if (!selected.length) return;
    setClip({ mode: "cut", paths: selected });
    onMessage(
      selected.length === 1 ? "Cut" : `${selected.length} items cut`,
    );
  }

  async function pasteClip() {
    if (!clip?.paths.length) return;
    for (const from of clip.paths) {
      const dest = joinPath(cwd, basename(from));
      if (clip.mode === "copy") {
        const res = await fetch(`/api/servers/${serverId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "copy", from, to: dest }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(data.error || "Paste failed");
          return;
        }
      } else {
        if (from === dest) continue;
        const res = await fetch(`/api/servers/${serverId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", from, to: dest }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(data.error || "Move failed");
          return;
        }
      }
    }
    if (clip.mode === "cut") setClip(null);
    reload();
  }

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward();
    } else if (e.key === "Delete" && selected.length) {
      e.preventDefault();
      removeSelected();
    } else if (e.key === "F2" && selected.length === 1) {
      e.preventDefault();
      startRename(selected[0]!);
    } else if (e.key === "Enter" && selected.length === 1) {
      const entry = entries.find((x) => x.path === selected[0]);
      if (entry) openEntry(entry);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(visible.map((x) => x.path));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
      e.preventDefault();
      cutSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pasteClip();
    } else if (e.key === "Escape") {
      setSelected([]);
      setMenu(null);
      setCreating(null);
      setRenaming(null);
    }
  }

  function startRename(path: string) {
    setRenaming(path);
    setRenameValue(basename(path));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }

  const crumbs = breadcrumbs(cwd);
  const canUp = cwd !== ".";
  const downloadable = selectedEntries.filter((e) => !e.isDirectory);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKey}
      className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm outline-none focus-visible:border-accent"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <Tool
          label="Back"
          disabled={histIdx <= 0}
          onClick={goBack}
          icon={ChevronLeft}
        />
        <Tool
          label="Forward"
          disabled={histIdx >= history.length - 1}
          onClick={goForward}
          icon={ChevronRight}
        />
        <Tool
          label="Up"
          disabled={!canUp}
          onClick={() => goTo(parentPath(cwd))}
          icon={ArrowUp}
        />
        <Tool label="Refresh" onClick={() => reload()} icon={RefreshCw} spinning={loading} />
        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center">
              {i > 0 && <span className="px-0.5 text-muted/50">/</span>}
              <button
                type="button"
                className={cn(
                  "max-w-[10rem] truncate rounded-md px-1.5 py-0.5 hover:bg-card-elevated",
                  c.path === cwd ? "font-medium text-foreground" : "text-muted",
                )}
                onClick={() => goTo(c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <div className="relative w-full sm:w-44">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            className="h-8 bg-card-elevated py-1 pl-7 text-xs"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Tool
          label="List"
          active={view === "list"}
          onClick={() => setView("list")}
          icon={ListIcon}
        />
        <Tool
          label="Icons"
          active={view === "grid"}
          onClick={() => setView("grid")}
          icon={LayoutGrid}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setCreating("folder");
            setNewName("");
          }}
        >
          <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
          New folder
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setCreating("file");
            setNewName("");
          }}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          New file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          disabled={!downloadable.length}
          onClick={() => downloadPaths(downloadable.map((e) => e.path))}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={selected.length !== 1}
          onClick={() => selected[0] && startRename(selected[0])}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Rename
        </Button>
        <Button size="sm" variant="ghost" disabled={!selected.length} onClick={copySelected}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy
        </Button>
        <Button size="sm" variant="ghost" disabled={!selected.length} onClick={cutSelected}>
          <Scissors className="mr-1.5 h-3.5 w-3.5" />
          Cut
        </Button>
        <Button size="sm" variant="ghost" disabled={!clip} onClick={pasteClip}>
          <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
          Paste
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!selected.length}
          onClick={() => removeSelected()}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      <div
        className="relative min-h-[22rem] max-h-[32rem] overflow-auto"
        onClick={() => {
          setSelected([]);
          setMenu(null);
        }}
        onContextMenu={(e) => onContext(e)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
            Drop files to upload
          </div>
        )}

        {error && (
          <p className="m-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {view === "list" ? (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card-elevated/80 text-xs uppercase tracking-wide text-muted backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort("name")}>
                    Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden w-28 px-3 py-2 font-medium sm:table-cell">
                  <button type="button" onClick={() => toggleSort("size")}>
                    Size {sortKey === "size" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden w-44 px-3 py-2 font-medium md:table-cell">
                  <button type="button" onClick={() => toggleSort("mtime")}>
                    Modified {sortKey === "mtime" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {canUp && (
                <tr
                  className="cursor-pointer text-muted hover:bg-card-elevated"
                  onDoubleClick={() => goTo(parentPath(cwd))}
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(parentPath(cwd));
                  }}
                >
                  <td className="px-3 py-1.5" colSpan={3}>
                    <span className="inline-flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      ..
                    </span>
                  </td>
                </tr>
              )}
              {creating && (
                <tr>
                  <td className="px-3 py-1.5" colSpan={3}>
                    <CreateRow
                      kind={creating}
                      value={newName}
                      onChange={setNewName}
                      onSubmit={submitCreate}
                      onCancel={() => setCreating(null)}
                    />
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && !creating && !error && (
                <tr>
                  <td colSpan={3} className="px-3 py-16 text-center text-muted">
                    This folder is empty. Drop files here or create a folder.
                  </td>
                </tr>
              )}
              {visible.map((e) => (
                <tr
                  key={e.path}
                  className={cn(
                    "cursor-default select-none hover:bg-card-elevated",
                    selected.includes(e.path) && "bg-accent-soft",
                    clip?.mode === "cut" &&
                      clip.paths.includes(e.path) &&
                      "opacity-50",
                  )}
                  onClick={(ev) => onItemClick(ev, e)}
                  onContextMenu={(ev) => onContext(ev, e)}
                >
                  <td className="max-w-0 px-3 py-1.5">
                    {renaming === e.path ? (
                      <RenameRow
                        value={renameValue}
                        onChange={setRenameValue}
                        onSubmit={submitRename}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <span className="flex min-w-0 items-center gap-2">
                        <EntryGlyph entry={e} />
                        <span className="truncate font-medium">{e.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-1.5 text-muted sm:table-cell">
                    {e.isDirectory ? "—" : formatSize(e.size)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-1.5 text-muted md:table-cell">
                    {formatMtime(e.mtime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
            {creating && (
              <div className="col-span-full">
                <CreateRow
                  kind={creating}
                  value={newName}
                  onChange={setNewName}
                  onSubmit={submitCreate}
                  onCancel={() => setCreating(null)}
                />
              </div>
            )}
            {visible.map((e) => (
              <button
                key={e.path}
                type="button"
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border border-transparent p-3 text-center text-xs hover:border-border hover:bg-card-elevated",
                  selected.includes(e.path) && "border-accent bg-accent-soft",
                )}
                onClick={(ev) => onItemClick(ev, e)}
                onContextMenu={(ev) => onContext(ev, e)}
              >
                <span className="scale-150">
                  <EntryGlyph entry={e} />
                </span>
                {renaming === e.path ? (
                  <RenameRow
                    value={renameValue}
                    onChange={setRenameValue}
                    onSubmit={submitRename}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span className="w-full truncate">{e.name}</span>
                )}
              </button>
            ))}
            {!loading && visible.length === 0 && !creating && !error && (
              <p className="col-span-full py-16 text-center text-sm text-muted">
                This folder is empty. Drop files here or create a folder.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted">
        <span>
          {visible.length} item{visible.length === 1 ? "" : "s"}
          {selected.length ? ` · ${selected.length} selected` : ""}
          {clip ? ` · clipboard: ${clip.mode}` : ""}
        </span>
        <span>Double-click to open · Right-click for more</span>
      </div>

      {menu && (
        <ul
          className="fixed z-50 min-w-[11rem] overflow-hidden rounded-lg border border-border bg-card py-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            onClick={() => {
              const entry = entries.find((x) => x.path === menu.path);
              if (entry) openEntry(entry);
              setMenu(null);
            }}
          >
            Open
          </MenuItem>
          <MenuItem
            disabled={selected.length !== 1}
            onClick={() => {
              if (selected[0]) startRename(selected[0]);
              setMenu(null);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            onClick={() => {
              copySelected();
              setMenu(null);
            }}
          >
            Copy
          </MenuItem>
          <MenuItem
            onClick={() => {
              cutSelected();
              setMenu(null);
            }}
          >
            Cut
          </MenuItem>
          <MenuItem
            disabled={!clip}
            onClick={() => {
              pasteClip();
              setMenu(null);
            }}
          >
            Paste
          </MenuItem>
          <MenuItem
            disabled={!downloadable.length}
            onClick={() => {
              downloadPaths(downloadable.map((e) => e.path));
              setMenu(null);
            }}
          >
            Download
          </MenuItem>
          <MenuItem
            danger
            onClick={() => {
              removeSelected();
              setMenu(null);
            }}
          >
            Delete
          </MenuItem>
        </ul>
      )}

      <Modal
        open={Boolean(editor)}
        title={editor ? basename(editor.path) : "Edit file"}
        description={editor?.path}
        wide
        maximizable
        fill
        maximized={editorMaximized}
        onMaximizedChange={setEditorMaximized}
        onClose={() => {
          setEditor(null);
          setEditorMaximized(false);
        }}
        actions={
          <Button size="sm" disabled={saving} onClick={saveEditor}>
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      >
        {editor && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden rounded-lg border border-border",
                !editorMaximized && "min-h-[28rem]",
              )}
            >
              <FileCodeEditor
                value={editor.content}
                filename={editor.path}
                height="100%"
                className="h-full [&_.cm-editor]:h-full [&_.cm-editor]:min-h-[inherit]"
                onChange={(content) =>
                  setEditor((cur) => (cur ? { ...cur, content } : cur))
                }
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Tool({
  label,
  icon: Icon,
  onClick,
  disabled,
  active,
  spinning,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-card-elevated hover:text-foreground disabled:opacity-30",
        active && "bg-accent-soft text-accent",
      )}
    >
      <Icon className={cn("h-4 w-4", spinning && "animate-spin")} />
    </button>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "w-full px-3 py-1.5 text-left disabled:opacity-40",
          danger ? "text-danger hover:bg-danger/10" : "hover:bg-card-elevated",
        )}
      >
        {children}
      </button>
    </li>
  );
}

function CreateRow({
  kind,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  kind: "folder" | "file";
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {kind === "folder" ? (
        <Folder className="h-4 w-4 text-accent" />
      ) : (
        <FileText className="h-4 w-4 text-muted" />
      )}
      <Input
        autoFocus
        className="h-8 max-w-xs py-1"
        placeholder={kind === "folder" ? "Folder name" : "file.txt"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" type="submit">
        Create
      </Button>
      <button type="button" className="text-muted" onClick={onCancel}>
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}

function RenameRow({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Input
        autoFocus
        className="h-7 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onSubmit}
      />
    </form>
  );
}
