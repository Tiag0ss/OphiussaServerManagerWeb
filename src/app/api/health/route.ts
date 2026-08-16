import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb();
    return NextResponse.json({
      ok: true,
      setupComplete: isSetupComplete(),
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
