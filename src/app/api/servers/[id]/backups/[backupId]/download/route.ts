import { createReadStream, existsSync } from "fs";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { backups } from "@/lib/db/schema";
import { canAccessServer } from "@/lib/permissions";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; backupId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id, backupId } = await ctx.params;
  if (!canAccessServer(user, id, "backup")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = getDb()
    .select()
    .from(backups)
    .where(eq(backups.id, backupId))
    .get();
  if (!row || row.serverId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!existsSync(row.path)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  const filename = row.label || `backup-${backupId}.tar.gz`;
  const stream = createReadStream(row.path);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
