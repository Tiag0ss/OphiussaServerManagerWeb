import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import cron from "node-cron";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import { refreshSchedules } from "@/lib/schedules/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = getDb()
    .select()
    .from(schedules)
    .where(eq(schedules.serverId, id))
    .all();
  return NextResponse.json({ schedules: rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!cron.validate(body.cron)) {
    return NextResponse.json({ error: "Invalid cron" }, { status: 400 });
  }
  const row = {
    id: nanoid(),
    serverId: id,
    name: String(body.name || "Schedule"),
    cron: String(body.cron),
    action: body.action as "start" | "stop" | "restart" | "backup",
    enabled: body.enabled !== false,
    lastRunAt: null as Date | null,
  };
  getDb().insert(schedules).values(row).run();
  refreshSchedules();
  return NextResponse.json(row);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { scheduleId } = await req.json();
  getDb().delete(schedules).where(eq(schedules.id, scheduleId)).run();
  refreshSchedules();
  return NextResponse.json({ ok: true });
}
