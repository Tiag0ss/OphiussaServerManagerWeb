"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";

export function ServerTransferPanel({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [cloneName, setCloneName] = useState("");
  const [copyData, setCopyData] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function clone() {
    if (!cloneName.trim()) return;
    setBusy("clone");
    setMessage("");
    const res = await fetch(`/api/servers/${serverId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cloneName.trim(), copyData, start: true }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setMessage(j.error || "Clone failed");
      return;
    }
    router.push(`/servers/${j.id}`);
    router.refresh();
  }

  async function exportJson() {
    setBusy("export");
    const res = await fetch(`/api/servers/${serverId}/export`);
    const j = await res.json();
    setBusy("");
    if (!res.ok) {
      setMessage(j.error || "Export failed");
      return;
    }
    const blob = new Blob([JSON.stringify(j, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${j.server?.name ?? "server"}-export.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage("Export downloaded");
  }

  async function updateImage() {
    setBusy("update");
    setMessage("");
    const res = await fetch(`/api/servers/${serverId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-image" }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    setMessage(res.ok ? "Image updated and server restarted" : j.error || "Update failed");
  }

  async function importJson(file: File) {
    setBusy("import");
    setMessage("");
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const res = await fetch("/api/servers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessage(j.error || "Import failed");
        return;
      }
      router.push(`/servers/${j.id}`);
      router.refresh();
    } catch {
      setMessage("Invalid JSON file");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-medium">Clone & transfer</h3>
        <p className="text-sm text-muted">
          Duplicate this server or export/import configuration (not world data in export).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Clone as</Label>
          <Input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            placeholder="New server name"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={copyData}
              onChange={(e) => setCopyData(e.target.checked)}
            />
            Copy world / save data
          </label>
          <Button
            className="mt-2"
            size="sm"
            disabled={busy === "clone" || !cloneName.trim()}
            onClick={clone}
          >
            Clone server
          </Button>
        </div>
        <div className="space-y-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={exportJson}
          >
            Export JSON
          </Button>
          <div>
            <Label className="text-xs">Import JSON</Label>
            <Input
              type="file"
              accept="application/json,.json"
              className="mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy === "update"}
            onClick={updateImage}
          >
            Pull latest image & restart
          </Button>
        </div>
      </div>
      {message && <p className="text-sm text-muted">{message}</p>}
    </Card>
  );
}
