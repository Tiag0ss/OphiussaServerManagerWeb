import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { importServerBundle } from "@/lib/server-transfer";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireSession();
  const body = await req.json();
  try {
    const result = await importServerBundle(user, body, {
      start: body.start !== false,
    });
    writeAudit(user, "server.import", {
      targetType: "server",
      targetId: result.id,
      details: { name: body.server?.name },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 400 },
    );
  }
}
