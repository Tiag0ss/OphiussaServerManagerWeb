"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FilesBrowser } from "@/components/files-browser";
import { TemplateForm } from "@/components/template-form";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/field";
import { CopyJoinButton } from "@/components/copy-join-button";
import { joinAddress } from "@/lib/join-address";
import { syncSharedHostPorts } from "@/lib/port-share";
import type { GameTemplate } from "@/lib/templates/types";

type QuotaHeadroom = {
  maxServers: number;
  maxMemoryMb: number;
  maxCpu: number;
  remainingMemoryMb: number;
  remainingCpu: number;
};

type ServerPayload = {
  server: {
    id: string;
    name: string;
    status: string;
    templateId: string;
    memoryMb: number;
    cpuLimit: number;
    ftpUsername?: string | null;
    ftpEnabled: boolean;
    config: Record<string, unknown>;
  };
  template: GameTemplate;
  ports: Array<{
    key: string;
    hostPort: number;
    containerPort?: number;
    protocol: string;
  }>;
  stats: {
    cpuPercent: number;
    memoryMb: number;
    memoryLimitMb: number;
  } | null;
  quotas: QuotaHeadroom | null;
  portRange?: { start: number; end: number };
  containerName?: string;
  ownerName?: string;
  dockerNetwork?: string;
  dockerSocket?: string;
  isAdmin?: boolean;
  publicIp: string;
  ftpPort?: number;
  sftpPort?: number;
};

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ServerPayload | null>(null);
  const [tab, setTab] = useState<
    | "overview"
    | "config"
    | "console"
    | "files"
    | "mods"
    | "backups"
    | "schedules"
    | "danger"
  >("overview");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [logs, setLogs] = useState("");
  const [command, setCommand] = useState("");
  const [memoryMb, setMemoryMb] = useState(2048);
  const [cpuLimit, setCpuLimit] = useState(1);
  const [portDraft, setPortDraft] = useState<Record<string, number>>({});
  const [resourceBusy, setResourceBusy] = useState(false);
  const [consoleRef, setConsoleRef] = useState<HTMLPreElement | null>(null);
  const [mods, setMods] = useState<
    Array<{
      id: string;
      name: string;
      provider: string;
      version?: string;
      externalId?: string;
    }>
  >([]);
  const [modQuery, setModQuery] = useState("");
  const [modResults, setModResults] = useState<
    Array<{
      id: string;
      name: string;
      provider: string;
      summary?: string;
      version?: string;
    }>
  >([]);
  const [modSearchBusy, setModSearchBusy] = useState(false);
  const [modInstallBusy, setModInstallBusy] = useState<string | null>(null);
  const [backups, setBackups] = useState<
    Array<{
      id: string;
      label?: string;
      sizeBytes: number;
      createdAt: string;
    }>
  >([]);
  const [scheduleList, setScheduleList] = useState<
    Array<{ id: string; name: string; cron: string; action: string }>
  >([]);
  const [confirmName, setConfirmName] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${id}`);
    if (!res.ok) return;
    const json = (await res.json()) as ServerPayload;
    setData(json);
    setConfig(json.server.config);
    setMemoryMb(json.server.memoryMb);
    setCpuLimit(json.server.cpuLimit);
    const draft: Record<string, number> = {};
    for (const p of json.ports || []) draft[p.key] = p.hostPort;
    setPortDraft(draft);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (tab !== "console") return;
    const es = new EventSource(`/api/servers/${id}/logs`);
    es.onmessage = (ev) => {
      try {
        const line = JSON.parse(ev.data) as string;
        setLogs((prev) => (prev + line).slice(-50000));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [tab, id]);

  useEffect(() => {
    if (!consoleRef) return;
    consoleRef.scrollTop = consoleRef.scrollHeight;
  }, [logs, consoleRef]);

  useEffect(() => {
    if (tab !== "mods") return;
    fetch(`/api/servers/${id}/mods`)
      .then((r) => r.json())
      .then((d) => setMods(d.mods || []));
  }, [tab, id]);

  useEffect(() => {
    if (tab !== "backups") return;
    fetch(`/api/servers/${id}/backups`)
      .then((r) => r.json())
      .then((d) => setBackups(d.backups || []));
  }, [tab, id]);

  useEffect(() => {
    if (tab !== "schedules") return;
    fetch(`/api/servers/${id}/schedules`)
      .then((r) => r.json())
      .then((d) => setScheduleList(d.schedules || []));
  }, [tab, id]);

  async function action(act: string) {
    setMessage("");
    const res = await fetch(`/api/servers/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    const json = await res.json();
    if (!res.ok) setMessage(json.error || "Failed");
    else if (json.ftpPassword) {
      setMessage(
        `FTP password reset: ${json.ftpUsername} / ${json.ftpPassword}`,
      );
    } else {
      setMessage("Done");
      load();
    }
  }

  async function saveConfig() {
    const res = await fetch(`/api/servers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, recreate: true }),
    });
    if (!res.ok) {
      const j = await res.json();
      setMessage(j.error || "Save failed");
    } else {
      setMessage("Saved and container recreated");
      load();
    }
  }

  async function saveResources() {
    setResourceBusy(true);
    setMessage("");
    const res = await fetch(`/api/servers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryMb, cpuLimit }),
    });
    const j = await res.json().catch(() => ({}));
    setResourceBusy(false);
    if (!res.ok) {
      setMessage(j.error || "Could not update resources");
      return;
    }
    setMessage(
      j.recreated
        ? "Resources updated — container recreated"
        : "Resources updated",
    );
    load();
  }

  async function wipe() {
    const res = await fetch(`/api/servers/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    if (!res.ok) {
      const j = await res.json();
      setMessage(j.error || "Delete failed");
      return;
    }
    router.push("/servers");
    router.refresh();
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const tabs = [
    "overview",
    "config",
    "console",
    "files",
    "mods",
    "backups",
    "schedules",
    "danger",
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            <Link href="/servers" className="hover:underline">
              Servers
            </Link>{" "}
            / {data.server.name}
          </p>
          <h2 className="text-2xl font-semibold">{data.server.name}</h2>
          <p className="text-sm text-muted">
            {data.template.name}
            {data.ownerName ? ` · owner ${data.ownerName}` : ""} ·{" "}
            {data.server.status}
            {data.stats
              ? ` · CPU ${data.stats.cpuPercent}% · RAM ${data.stats.memoryMb} MB`
              : ""}
          </p>
          {data.containerName && (
            <p className="font-mono text-xs text-muted">
              docker: {data.containerName}
              {data.dockerNetwork ? ` · net ${data.dockerNetwork}` : ""}
            </p>
          )}
          {data.dockerSocket && (
            <p className="text-xs text-muted" title={data.dockerSocket}>
              Engine socket: {data.dockerSocket.replace(/^\/home\/[^/]+/, "~")}
              {data.dockerSocket.includes("desktop")
                ? " (Docker Desktop)"
                : " (system Engine — use: docker context use default)"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyJoinButton
            address={joinAddress(data.publicIp, data.ports)}
          />
          <Button size="sm" onClick={() => action("start")}>
            Start
          </Button>
          <Button size="sm" variant="secondary" onClick={() => action("stop")}>
            Stop
          </Button>
          <Button size="sm" variant="secondary" onClick={() => action("restart")}>
            Restart
          </Button>
          <Button size="sm" variant="danger" onClick={() => action("kill")}>
            Kill
          </Button>
        </div>
      </div>

      {message && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? "bg-accent text-accent-fg"
                : "bg-card-elevated text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <div>
              <h3 className="font-medium">Network / ports</h3>
              <p className="text-sm text-muted">
                Connect using the host ports below (not the container ports).
                {data.portRange
                  ? ` Allowed range ${data.portRange.start}–${data.portRange.end}.`
                  : ""}{" "}
                Changing ports recreates the container.
              </p>
            </div>
            <ul className="space-y-2 text-sm">
              {data.ports.map((p) => (
                <li key={p.key} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[5rem] font-medium">{p.key}</span>
                  <span className="text-muted">
                    {data.publicIp || "host"}:
                  </span>
                  <Input
                    className="w-28"
                    type="number"
                    value={portDraft[p.key] ?? p.hostPort}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setPortDraft((prev) =>
                        syncSharedHostPorts(
                          data.template.runtime.ports,
                          prev,
                          p.key,
                          value,
                        ),
                      );
                    }}
                  />
                  <span className="text-xs text-muted">/{p.protocol}</span>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              disabled={resourceBusy}
              onClick={async () => {
                setResourceBusy(true);
                setMessage("");
                const res = await fetch(`/api/servers/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ports: portDraft }),
                });
                const j = await res.json().catch(() => ({}));
                setResourceBusy(false);
                if (!res.ok) setMessage(j.error || "Port update failed");
                else {
                  setMessage("Ports updated — container recreated");
                  load();
                }
              }}
            >
              Apply ports
            </Button>
          </Card>
          <Card>
            <h3 className="font-medium">FTP / SFTP</h3>
            <p className="mt-2 text-sm text-muted">
              User: <code>{data.server.ftpUsername}</code>
              <br />
              Ports: FTP {data.ftpPort ?? 2121} · SFTP {data.sftpPort ?? 2022}
              <br />
              Enabled: {data.server.ftpEnabled ? "yes" : "no"}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={() => action("reset-ftp-password")}
            >
              Reset password
            </Button>
          </Card>
          <Card className="md:col-span-2 space-y-3">
            <div>
              <h3 className="font-medium">Resources</h3>
              <p className="text-sm text-muted">
                Changing RAM or CPU recreates the container. Limits follow the
                owner&apos;s quota
                {data.quotas
                  ? ` (up to ${data.server.memoryMb + data.quotas.remainingMemoryMb} MB RAM · ${data.server.cpuLimit + data.quotas.remainingCpu} CPU available for this server)`
                  : data.isAdmin
                    ? " (admin — no quota cap)"
                    : ""}
                .
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>RAM (MB)</Label>
                <Input
                  type="number"
                  min={256}
                  step={256}
                  max={
                    data.quotas
                      ? data.server.memoryMb + data.quotas.remainingMemoryMb
                      : undefined
                  }
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>CPU limit</Label>
                <Input
                  type="number"
                  min={0.25}
                  step={0.25}
                  max={
                    data.quotas
                      ? data.server.cpuLimit + data.quotas.remainingCpu
                      : undefined
                  }
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={saveResources}
                disabled={
                  resourceBusy ||
                  (memoryMb === data.server.memoryMb &&
                    cpuLimit === data.server.cpuLimit)
                }
              >
                {resourceBusy ? "Applying…" : "Apply resources"}
              </Button>
              <Button
                variant="secondary"
                disabled={resourceBusy}
                onClick={async () => {
                  setResourceBusy(true);
                  setMessage("");
                  const res = await fetch(`/api/servers/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ recreate: true }),
                  });
                  const j = await res.json().catch(() => ({}));
                  setResourceBusy(false);
                  if (!res.ok) setMessage(j.error || "Recreate failed");
                  else {
                    setMessage("Container recreated — you can Start again");
                    load();
                  }
                }}
              >
                Recreate container
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "config" && (
        <Card className="space-y-4">
          <TemplateForm
            template={data.template}
            value={config}
            onChange={setConfig}
            mode="all"
          />
          <Button onClick={saveConfig}>Save & recreate container</Button>
        </Card>
      )}

      {tab === "console" && (
        <Card className="space-y-3">
          <pre
            ref={setConsoleRef}
            className="h-80 overflow-auto rounded-lg border border-border bg-[#06090e] p-3 font-mono text-xs text-ok"
          >
            {logs || "Waiting for logs…"}
          </pre>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await fetch(`/api/servers/${id}/console`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command }),
              });
              setCommand("");
            }}
          >
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="RCON command"
            />
            <Button type="submit">Send</Button>
          </form>
        </Card>
      )}

      {tab === "files" && (
        <FilesBrowser serverId={id} onMessage={setMessage} />
      )}

      {tab === "mods" && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-medium">How to install</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>
                For Valheim Thunderstore mods, enable <strong>BepInEx</strong> in
                Config (and recreate the container once).
              </li>
              <li>
                Type part of the mod name (e.g. <code>jotunn</code> or{" "}
                <code>craft</code>) and click Search.
              </li>
              <li>
                Click <strong>Install</strong> on a result — the package is
                downloaded from Thunderstore and extracted into the server data
                folder.
              </li>
              <li>Restart the server so the game loads the new plugins.</li>
            </ol>
            <p className="mt-3 text-sm text-muted">
              Sources:{" "}
              {(data.template.mods?.providers || []).length
                ? (data.template.mods?.providers || [])
                    .map((p) =>
                      p === "steam-workshop"
                        ? "Steam Workshop (paste numeric file ID)"
                        : p === "thunderstore"
                          ? `Thunderstore (${data.template.mods?.thunderstoreNamespace || "community"})`
                          : "CurseForge",
                    )
                    .join(" · ")
                : "none configured"}
            </p>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">Installed</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!modInstallBusy || mods.length === 0}
                  onClick={async () => {
                    setModInstallBusy("all");
                    setMessage("Reinstalling all mods…");
                    try {
                      const res = await fetch(`/api/servers/${id}/mods`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "reinstall-all" }),
                        signal: AbortSignal.timeout(180_000),
                      });
                      const j = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setMessage(j.error || "Reinstall failed");
                        return;
                      }
                      const list = await fetch(`/api/servers/${id}/mods`).then(
                        (x) => x.json(),
                      );
                      setMods(list.mods || []);
                      setMessage(
                        "Mods reinstalled. Restart the server to load them.",
                      );
                    } catch (e) {
                      setMessage(
                        e instanceof Error ? e.message : "Reinstall failed",
                      );
                    } finally {
                      setModInstallBusy(null);
                    }
                  }}
                >
                  {modInstallBusy === "all" ? "Reinstalling…" : "Reinstall all"}
                </Button>
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {mods.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>
                    {m.name}{" "}
                    <span className="text-muted">
                      ({m.provider}
                      {m.version ? ` · v${m.version}` : ""})
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!modInstallBusy}
                      onClick={async () => {
                        setModInstallBusy(m.id);
                        setMessage(`Reinstalling ${m.name}…`);
                        try {
                          const res = await fetch(`/api/servers/${id}/mods`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "reinstall",
                              modId: m.id,
                            }),
                            signal: AbortSignal.timeout(120_000),
                          });
                          const j = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            setMessage(j.error || "Reinstall failed");
                            return;
                          }
                          const list = await fetch(
                            `/api/servers/${id}/mods`,
                          ).then((x) => x.json());
                          setMods(list.mods || []);
                          setMessage(
                            `Reinstalled ${m.name}. Restart the server to load it.`,
                          );
                        } catch (e) {
                          setMessage(
                            e instanceof Error ? e.message : "Reinstall failed",
                          );
                        } finally {
                          setModInstallBusy(null);
                        }
                      }}
                    >
                      {modInstallBusy === m.id ? "…" : "Reinstall"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!modInstallBusy}
                      onClick={async () => {
                        await fetch(`/api/servers/${id}/mods`, {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ modId: m.id }),
                        });
                        setMods((prev) => prev.filter((x) => x.id !== m.id));
                      }}
                    >
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
              {mods.length === 0 && (
                <li className="text-muted">No mods installed yet</li>
              )}
            </ul>
          </Card>
          <Card className="space-y-3">
            <h3 className="font-medium">Search / install</h3>
            <div className="flex gap-2">
              <Input
                value={modQuery}
                onChange={(e) => setModQuery(e.target.value)}
                placeholder="e.g. jotunn, craftfromcontainers, or Steam Workshop ID"
                disabled={modSearchBusy || !!modInstallBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (
                      e.currentTarget.parentElement?.querySelector(
                        "button",
                      ) as HTMLButtonElement | null
                    )?.click();
                  }
                }}
              />
              <Button
                disabled={modSearchBusy || !!modInstallBusy}
                onClick={async () => {
                  setMessage("");
                  const providers = data.template.mods?.providers || [];
                  if (!providers.length) {
                    setMessage("This template has no mod providers");
                    return;
                  }
                  setModSearchBusy(true);
                  setModResults([]);
                  try {
                    const all = [];
                    const errors: string[] = [];
                    for (const p of providers) {
                      const res = await fetch(
                        `/api/servers/${id}/mods?provider=${p}&q=${encodeURIComponent(modQuery)}`,
                        { signal: AbortSignal.timeout(25_000) },
                      );
                      const j = await res.json().catch(() => ({}));
                      if (!res.ok) errors.push(j.error || p);
                      else all.push(...(j.results || []));
                    }
                    setModResults(all);
                    if (!all.length) {
                      setMessage(
                        errors[0] ||
                          "No results — try a shorter name, or a Steam Workshop file ID",
                      );
                    }
                  } catch (e) {
                    setMessage(
                      e instanceof Error && e.name === "TimeoutError"
                        ? "Search timed out — try again with a more specific name"
                        : e instanceof Error
                          ? e.message
                          : "Search failed",
                    );
                  } finally {
                    setModSearchBusy(false);
                  }
                }}
              >
                {modSearchBusy ? "Searching…" : "Search"}
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {modResults.map((r) => (
                <li
                  key={`${r.provider}-${r.id}`}
                  className="flex justify-between gap-2"
                >
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">
                      {r.provider}
                      {r.version ? ` · v${r.version}` : ""} —{" "}
                      {r.summary?.slice(0, 120)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={modSearchBusy || !!modInstallBusy}
                    onClick={async () => {
                      const key = `${r.provider}-${r.id}`;
                      setModInstallBusy(key);
                      setMessage(`Installing ${r.name}…`);
                      try {
                        const res = await fetch(`/api/servers/${id}/mods`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            provider: r.provider,
                            externalId: r.id,
                            name: r.name,
                            version: r.version,
                          }),
                          signal: AbortSignal.timeout(120_000),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setMessage(j.error || "Install failed");
                          return;
                        }
                        const list = await fetch(`/api/servers/${id}/mods`).then(
                          (x) => x.json(),
                        );
                        setMods(list.mods || []);
                        setMessage(
                          `Installed ${r.name}. Restart the server to load it.`,
                        );
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Install failed",
                        );
                      } finally {
                        setModInstallBusy(null);
                      }
                    }}
                  >
                    {modInstallBusy === `${r.provider}-${r.id}`
                      ? "Installing…"
                      : "Install"}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "backups" && (
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Backups include only saves and configs from the template (not the
            full game install). The server stays online when possible.
          </p>
          <Button
            onClick={async () => {
              setMessage("Creating backup…");
              const res = await fetch(`/api/servers/${id}/backups`, {
                method: "POST",
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) {
                setMessage(j.error || "Backup failed");
                return;
              }
              const list = await fetch(`/api/servers/${id}/backups`).then((r) =>
                r.json(),
              );
              setBackups(list.backups || []);
              const mb = ((j.sizeBytes || 0) / 1024 / 1024).toFixed(2);
              setMessage(
                `Backup created (${mb} MB${
                  j.entries?.length ? ` · ${j.entries.join(", ")}` : ""
                })`,
              );
            }}
          >
            Create backup
          </Button>
          <ul className="space-y-2 text-sm">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">
                    {b.label || `backup-${b.id}.tar.gz`}
                  </span>
                  <span className="text-muted">
                    {" "}
                    · {Math.round(b.sizeBytes / 1024)} KB ·{" "}
                    {new Date(b.createdAt).toLocaleString()}
                  </span>
                </span>
                <div className="flex shrink-0 gap-2">
                  <a
                    href={`/api/servers/${id}/backups/${b.id}/download`}
                    className="inline-flex items-center rounded-lg border border-border bg-card-elevated px-2.5 py-1.5 text-sm hover:border-accent/40"
                  >
                    Download
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await fetch(`/api/servers/${id}/backups`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "restore",
                          backupId: b.id,
                        }),
                      });
                      setMessage("Restored");
                    }}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await fetch(`/api/servers/${id}/backups`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ backupId: b.id }),
                      });
                      setBackups((prev) => prev.filter((x) => x.id !== b.id));
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "schedules" && (
        <Card className="space-y-3">
          <form
            className="grid gap-2 md:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await fetch(`/api/servers/${id}/schedules`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: fd.get("name"),
                  cron: fd.get("cron"),
                  action: fd.get("action"),
                }),
              });
              const list = await fetch(`/api/servers/${id}/schedules`).then(
                (r) => r.json(),
              );
              setScheduleList(list.schedules || []);
              e.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder="Name" required />
            <Input name="cron" placeholder="0 4 * * *" required />
            <select
              name="action"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              defaultValue="backup"
            >
              <option value="start">start</option>
              <option value="stop">stop</option>
              <option value="restart">restart</option>
              <option value="backup">backup</option>
            </select>
            <Button type="submit">Add</Button>
          </form>
          <ul className="space-y-2 text-sm">
            {scheduleList.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  {s.name} · <code>{s.cron}</code> · {s.action}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await fetch(`/api/servers/${id}/schedules`, {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ scheduleId: s.id }),
                    });
                    setScheduleList((prev) =>
                      prev.filter((x) => x.id !== s.id),
                    );
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "danger" && (
        <Card className="space-y-3 border-danger/40">
          <h3 className="font-medium text-danger">Delete server</h3>
          <p className="text-sm text-muted">
            This permanently removes the container, data folder, backups, FTP
            account and database record. Type the server name to confirm.
          </p>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={data.server.name}
          />
          <Button variant="danger" onClick={wipe}>
            Delete everything
          </Button>
        </Card>
      )}
    </div>
  );
}
