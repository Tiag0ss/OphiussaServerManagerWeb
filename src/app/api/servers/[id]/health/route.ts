import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import { checkServerHealth } from "@/lib/health-check";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const health = await checkServerHealth(id);
  return NextResponse.json(health);
}
