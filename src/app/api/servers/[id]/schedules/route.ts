import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import cron from "node-cron";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import { refreshSchedules, runScheduleNow } from "@/lib/schedules/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS = ["start", "stop", "restart", "backup", "update-image", "rcon"] as const;

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

  if (body.action === "run-now") {
    if (!body.scheduleId) {
      return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    }
    try {
      await runScheduleNow(body.scheduleId);
      const row = getDb()
        .select()
        .from(schedules)
        .where(eq(schedules.id, body.scheduleId))
        .get();
      return NextResponse.json({ ok: true, schedule: row });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Run failed" },
        { status: 400 },
      );
    }
  }

  if (!cron.validate(body.cron)) {
    return NextResponse.json({ error: "Invalid cron" }, { status: 400 });
  }
  if (!ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (body.action === "rcon" && !String(body.commandText || "").trim()) {
    return NextResponse.json(
      { error: "RCON command required for this action" },
      { status: 400 },
    );
  }
  const row = {
    id: nanoid(),
    serverId: id,
    name: String(body.name || "Schedule"),
    cron: String(body.cron),
    action: body.action as (typeof ACTIONS)[number],
    commandText: body.action === "rcon" ? String(body.commandText).trim() : null,
    enabled: body.enabled !== false,
    lastRunAt: null as Date | null,
    lastRunStatus: null as "ok" | "fail" | null,
    lastRunError: null as string | null,
  };
  getDb().insert(schedules).values(row).run();
  refreshSchedules();
  return NextResponse.json(row);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }
  const existing = getDb()
    .select()
    .from(schedules)
    .where(eq(schedules.id, body.scheduleId))
    .get();
  if (!existing || existing.serverId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Partial<typeof schedules.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.cron === "string") {
    if (!cron.validate(body.cron)) {
      return NextResponse.json({ error: "Invalid cron" }, { status: 400 });
    }
    patch.cron = body.cron;
  }
  if (typeof body.action === "string") {
    if (!ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    patch.action = body.action;
  }
  if (typeof body.commandText === "string") patch.commandText = body.commandText.trim();
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const nextAction = patch.action ?? existing.action;
  const nextCommand = patch.commandText ?? existing.commandText;
  if (nextAction === "rcon" && !nextCommand?.trim()) {
    return NextResponse.json(
      { error: "RCON command required for this action" },
      { status: 400 },
    );
  }

  getDb().update(schedules).set(patch).where(eq(schedules.id, body.scheduleId)).run();
  refreshSchedules();
  const row = getDb()
    .select()
    .from(schedules)
    .where(eq(schedules.id, body.scheduleId))
    .get();
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
