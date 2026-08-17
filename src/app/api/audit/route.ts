import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { listAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
  const rows = listAuditLog(limit);
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: JSON.parse(r.detailsJson || "{}"),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
