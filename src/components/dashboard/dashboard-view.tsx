"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Label, Select } from "@/components/ui/field";
import {
  appendPoint,
  MetricChart,
  type MetricPoint,
  readRefreshSec,
  REFRESH_OPTIONS,
  writeRefreshSec,
} from "@/components/dashboard/metric-chart";
import {
  findHeaviestServerId,
  ServerCardsGrid,
  ServerSortBar,
  type ServerMetricHistory,
  type ServerSortKey,
} from "@/components/servers/server-cards-grid";

type ServerRow = {
  id: string;
  name: string;
  templateId: string;
  status: string;
  memoryMb: number;
  cpuLimit: number;
  joinAddress: string | null;
  stats: {
    cpuPercent: number;
    memoryMb: number;
    memoryLimitMb: number;
    memoryPercent: number;
  } | null;
};

type MetricsPayload = {
  at: number;
  host: {
    cpuPercent: number | null;
    ram: {
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPercent: number;
    };
    disk: {
      totalMb: number;
      freeMb: number;
      usedMb: number;
      usedPercent: number;
      available: boolean;
    };
  };
  servers: ServerRow[];
  aggregate: {
    running: number;
    total: number;
    serversCpu: number;
    serversMemoryMb: number;
    serversMemoryPercent: number;
  };
};

