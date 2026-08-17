"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Health = {
  overall: "healthy" | "degraded" | "down" | "stopped";
  container: string;
  gamePort: string;
  rcon: string;
  detail?: string;
};

const styles: Record<Health["overall"], string> = {
  healthy: "bg-ok/15 text-ok border-ok/30",
  degraded: "bg-warn/15 text-warn border-warn/30",
  down: "bg-danger/15 text-danger border-danger/30",
  stopped: "bg-card-elevated text-muted border-border",
};

export function ServerHealthBadge({ serverId }: { serverId: string }) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/servers/${serverId}/health`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setHealth(d);
        });
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId]);

  if (!health) return null;

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
        styles[health.overall],
      )}
    >
      <span className="font-medium capitalize">{health.overall}</span>
      <span className="text-muted/80">
        port {health.gamePort} · rcon {health.rcon}
      </span>
    </div>
  );
}
