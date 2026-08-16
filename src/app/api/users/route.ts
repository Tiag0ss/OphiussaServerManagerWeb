import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { serverPermissions, servers, users } from "@/lib/db/schema";
import { getUserResourceUsage } from "@/lib/quotas";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const list = getDb().select().from(users).all();
  return NextResponse.json({
    users: list.map((u) => {
      const usage = getUserResourceUsage(u.id);
      let allowedTemplates: string[] = [];
      try {
        allowedTemplates = JSON.parse(u.allowedTemplatesJson || "[]") as string[];
      } catch {
        allowedTemplates = [];
      }
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        maxServers: u.maxServers,
        maxMemoryMb: u.maxMemoryMb,
        maxCpu: u.maxCpu,
        allowedTemplates,
        usage,
        createdAt: u.createdAt,
      };
    }),
  });
}

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json();
  const id = nanoid();
  const allowed = Array.isArray(body.allowedTemplates)
    ? body.allowedTemplates
    : [];
  getDb()
    .insert(users)
    .values({
      id,
      email: String(body.email).toLowerCase(),
      name: String(body.name),
      passwordHash: await hashPassword(String(body.password)),
      role: body.role === "admin" ? "admin" : "user",
      maxServers: Number(body.maxServers ?? 3),
      maxMemoryMb: Number(body.maxMemoryMb ?? 8192),
      maxCpu: Number(body.maxCpu ?? 4),
      allowedTemplatesJson: JSON.stringify(allowed),
      createdAt: new Date(),
    })
    .run();
  return NextResponse.json({ id });
}

export async function PUT(req: Request) {
  await requireSession();
  const body = await req.json();

  if (body.permission) {
    await requireAdmin();
    const p = body.permission;
    const id = p.id || nanoid();
    const db = getDb();
    const existing = p.id
      ? db
          .select()
          .from(serverPermissions)
          .where(eq(serverPermissions.id, p.id))
          .get()
      : null;
    if (existing) {
      db.update(serverPermissions)
        .set({
          canStart: !!p.canStart,
          canStop: !!p.canStop,
          canConsole: !!p.canConsole,
          canFiles: !!p.canFiles,
          canMods: !!p.canMods,
          canBackup: !!p.canBackup,
          canSettings: !!p.canSettings,
        })
        .where(eq(serverPermissions.id, p.id))
        .run();
    } else {
      db.insert(serverPermissions)
        .values({
          id,
          serverId: p.serverId,
          userId: p.userId,
          canStart: !!p.canStart,
          canStop: !!p.canStop,
          canConsole: !!p.canConsole,
          canFiles: !!p.canFiles,
          canMods: !!p.canMods,
          canBackup: !!p.canBackup,
          canSettings: !!p.canSettings,
        })
        .run();
    }
    return NextResponse.json({ id });
  }

  if (body.userId) {
    await requireAdmin();
    const patch: Partial<typeof users.$inferInsert> = {};
    if (body.name) patch.name = String(body.name);
    if (body.role === "admin" || body.role === "user") patch.role = body.role;
    if (body.maxServers !== undefined) patch.maxServers = Number(body.maxServers);
    if (body.maxMemoryMb !== undefined)
      patch.maxMemoryMb = Number(body.maxMemoryMb);
    if (body.maxCpu !== undefined) patch.maxCpu = Number(body.maxCpu);
    if (Array.isArray(body.allowedTemplates)) {
      patch.allowedTemplatesJson = JSON.stringify(body.allowedTemplates);
    }
    if (body.password) {
      patch.passwordHash = await hashPassword(String(body.password));
    }
    getDb().update(users).set(patch).where(eq(users.id, body.userId)).run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown update" }, { status: 400 });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const { userId, permissionId } = await req.json();
  const db = getDb();
  if (permissionId) {
    db.delete(serverPermissions)
      .where(eq(serverPermissions.id, permissionId))
      .run();
  }
  if (userId) {
    const owned = db
      .select()
      .from(servers)
      .where(eq(servers.ownerId, userId))
      .all();
    if (owned.length > 0) {
      return NextResponse.json(
        { error: "User still owns servers — reassign or delete them first" },
        { status: 400 },
      );
    }
    db.delete(users).where(eq(users.id, userId)).run();
  }
  return NextResponse.json({ ok: true });
}
