import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { backups } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import {
  createServerBackup,
  deleteBackup,
  listContainerBackups,
  resolveContainerBackupPath,
  restoreServerBackup,
} from "@/lib/backups";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "backup")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = getDb()
    .select()
    .from(backups)
    .where(eq(backups.serverId, id))
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const containerBackups = listContainerBackups(id);
  return NextResponse.json({ backups: rows, containerBackups });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "backup")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "restore") {
      await restoreServerBackup(id, body.backupId);
      return NextResponse.json({ ok: true });
    }
    const result = await createServerBackup(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backup failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "backup")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { backupId } = await req.json();
  if (typeof backupId === "string" && backupId.startsWith("container:")) {
    const full = resolveContainerBackupPath(id, backupId);
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { rmSync } = await import("fs");
    rmSync(full, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  }
  await deleteBackup(backupId);
  return NextResponse.json({ ok: true });
}