export function DashboardView() {
  const [refreshSec, setRefreshSec] = useState(5);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<MetricsPayload | null>(null);
  const [cpuSeries, setCpuSeries] = useState<MetricPoint[]>([]);
  const [ramSeries, setRamSeries] = useState<MetricPoint[]>([]);
  const [diskSeries, setDiskSeries] = useState<MetricPoint[]>([]);
  const [serversCpuSeries, setServersCpuSeries] = useState<MetricPoint[]>([]);
  const [serversRamSeries, setServersRamSeries] = useState<MetricPoint[]>([]);
  const [serverHistories, setServerHistories] = useState<
    Record<string, ServerMetricHistory>
  >({});
  const [sort, setSort] = useState<ServerSortKey>("cpu");

  useEffect(() => {
    setRefreshSec(readRefreshSec());
  }, []);

  useEffect(() => {
    async function loadHistory() {
      const loads: Array<{
        scope: string;
        metric: string;
        set: (v: MetricPoint[]) => void;
      }> = [
        { scope: "host", metric: "cpu", set: setCpuSeries },
        { scope: "host", metric: "ram", set: setRamSeries },
        { scope: "host", metric: "disk", set: setDiskSeries },
        { scope: "aggregate", metric: "cpu", set: setServersCpuSeries },
        { scope: "aggregate", metric: "ram", set: setServersRamSeries },
      ];
      await Promise.all(
        loads.map(async ({ scope, metric, set }) => {
          const res = await fetch(
            `/api/metrics/history?scope=${scope}&metric=${metric}&hours=24`,
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data.series?.length) set(data.series);
        }),
      );
    }
    loadHistory();
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load metrics");
      const data = (await res.json()) as MetricsPayload;
      setSnapshot(data);
      setError("");
      setCpuSeries((s) => appendPoint(s, data.host.cpuPercent ?? undefined));
      setRamSeries((s) => appendPoint(s, data.host.ram.usedPercent));
      if (data.host.disk.available) {
        setDiskSeries((s) => appendPoint(s, data.host.disk.usedPercent));
      }
      setServersCpuSeries((s) =>
        appendPoint(s, data.aggregate.serversCpu),
      );
      setServersRamSeries((s) =>
        appendPoint(s, data.aggregate.serversMemoryPercent),
      );
      setServerHistories((prev) => {
        const next = { ...prev };
        for (const s of data.servers) {
          const cur = next[s.id] ?? { cpu: [], ram: [], stats: null };
          next[s.id] = {
            cpu: s.stats ? appendPoint(cur.cpu, s.stats.cpuPercent) : cur.cpu,
            ram: s.stats
              ? appendPoint(cur.ram, s.stats.memoryPercent)
              : cur.ram,
            stats: s.stats,
          };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metrics unavailable");
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    poll();
    const id = setInterval(poll, refreshSec * 1000);
    return () => clearInterval(id);
  }, [poll, refreshSec, paused]);

  function onRefreshChange(sec: number) {
    setRefreshSec(sec);
    writeRefreshSec(sec);
  }

  const running = snapshot?.aggregate.running ?? 0;
  const total = snapshot?.aggregate.total ?? 0;
  const servers = snapshot?.servers ?? [];
  const heaviestId = useMemo(
    () => findHeaviestServerId(servers, serverHistories),
    [servers, serverHistories],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Dashboard</h2>
          <p className="text-sm text-muted">
            {running} running · {total} total servers
            {snapshot && !paused && (
              <span className="text-muted/80">
                {" "}
                · updated {new Date(snapshot.at).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <div className="min-w-[8rem] flex-1 sm:flex-none">
            <Label className="text-xs text-muted">Refresh interval</Label>
            <Select
              className="mt-1"
              value={String(refreshSec)}
              onChange={(e) => onRefreshChange(Number(e.target.value))}
            >
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={() => setPaused((p) => !p)}
            className="flex-1 sm:flex-none"
          >
            {paused ? "Resume" : "Pause"}
          </Button>
          <Link href="/servers/new" className="flex-1 sm:flex-none">
            <Button className="w-full sm:w-auto">Create server</Button>
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricChart
          title="Host CPU"
          subtitle="VPS / panel machine"
          series={cpuSeries}
          color="#3d9cfd"
        />
        <MetricChart
          title="Host RAM"
          subtitle={
            snapshot
              ? `${snapshot.host.ram.usedMb} / ${snapshot.host.ram.totalMb} MB`
              : undefined
          }
          series={ramSeries}
          color="#7fd99a"
        />
        <MetricChart
          title="Disk"
          subtitle={
            snapshot?.host.disk.available
              ? `${snapshot.host.disk.usedMb} / ${snapshot.host.disk.totalMb} MB`
              : "Unavailable"
          }
          series={diskSeries}
          color="#e6c07b"
        />
        <MetricChart
          title="Game servers CPU"
          subtitle="Sum of running containers"
          series={serversCpuSeries}
          unit="%"
          max={Math.max(
            100,
            ...serversCpuSeries.map((p) => p.v),
            snapshot?.aggregate.serversCpu ?? 0,
          )}
          color="#c678dd"
          formatValue={(v) => `${v}%`}
        />
        <MetricChart
          title="Game servers RAM"
          subtitle={
            snapshot
              ? `${snapshot.aggregate.serversMemoryMb} MB · ${snapshot.aggregate.serversMemoryPercent}% of host`
              : "Running containers"
          }
          series={serversRamSeries}
          color="#56b6c2"
        />
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Snapshot
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Host RAM free</dt>
              <dd className="tabular-nums">
                {snapshot ? `${snapshot.host.ram.freeMb} MB` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Disk free</dt>
              <dd className="tabular-nums">
                {snapshot?.host.disk.available
                  ? `${snapshot.host.disk.freeMb} MB`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Containers running</dt>
              <dd className="tabular-nums">{running}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Poll interval</dt>
              <dd className="tabular-nums">{refreshSec}s</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Your servers</h3>
          {servers.length > 0 && (
            <ServerSortBar
              sort={sort}
              onSortChange={setSort}
              hint={`· refresh ${refreshSec}s`}
            />
          )}
        </div>
        {servers.length === 0 ? (
          <Card>
            <p className="py-2 text-sm text-muted">
              No servers yet. Create one from a game template.
            </p>
          </Card>
        ) : (
          <ServerCardsGrid
            servers={servers}
            histories={serverHistories}
            sort={sort}
            heaviestId={heaviestId}
          />
        )}
      </div>
    </div>
  );
}
