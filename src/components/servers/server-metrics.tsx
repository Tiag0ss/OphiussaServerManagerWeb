"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendPoint,
  MetricChart,
  type MetricPoint,
  readRefreshSec,
  Sparkline,
} from "@/components/dashboard/metric-chart";

type ServerStats = {
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
};

export function ServerMetricsPanel({
  serverId,
  status,
  memoryLimitMb,
  cpuLimit,
}: {
  serverId: string;
  status: string;
  memoryLimitMb?: number;
  cpuLimit: number;
}) {
  const [refreshSec] = useState(() => readRefreshSec());
  const [cpuSeries, setCpuSeries] = useState<MetricPoint[]>([]);
  const [ramSeries, setRamSeries] = useState<MetricPoint[]>([]);
  const [ramMbSeries, setRamMbSeries] = useState<MetricPoint[]>([]);
  const [latest, setLatest] = useState<ServerStats | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/metrics`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.stats) {
      setLatest(data.stats);
      setCpuSeries((s) => appendPoint(s, data.stats.cpuPercent));
      setRamSeries((s) => appendPoint(s, data.stats.memoryPercent));
      setRamMbSeries((s) => appendPoint(s, data.stats.memoryMb));
    }
  }, [serverId]);

  useEffect(() => {
    if (status !== "running") return;
    poll();
    const id = setInterval(poll, refreshSec * 1000);
    return () => clearInterval(id);
  }, [poll, refreshSec, status]);

  const ramMax = useMemo(
    () =>
      Math.max(
        memoryLimitMb ?? 0,
        latest?.memoryLimitMb ?? 0,
        ...ramMbSeries.map((p) => p.v),
        256,
      ),
    [memoryLimitMb, latest, ramMbSeries],
  );

  if (status !== "running") {
    return (
      <p className="rounded-lg border border-border bg-card-elevated px-3 py-2 text-sm text-muted">
        Start the server to see live CPU and RAM charts.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MetricChart
        title="CPU"
        subtitle={`Limit ${cpuLimit} cores (container)`}
        series={cpuSeries}
        color="#3d9cfd"
        max={Math.max(100, cpuLimit * 100, ...cpuSeries.map((p) => p.v))}
        formatValue={(v) => `${v}%`}
      />
      <MetricChart
        title="RAM"
        subtitle={
          latest
            ? `${latest.memoryMb} / ${latest.memoryLimitMb} MB (${latest.memoryPercent}%)`
            : undefined
        }
        series={ramSeries}
        color="#7fd99a"
      />
      <MetricChart
        title="RAM (MB)"
        subtitle="Absolute usage"
        series={ramMbSeries}
        unit=" MB"
        max={ramMax}
        color="#56b6c2"
        formatValue={(v) => `${v} MB`}
        className="sm:col-span-2"
      />
    </div>
  );
}

export function ServerSparklines({
  cpuSeries,
  ramSeries,
  stats,
  status,
}: {
  cpuSeries: MetricPoint[];
  ramSeries: MetricPoint[];
  stats: ServerStats | null;
  status: string;
}) {
  if (status !== "running" || !stats) {
    return (
      <p className="text-xs text-muted">
        {status === "running" ? "Collecting…" : "Stopped"}
      </p>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
          <span>CPU</span>
          <span className="tabular-nums text-foreground">{stats.cpuPercent}%</span>
        </div>
        <Sparkline series={cpuSeries} color="#3d9cfd" height={36} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
          <span>RAM</span>
          <span className="tabular-nums text-foreground">
            {stats.memoryMb} MB
          </span>
        </div>
        <Sparkline series={ramSeries} color="#7fd99a" height={36} />
      </div>
    </div>
  );
}

/** Track per-server metric history from dashboard polls. */
export function useServerMetricHistories(
  serverIds: string[],
  refreshSec: number,
  enabled: boolean,
) {
  const [histories, setHistories] = useState<
    Record<string, { cpu: MetricPoint[]; ram: MetricPoint[]; stats: ServerStats | null }>
  >({});

  const poll = useCallback(async () => {
    const res = await fetch("/api/dashboard/metrics", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setHistories((prev) => {
      const next = { ...prev };
      for (const s of data.servers as Array<{
        id: string;
        status: string;
        stats: ServerStats | null;
      }>) {
        if (!serverIds.includes(s.id)) continue;
        const cur = next[s.id] ?? { cpu: [], ram: [], stats: null };
        next[s.id] = {
          cpu: s.stats ? appendPoint(cur.cpu, s.stats.cpuPercent) : cur.cpu,
          ram: s.stats ? appendPoint(cur.ram, s.stats.memoryPercent) : cur.ram,
          stats: s.stats,
        };
      }
      return next;
    });
  }, [serverIds]);

  useEffect(() => {
    if (!enabled || !serverIds.length) return;
    poll();
    const id = setInterval(poll, refreshSec * 1000);
    return () => clearInterval(id);
  }, [poll, refreshSec, enabled, serverIds]);

  return histories;
}
