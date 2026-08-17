import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { serverPermissions, servers, users } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings") && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .select()
    .from(serverPermissions)
    .where(eq(serverPermissions.serverId, id))
    .all();
  const allUsers = db.select().from(users).all();
  return NextResponse.json({
    permissions: rows,
    users: allUsers.map((u) => ({ id: u.id, email: u.email, name: u.name })),
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const list = body.permissions as Array<{
    userId: string;
    canStart?: boolean;
    canStop?: boolean;
    canConsole?: boolean;
    canFiles?: boolean;
    canMods?: boolean;
    canBackup?: boolean;
    canSettings?: boolean;
  }>;

  db.delete(serverPermissions).where(eq(serverPermissions.serverId, id)).run();

  for (const p of list ?? []) {
    if (p.userId === server.ownerId) continue;
    db.insert(serverPermissions)
      .values({
        id: nanoid(),
        serverId: id,
        userId: p.userId,
        canStart: p.canStart ?? true,
        canStop: p.canStop ?? true,
        canConsole: p.canConsole ?? true,
        canFiles: p.canFiles ?? true,
        canMods: p.canMods ?? false,
        canBackup: p.canBackup ?? false,
        canSettings: p.canSettings ?? false,
      })
      .run();
  }

  writeAudit(user, "server.permissions", {
    targetType: "server",
    targetId: id,
    details: { count: list?.length ?? 0 },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  const { userId } = await req.json();
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, id)).get();
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  db.delete(serverPermissions)
    .where(
      and(
        eq(serverPermissions.serverId, id),
        eq(serverPermissions.userId, userId),
      ),
    )
    .run();
  return NextResponse.json({ ok: true });
}
