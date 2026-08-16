import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getHostMetrics } from "@/lib/host-metrics";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { serverPermissions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireSession();
  const url = new URL(req.url);
  if (url.searchParams.get("permissions") && url.searchParams.get("serverId")) {
    const rows = getDb()
      .select()
      .from(serverPermissions)
      .where(eq(serverPermissions.serverId, url.searchParams.get("serverId")!))
      .all();
    return NextResponse.json({ permissions: rows });
  }
  return NextResponse.json(getHostMetrics());
}
