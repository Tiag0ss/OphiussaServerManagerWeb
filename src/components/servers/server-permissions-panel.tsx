"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Label, Select } from "@/components/ui/field";

type PermRow = {
  userId: string;
  canStart: boolean;
  canStop: boolean;
  canConsole: boolean;
  canFiles: boolean;
  canMods: boolean;
  canBackup: boolean;
  canSettings: boolean;
};

type UserOpt = { id: string; email: string; name: string };

export function ServerPermissionsPanel({ serverId }: { serverId: string }) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [rows, setRows] = useState<PermRow[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/permissions`)
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        setRows(
          (d.permissions ?? []).map((p: PermRow & { id: string }) => ({
            userId: p.userId,
            canStart: p.canStart,
            canStop: p.canStop,
            canConsole: p.canConsole,
            canFiles: p.canFiles,
            canMods: p.canMods,
            canBackup: p.canBackup,
            canSettings: p.canSettings,
          })),
        );
      });
  }, [serverId]);

  async function save(next: PermRow[]) {
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/servers/${serverId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMessage(j.error || "Save failed");
      return;
    }
    setRows(next);
    setMessage("Permissions saved");
  }

  function addUser() {
    if (!addUserId || rows.some((r) => r.userId === addUserId)) return;
    const next = [
      ...rows,
      {
        userId: addUserId,
        canStart: true,
        canStop: true,
        canConsole: true,
        canFiles: true,
        canMods: false,
        canBackup: false,
        canSettings: false,
      },
    ];
    void save(next);
    setAddUserId("");
  }

  const flags = [
    ["canStart", "Start"],
    ["canStop", "Stop"],
    ["canConsole", "Console"],
    ["canFiles", "Files"],
    ["canMods", "Mods"],
    ["canBackup", "Backup"],
    ["canSettings", "Settings"],
  ] as const;

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-medium">Shared access</h3>
        <p className="text-sm text-muted">
          Grant other panel users access to this server with granular permissions.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select
          className="min-w-[12rem] flex-1"
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
        >
          <option value="">Select user…</option>
          {users
            .filter((u) => !rows.some((r) => r.userId === u.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
        </Select>
        <Button type="button" variant="secondary" onClick={addUser} disabled={!addUserId || busy}>
          Add user
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted">No shared users yet.</p>
      )}
      {rows.map((row) => {
        const user = users.find((u) => u.id === row.userId);
        return (
          <div
            key={row.userId}
            className="rounded-lg border border-border bg-card-elevated/40 p-3 space-y-2"
          >
            <p className="text-sm font-medium">
              {user?.name ?? row.userId}{" "}
              <span className="font-normal text-muted">({user?.email})</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {flags.map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={row[key]}
                    onChange={(e) => {
                      const next = rows.map((r) =>
                        r.userId === row.userId
                          ? { ...r, [key]: e.target.checked }
                          : r,
                      );
                      setRows(next);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => save(rows)}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => save(rows.filter((r) => r.userId !== row.userId))}
              >
                Remove
              </Button>
            </div>
          </div>
        );
      })}
      {message && <p className="text-sm text-muted">{message}</p>}
    </Card>
  );
}
