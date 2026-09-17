"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";

export function ServerTransferPanel({
  serverId,
  templateId,
}: {
  serverId: string;
  templateId: string;
}) {
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
      if (bundle?.server?.templateId && bundle.server.templateId !== templateId) {
        setMessage("This export is for a different game template");
        return;
      }
      const ports: Record<string, number> = {};
      for (const p of bundle.ports ?? []) ports[p.key] = p.hostPort;
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: bundle.server.config,
          memoryMb: bundle.server.memoryMb,
          cpuLimit: bundle.server.cpuLimit,
          ftpEnabled: bundle.server.ftpEnabled,
          ports,
          recreate: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessage(j.error || "Import failed");
        return;
      }
      setMessage("Configuration imported");
      router.refresh();
    } catch {
      setMessage("Invalid JSON file");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h3 className="font-medium">Clone server</h3>
          <p className="text-sm text-muted">
            Create a copy of this server under a new name.
          </p>
        </div>
        <Input
          value={cloneName}
          onChange={(e) => setCloneName(e.target.value)}
          placeholder="New server name"
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={copyData}
            onChange={(e) => setCopyData(e.target.checked)}
          />
          Copy world / save data
        </label>
        <Button
          size="sm"
          disabled={busy === "clone" || !cloneName.trim()}
          onClick={clone}
        >
          Clone server
        </Button>
      </Card>

      <Card className="space-y-3">
        <div>
          <h3 className="font-medium">Backup / restore configuration</h3>
          <p className="text-sm text-muted">
            Export this server&apos;s settings to a JSON file, or import one
            back to overwrite them. World/save data is never included; the
            container is recreated after an import.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={exportJson}
          >
            Export JSON
          </Button>
          <div className="min-w-[16rem] flex-1">
            <Label className="text-xs">Import JSON into this server</Label>
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
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h3 className="font-medium">Update game server image</h3>
          <p className="text-sm text-muted">
            Re-downloads the latest Docker image for this game and recreates
            the container. Causes a brief downtime; save/world data is kept.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy === "update"}
          onClick={updateImage}
        >
          Pull latest image & restart
        </Button>
      </Card>

      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
