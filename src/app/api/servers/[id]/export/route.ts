import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import { exportServerBundle } from "@/lib/server-transfer";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const bundle = exportServerBundle(id);
    writeAudit(user, "server.export", {
      targetType: "server",
      targetId: id,
    });
    return NextResponse.json(bundle);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: 400 },
    );
  }
}
