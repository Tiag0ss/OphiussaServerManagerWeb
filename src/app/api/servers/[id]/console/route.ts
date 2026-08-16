import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { canAccessServer } from "@/lib/permissions";
import { sendRcon } from "@/lib/rcon/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireSession();
  const { id } = await ctx.params;
  if (!canAccessServer(user, id, "console")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { command } = await req.json();
  try {
    const result = await sendRcon(id, String(command));
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "RCON failed" },
      { status: 500 },
    );
  }
}
