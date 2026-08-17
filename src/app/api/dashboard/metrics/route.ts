import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getHostMetrics } from "@/lib/host-metrics";
import { listAccessibleServers } from "@/lib/permissions";
import { getContainerStats } from "@/lib/docker/servers";
import { getDb } from "@/lib/db";
import { allocations } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { joinAddress } from "@/lib/join-address";
import {
  recordAggregateMetrics,
  recordHostMetrics,
  recordServerMetrics,
} from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  const host = getHostMetrics();
  const servers = listAccessibleServers(user);
  const db = getDb();
  const allPorts = db.select().from(allocations).all();
  const portsByServer = new Map<string, typeof allPorts>();
  for (const p of allPorts) {
    const list = portsByServer.get(p.serverId) ?? [];
    list.push(p);
    portsByServer.set(p.serverId, list);
  }
  const publicIp = getSettings().publicIp;

  const enriched = await Promise.all(
    servers.map(async (s) => {
      const stats =
        s.status === "running" ? await getContainerStats(s.id) : null;
      return {
        id: s.id,
        name: s.name,
        templateId: s.templateId,
        status: s.status,
        memoryMb: s.memoryMb,
        cpuLimit: s.cpuLimit,
        joinAddress: joinAddress(publicIp, portsByServer.get(s.id) ?? []),
        stats,
      };
    }),
  );

  let serversCpu = 0;
  let serversMemoryMb = 0;
  let running = 0;
  for (const s of enriched) {
    if (s.status !== "running") continue;
    running++;
    if (s.stats) {
      serversCpu += s.stats.cpuPercent;
      serversMemoryMb += s.stats.memoryMb;
    }
  }

  recordHostMetrics(host);
  recordAggregateMetrics({
    serversCpu: Math.round(serversCpu * 10) / 10,
    serversMemoryPercent:
      host.ram.totalMb > 0
        ? Math.round((serversMemoryMb / host.ram.totalMb) * 1000) / 10
        : 0,
  });
  for (const s of enriched) {
    if (s.stats) recordServerMetrics(s.id, s.stats);
  }

  return NextResponse.json({
    at: Date.now(),
    host,
    servers: enriched,
    aggregate: {
      running,
      total: enriched.length,
      serversCpu: Math.round(serversCpu * 10) / 10,
      serversMemoryMb,
      serversMemoryPercent:
        host.ram.totalMb > 0
          ? Math.round((serversMemoryMb / host.ram.totalMb) * 1000) / 10
          : 0,
    },
  });
}
