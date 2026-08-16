"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  maxServers: number;
  maxMemoryMb: number;
  maxCpu: number;
  allowedTemplates: string[];
  usage: { servers: number; memoryMb: number; cpu: number };
};

type TemplateOpt = { id: string; name: string };

function TemplateCheckboxes({
  templates,
  selected,
}: {
  templates: TemplateOpt[];
  selected?: string[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      {templates.map((t) => (
        <label key={t.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allowedTemplates"
            value={t.id}
            defaultChecked={selected?.includes(t.id)}
          />
          {t.name}
        </label>
      ))}
      {templates.length === 0 && (
        <p className="text-muted">No templates installed</p>
      )}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [u, s, t] = await Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/servers").then((r) => r.json()),
      fetch("/api/templates").then((r) => r.json()),
    ]);
    if (u.error) throw new Error(u.error);
    setUsers(u.users || []);
    setServers(s.servers || []);
    setTemplates(
      (t.templates || []).map((x: TemplateOpt & { name: string }) => ({
        id: x.id,
        name: x.name,
      })),
    );
  }

  useEffect(() => {
    reload().catch(() => setMessage("Admin access required"));
  }, []);

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const allowed = fd.getAll("allowedTemplates").map(String);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        role: fd.get("role"),
        maxServers: Number(fd.get("maxServers")),
        maxMemoryMb: Number(fd.get("maxMemoryMb")),
        maxCpu: Number(fd.get("maxCpu")),
        allowedTemplates: allowed,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMessage(j.error || "Failed to create user");
      return;
    }
    setCreateOpen(false);
    setMessage("User created");
    reload();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const allowed = fd.getAll("allowedTemplates").map(String);
    const res = await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: editing.id,
        name: fd.get("name"),
        role: fd.get("role"),
        maxServers: Number(fd.get("maxServers")),
        maxMemoryMb: Number(fd.get("maxMemoryMb")),
        maxCpu: Number(fd.get("maxCpu")),
        allowedTemplates: allowed,
        password: fd.get("password") || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMessage(j.error || "Failed to update user");
      return;
    }
    setEditing(null);
    setMessage("User updated");
    reload();
  }

  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permission: {
          userId: fd.get("userId"),
          serverId: fd.get("serverId"),
          canStart: true,
          canStop: true,
          canConsole: true,
          canFiles: true,
          canMods: fd.get("canMods") === "on",
          canBackup: fd.get("canBackup") === "on",
          canSettings: fd.get("canSettings") === "on",
        },
      }),
    });
    setGrantOpen(false);
    setMessage("Server permission saved");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Users & quotas</h2>
          <p className="text-sm text-muted">
            Accounts, RAM/CPU/server limits, and which templates each user may use
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setGrantOpen(true)}>
            Grant access
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Add user</Button>
        </div>
      </div>

      {message && (
        <p className="rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm text-accent">
          {message}
        </p>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 pr-3 font-medium">User</th>
                <th className="pb-2 pr-3 font-medium">Role</th>
                <th className="pb-2 pr-3 font-medium">Servers</th>
                <th className="pb-2 pr-3 font-medium">RAM</th>
                <th className="pb-2 pr-3 font-medium">CPU</th>
                <th className="pb-2 pr-3 font-medium">Templates</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-3">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="py-3 pr-3 uppercase text-xs text-muted">
                    {u.role}
                  </td>
                  <td className="py-3 pr-3">
                    {u.usage.servers} / {u.maxServers}
                  </td>
                  <td className="py-3 pr-3">
                    {u.usage.memoryMb} / {u.maxMemoryMb} MB
                  </td>
                  <td className="py-3 pr-3">
                    {u.usage.cpu} / {u.maxCpu}
                  </td>
                  <td className="py-3 pr-3 text-xs text-muted">
                    {u.allowedTemplates.length === 0
                      ? "All"
                      : u.allowedTemplates.join(", ")}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(u)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Delete ${u.email}?`)) return;
                          const res = await fetch("/api/users", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: u.id }),
                          });
                          const j = await res.json();
                          if (!res.ok) setMessage(j.error || "Delete failed");
                          else reload();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={createOpen}
        title="Add user"
        description="Set account credentials and resource quotas"
        onClose={() => setCreateOpen(false)}
        wide
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createUser}>
          <div>
            <Label>Name</Label>
            <Input name="name" required />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div>
            <Label>Password</Label>
            <Input name="password" type="password" required minLength={8} />
          </div>
          <div>
            <Label>Role</Label>
            <Select name="role" defaultValue="user">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div>
            <Label>Max servers</Label>
            <Input name="maxServers" type="number" min={0} defaultValue={3} />
          </div>
          <div>
            <Label>Max RAM (MB)</Label>
            <Input
              name="maxMemoryMb"
              type="number"
              min={0}
              defaultValue={8192}
            />
          </div>
          <div>
            <Label>Max CPU</Label>
            <Input
              name="maxCpu"
              type="number"
              min={0}
              step={0.5}
              defaultValue={4}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Allowed templates (empty = all)</Label>
            <TemplateCheckboxes templates={templates} />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editing}
        title={editing ? `Edit ${editing.email}` : "Edit user"}
        description="Update quotas, role, or password"
        onClose={() => setEditing(null)}
        wide
      >
        {editing && (
          <form
            key={editing.id}
            className="grid gap-3 md:grid-cols-2"
            onSubmit={saveEdit}
          >
            <div>
              <Label>Name</Label>
              <Input name="name" defaultValue={editing.name} required />
            </div>
            <div>
              <Label>Role</Label>
              <Select name="role" defaultValue={editing.role}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <Label>Max servers</Label>
              <Input
                name="maxServers"
                type="number"
                min={0}
                defaultValue={editing.maxServers}
              />
            </div>
            <div>
              <Label>Max RAM (MB)</Label>
              <Input
                name="maxMemoryMb"
                type="number"
                min={0}
                defaultValue={editing.maxMemoryMb}
              />
            </div>
            <div>
              <Label>Max CPU</Label>
              <Input
                name="maxCpu"
                type="number"
                min={0}
                step={0.5}
                defaultValue={editing.maxCpu}
              />
            </div>
            <div>
              <Label>New password (optional)</Label>
              <Input name="password" type="password" minLength={8} />
            </div>
            <div className="md:col-span-2">
              <Label>Allowed templates (empty = all)</Label>
              <TemplateCheckboxes
                templates={templates}
                selected={editing.allowedTemplates}
              />
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={grantOpen}
        title="Grant server access"
        description="Share an existing server with another account"
        onClose={() => setGrantOpen(false)}
      >
        <form className="space-y-3" onSubmit={grant}>
          <div>
            <Label>User</Label>
            <Select name="userId" required>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Server</Label>
            <Select name="serverId" required>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="canMods" /> Mods
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="canBackup" /> Backups
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="canSettings" /> Settings
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setGrantOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save permission</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
