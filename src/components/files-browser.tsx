"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";

type Entry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime?: string;
};

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function breadcrumbs(cwd: string) {
  if (!cwd || cwd === ".") return [{ label: "root", path: "." }];
  const parts = cwd.split("/").filter(Boolean);
  const crumbs = [{ label: "root", path: "." }];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    crumbs.push({ label: p, path: acc });
  }
  return crumbs;
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
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [reload]);

  async function openFile(path: string) {
    setSelectedFile(path);
    const res = await fetch(
      `/api/servers/${serverId}/files?mode=read&path=${encodeURIComponent(path)}`,
    );
    const data = await res.json();
    if (!res.ok) {
      onMessage(data.error || "Cannot open file");
      setFileContent("");
      return;
    }
    setFileContent(data.content ?? "");
  }

  async function saveFile() {
    if (!selectedFile) return;
    const res = await fetch(`/api/servers/${serverId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile, content: fileContent }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) onMessage(data.error || "Save failed");
    else onMessage("File saved");
  }

  async function removeEntry(path: string) {
    if (!confirm(`Delete ${path}?`)) return;
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
    if (selectedFile === path || selectedFile.startsWith(path + "/")) {
      setSelectedFile("");
      setFileContent("");
    }
    reload();
  }

  async function mkdir() {
    const name = newFolder.trim();
    if (!name) return;
    const path = cwd === "." ? name : `${cwd}/${name}`;
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
    setNewFolder("");
    reload();
  }

  async function upload(file: File) {
    const form = new FormData();
    form.set("action", "upload");
    form.set("path", cwd);
    form.set("file", file);
    const res = await fetch(`/api/servers/${serverId}/files`, {
      method: "PUT",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) onMessage(data.error || "Upload failed");
    else {
      onMessage(`Uploaded ${file.name}`);
      reload();
    }
  }

  const crumbs = breadcrumbs(cwd);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted">/</span>}
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-card-elevated hover:text-accent"
                onClick={() => setCwd(c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => reload()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-[180px]"
            placeholder="New folder"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                mkdir();
              }
            }}
          />
          <Button size="sm" variant="secondary" onClick={mkdir}>
            Create folder
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload
          </Button>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <ul className="max-h-[28rem] divide-y divide-border overflow-auto rounded-lg border border-border">
          {loading && (
            <li className="px-3 py-8 text-center text-sm text-muted">
              Loading…
            </li>
          )}
          {!loading && entries.length === 0 && !error && (
            <li className="px-3 py-8 text-center text-sm text-muted">
              This folder is empty. Upload a file or create a folder — game data
              appears here after the server has written files.
            </li>
          )}
          {!loading &&
            entries.map((e) => (
              <li
                key={e.path}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-card-elevated"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => {
                    if (e.isDirectory) setCwd(e.path);
                    else openFile(e.path);
                  }}
                >
                  <span className="mr-2 text-muted">
                    {e.isDirectory ? "DIR" : "FILE"}
                  </span>
                  <span className="font-medium">{e.name}</span>
                  {!e.isDirectory && (
                    <span className="ml-2 text-xs text-muted">
                      {formatSize(e.size)}
                    </span>
                  )}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeEntry(e.path)}
                >
                  Delete
                </Button>
              </li>
            ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <div>
          <Label className="mb-0">
            {selectedFile || "Select a file to edit"}
          </Label>
          {selectedFile && (
            <p className="text-xs text-muted">Text files up to 2 MB</p>
          )}
        </div>
        <textarea
          className="h-[28rem] w-full rounded-lg border border-border bg-[#06090e] p-3 font-mono text-xs"
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          disabled={!selectedFile}
          spellCheck={false}
          placeholder="Open a text file from the list"
        />
        <Button size="sm" disabled={!selectedFile} onClick={saveFile}>
          Save file
        </Button>
      </Card>
    </div>
  );
}
