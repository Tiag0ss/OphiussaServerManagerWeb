import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { metricSamples } from "./db/schema";
import { getSettings } from "./settings";

type Scope = "host" | "server" | "aggregate";

export function recordMetric(
  scope: Scope,
  metric: string,
  value: number,
  serverId?: string,
) {
  if (Number.isNaN(value)) return;
  const db = getDb();
  db.insert(metricSamples)
    .values({
      scope,
      serverId: serverId ?? null,
      metric,
      value,
      sampledAt: new Date(),
    })
    .run();
}

export function recordHostMetrics(host: {
  cpuPercent: number | null;
  ram: { usedPercent: number };
  disk: { usedPercent: number; available: boolean };
}) {
  if (host.cpuPercent != null) {
    recordMetric("host", "cpu", host.cpuPercent);
  }
  recordMetric("host", "ram", host.ram.usedPercent);
  if (host.disk.available) {
    recordMetric("host", "disk", host.disk.usedPercent);
  }
}

export function recordServerMetrics(
  serverId: string,
  stats: { cpuPercent: number; memoryPercent: number },
) {
  recordMetric("server", "cpu", stats.cpuPercent, serverId);
  recordMetric("server", "ram", stats.memoryPercent, serverId);
}

export function recordAggregateMetrics(agg: {
  serversCpu: number;
  serversMemoryPercent: number;
}) {
  recordMetric("aggregate", "cpu", agg.serversCpu);
  recordMetric("aggregate", "ram", agg.serversMemoryPercent);
}

export function queryMetricHistory(opts: {
  scope: Scope;
  metric: string;
  serverId?: string;
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
}) {
  const db = getDb();
  const since =
    opts.sinceMs ??
    Date.now() - getSettings().metricsRetentionHours * 60 * 60 * 1000;
  const conditions = [
    eq(metricSamples.scope, opts.scope),
    eq(metricSamples.metric, opts.metric),
    gte(metricSamples.sampledAt, new Date(since)),
  ];
  if (opts.serverId) {
    conditions.push(eq(metricSamples.serverId, opts.serverId));
  }
  if (opts.untilMs) {
    conditions.push(lte(metricSamples.sampledAt, new Date(opts.untilMs)));
  }
  return db
    .select({
      t: metricSamples.sampledAt,
      v: metricSamples.value,
    })
    .from(metricSamples)
    .where(and(...conditions))
    .orderBy(metricSamples.sampledAt)
    .limit(opts.limit ?? 500)
    .all()
    .map((r) => ({ t: r.t.getTime(), v: r.v }));
}

export function pruneOldMetrics() {
  const db = getDb();
  const cutoff = Date.now() - getSettings().metricsRetentionHours * 60 * 60 * 1000;
  db.delete(metricSamples)
    .where(lte(metricSamples.sampledAt, new Date(cutoff)))
    .run();
}

export function metricsSampleCount() {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(metricSamples)
    .get();
  return row?.c ?? 0;
}
