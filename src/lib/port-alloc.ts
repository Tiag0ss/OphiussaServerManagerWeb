import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { allocations, users } from "./db/schema";
import { getSettings } from "./settings";
import type { SessionUser } from "./auth/session";
import type { GameTemplate } from "./templates/types";

export type PortRange = { start: number; end: number };

/** Effective port range for a user (clamped to the panel global range). */
export function getUserPortRange(userId: string): PortRange {
  const global = getSettings();
  const row = getDb().select().from(users).where(eq(users.id, userId)).get();
  let start = global.portRangeStart;
  let end = global.portRangeEnd;
  if (row) {
    const us = row.portRangeStart;
    const ue = row.portRangeEnd;
    if (typeof us === "number" && us > 0) start = us;
    if (typeof ue === "number" && ue > 0) end = ue;
  }
  // Clamp to global bounds
  start = Math.max(global.portRangeStart, Math.min(start, global.portRangeEnd));
  end = Math.max(start, Math.min(end, global.portRangeEnd));
  return { start, end };
}

export function getUsedHostPorts(excludeServerId?: string): Set<number> {
  const rows = getDb().select().from(allocations).all();
  const used = new Set<number>();
  for (const a of rows) {
    if (excludeServerId && a.serverId === excludeServerId) continue;
    used.add(a.hostPort);
  }
  return used;
}

/** Find a consecutive block of `count` free ports inside range. */
export function findConsecutiveFreePorts(
  range: PortRange,
  count: number,
  used: Set<number>,
  preferredStart?: number,
): number[] | null {
  const tryFrom = (from: number) => {
    for (let p = from; p <= range.end - count + 1; p++) {
      let ok = true;
      for (let i = 0; i < count; i++) {
        if (used.has(p + i) || p + i < range.start || p + i > range.end) {
          ok = false;
          break;
        }
      }
      if (ok) return Array.from({ length: count }, (_, i) => p + i);
    }
    return null;
  };

  if (preferredStart !== undefined) {
    const hit = tryFrom(preferredStart);
    if (hit) return hit;
  }
  return tryFrom(range.start);
}

/**
 * Resolve host ports for a template.
 * `preferred` maps port key → host port; missing keys auto-allocate (preferring a consecutive block).
 */
export function resolveHostPorts(
  tpl: GameTemplate,
  range: PortRange,
  used: Set<number>,
  preferred?: Record<string, number>,
): Array<{ key: string; container: number; protocol: "tcp" | "udp"; hostPort: number }> {
  const ports = tpl.runtime.ports;
  if (!ports.length) return [];

  // Validate preferred ports
  if (preferred) {
    const assigned = new Set<number>();
    for (const p of ports) {
      const host = preferred[p.key];
      if (host === undefined) continue;
      if (host < range.start || host > range.end) {
        throw new Error(
          `Port ${host} for "${p.key}" is outside allowed range ${range.start}–${range.end}`,
        );
      }
      if (used.has(host) || assigned.has(host)) {
        throw new Error(`Host port ${host} is already in use`);
      }
      assigned.add(host);
    }
  }

  const result: Array<{
    key: string;
    container: number;
    protocol: "tcp" | "udp";
    hostPort: number;
  }> = [];

  const missing = ports.filter((p) => preferred?.[p.key] === undefined);
  let autoBlock: number[] | null = null;
  if (missing.length > 0) {
    autoBlock = findConsecutiveFreePorts(range, missing.length, used);
    if (!autoBlock) {
      throw new Error(
        `No free ports in range ${range.start}–${range.end} (need ${missing.length} consecutive)`,
      );
    }
  }

  let autoIdx = 0;
  const claimed = new Set(used);
  for (const p of ports) {
    let hostPort = preferred?.[p.key];
    if (hostPort === undefined) {
      hostPort = autoBlock![autoIdx++]!;
    }
    if (claimed.has(hostPort)) {
      throw new Error(`Host port ${hostPort} is already in use`);
    }
    claimed.add(hostPort);
    result.push({
      key: p.key,
      container: p.container,
      protocol: p.protocol,
      hostPort,
    });
  }
  return result;
}

export function assertPortsInUserRange(
  user: SessionUser,
  ownerId: string,
  hostPorts: number[],
): string | null {
  if (user.role === "admin") {
    const global = getSettings();
    for (const p of hostPorts) {
      if (p < global.portRangeStart || p > global.portRangeEnd) {
        return `Port ${p} outside panel range ${global.portRangeStart}–${global.portRangeEnd}`;
      }
    }
    return null;
  }
  const range = getUserPortRange(ownerId);
  for (const p of hostPorts) {
    if (p < range.start || p > range.end) {
      return `Port ${p} outside your allowed range ${range.start}–${range.end}`;
    }
  }
  return null;
}
