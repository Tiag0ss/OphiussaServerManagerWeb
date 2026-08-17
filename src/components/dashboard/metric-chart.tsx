"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type MetricPoint = { t: number; v: number };

const REFRESH_KEY = "ophiussa.dashboardRefreshSec";
const DEFAULT_REFRESH_SEC = 5;
const MAX_POINTS = 120;

export const REFRESH_OPTIONS = [
  { value: 1, label: "1 s" },
  { value: 2, label: "2 s" },
  { value: 5, label: "5 s" },
  { value: 10, label: "10 s" },
  { value: 15, label: "15 s" },
  { value: 30, label: "30 s" },
  { value: 60, label: "60 s" },
] as const;

export function readRefreshSec(): number {
  if (typeof window === "undefined") return DEFAULT_REFRESH_SEC;
  const raw = localStorage.getItem(REFRESH_KEY);
  const n = raw ? Number(raw) : DEFAULT_REFRESH_SEC;
  return REFRESH_OPTIONS.some((o) => o.value === n) ? n : DEFAULT_REFRESH_SEC;
}

export function writeRefreshSec(sec: number) {
  localStorage.setItem(REFRESH_KEY, String(sec));
}

export function appendPoint(
  series: MetricPoint[],
  value: number | null | undefined,
): MetricPoint[] {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return series;
  }
  const next = [...series, { t: Date.now(), v: value }];
  return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
}

export function Sparkline({
  series,
  max = 100,
  color = "#3d9cfd",
  className,
  height = 40,
}: {
  series: MetricPoint[];
  max?: number;
  color?: string;
  className?: string;
  height?: number;
}) {
  const { path, area } = useMemo(() => {
    if (series.length < 2) return { path: "", area: "" };
    const w = 100;
    const h = 24;
    const pad = 1;
    const minT = series[0]!.t;
    const maxT = series[series.length - 1]!.t;
    const span = Math.max(maxT - minT, 1);
    const coords = series.map((p) => {
      const x = pad + ((p.t - minT) / span) * (w - pad * 2);
      const y = pad + (1 - Math.min(p.v, max) / max) * (h - pad * 2);
      return { x, y };
    });
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
    const areaPath = `${line} L${coords[coords.length - 1]!.x},${h} L${coords[0]!.x},${h} Z`;
    return { path: line, area: areaPath };
  }, [series, max]);

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden
      >
        {area && (
          <path d={area} fill={color} fillOpacity="0.15" vectorEffect="non-scaling-stroke" />
        )}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {series.length < 2 && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
          …
        </span>
      )}
    </div>
  );
}

type MetricChartProps = {
  title: string;
  subtitle?: string;
  series: MetricPoint[];
  unit?: string;
  max?: number;
  color?: string;
  formatValue?: (v: number) => string;
  className?: string;
};

export function MetricChart({
  title,
  subtitle,
  series,
  unit = "%",
  max = 100,
  color = "#3d9cfd",
  formatValue,
  className,
}: MetricChartProps) {
  const latest = series.length ? series[series.length - 1]!.v : null;
  const fmt = formatValue ?? ((v: number) => `${v}${unit}`);

  const { path, area } = useMemo(() => {
    if (series.length < 2) {
      return { path: "", area: "" };
    }
    const w = 100;
    const h = 36;
    const pad = 2;
    const minT = series[0]!.t;
    const maxT = series[series.length - 1]!.t;
    const span = Math.max(maxT - minT, 1);
    const coords = series.map((p) => {
      const x = pad + ((p.t - minT) / span) * (w - pad * 2);
      const y = pad + (1 - Math.min(p.v, max) / max) * (h - pad * 2);
      return { x, y };
    });
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
    const areaPath = `${line} L${coords[coords.length - 1]!.x},${h} L${coords[0]!.x},${h} Z`;
    return { path: line, area: areaPath };
  }, [series, max]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          )}
        </div>
        <p className="text-xl font-semibold tabular-nums">
          {latest !== null ? fmt(latest) : "—"}
        </p>
      </div>
      <div className="relative h-24 w-full">
        <svg
          viewBox="0 0 100 36"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          aria-hidden
        >
          {[0, 25, 50, 75, 100].map((pct) => {
            const y = 2 + (1 - pct / 100) * 32;
            return (
              <line
                key={pct}
                x1="2"
                y1={y}
                x2="98"
                y2={y}
                stroke="var(--border)"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {area && (
            <path
              d={area}
              fill={color}
              fillOpacity="0.12"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {path && (
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {series.length < 2 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted">
            Collecting samples…
          </p>
        )}
      </div>
    </div>
  );
}
