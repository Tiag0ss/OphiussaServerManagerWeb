import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { canAccessServer } from "@/lib/permissions";
import { getContainerStats } from "@/lib/docker/servers";
import { recordServerMetrics } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const server = getDb().select().from(servers).where(eq(servers.id, id)).get();
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stats =
    server.status === "running" ? await getContainerStats(id) : null;
  if (stats) recordServerMetrics(id, stats);
  return NextResponse.json({
    at: Date.now(),
    status: server.status,
    memoryMb: server.memoryMb,
    cpuLimit: server.cpuLimit,
    stats,
  });
}
