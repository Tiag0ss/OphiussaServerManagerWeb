import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import { cloneServer } from "@/lib/server-transfer";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  try {
    const result = await cloneServer(user, id, {
      name: String(body.name || "Copy"),
      copyData: Boolean(body.copyData),
      start: body.start !== false,
    });
    writeAudit(user, "server.clone", {
      targetType: "server",
      targetId: result.id,
      details: { sourceId: id, copyData: Boolean(body.copyData) },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clone failed" },
      { status: 400 },
    );
  }
}
