"use client";

import Link from "next/link";
import { Card } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { CopyJoinButton } from "@/components/copy-join-button";
import type { MetricPoint } from "@/components/dashboard/metric-chart";
import { ServerSparklines } from "@/components/servers/server-metrics";

export type ServerCardMeta = {
  id: string;
  name: string;
  templateId: string;
  status: string;
  memoryMb: number;
  cpuLimit: number;
  joinAddress?: string | null;
};

export type ServerMetricHistory = {
  cpu: MetricPoint[];
  ram: MetricPoint[];
  stats: {
    cpuPercent: number;
    memoryMb: number;
    memoryLimitMb: number;
    memoryPercent: number;
  } | null;
};

export type ServerSortKey = "cpu" | "ram" | "name";

function StatusPill({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-ok/15 text-ok"
      : status === "stopped"
        ? "bg-card-elevated text-muted"
        : "bg-warn/15 text-warn";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${color}`}>
      {status}
    </span>
  );
}

export function ServerSortBar({
  sort,
  onSortChange,
  hint,
}: {
  sort: ServerSortKey;
  onSortChange: (key: ServerSortKey) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Sort by</span>
      {(
        [
          ["cpu", "CPU"],
          ["ram", "RAM"],
          ["name", "Name"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSortChange(key)}
          className={`rounded-md px-2.5 py-1 text-sm ${
            sort === key
              ? "bg-accent text-accent-fg"
              : "bg-card-elevated text-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function sortServersByLoad(
  servers: ServerCardMeta[],
  histories: Record<string, ServerMetricHistory | undefined>,
  sort: ServerSortKey,
): ServerCardMeta[] {
  return [...servers].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    const score = (id: string) => {
      const st = histories[id]?.stats;
      if (!st) return -1;
      return sort === "cpu" ? st.cpuPercent : st.memoryPercent;
    };
    const sa = score(a.id);
    const sb = score(b.id);
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  });
}

export function findHeaviestServerId(
  servers: ServerCardMeta[],
  histories: Record<string, ServerMetricHistory | undefined>,
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const s of servers) {
    const st = histories[s.id]?.stats;
    if (!st || s.status !== "running") continue;
    const score = st.cpuPercent + st.memoryPercent;
    if (!best || score > best.score) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

export function ServerCardsGrid({
  servers,
  histories,
  sort,
  heaviestId,
  showJoin = true,
}: {
  servers: ServerCardMeta[];
  histories: Record<string, ServerMetricHistory | undefined>;
  sort: ServerSortKey;
  heaviestId: string | null;
  showJoin?: boolean;
}) {
  const sorted = sortServersByLoad(servers, histories, sort);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((s) => {
        const h = histories[s.id];
        const isHeavy = heaviestId === s.id && s.status === "running";
        return (
          <Card
            key={s.id}
            className={isHeavy ? "ring-1 ring-warn/40" : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  {isHeavy && (
                    <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warn">
                      Heaviest
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{s.templateId}</p>
              </div>
              <StatusPill status={s.status} />
            </div>
            {showJoin && s.joinAddress !== undefined && (
              <p className="mt-2 truncate font-mono text-xs text-muted">
                {s.joinAddress ?? "No ports allocated"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              Allocated {s.memoryMb} MB · {s.cpuLimit} CPU
            </p>
            <ServerSparklines
              cpuSeries={h?.cpu ?? []}
              ramSeries={h?.ram ?? []}
              stats={h?.stats ?? null}
              status={s.status}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {showJoin && <CopyJoinButton address={s.joinAddress ?? null} />}
              <Link href={`/servers/${s.id}`}>
                <Button variant="secondary" size="sm">
                  Manage
                </Button>
              </Link>
            </div>
          </Card>
        );
      })}
      {servers.length === 0 && (
        <Card>
          <p className="text-sm text-muted">No servers yet.</p>
        </Card>
      )}
    </div>
  );
}
