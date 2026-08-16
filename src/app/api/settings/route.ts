import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth/session";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  const s = getSettings();
  return NextResponse.json({
    ...s,
    curseforgeApiKey: s.curseforgeApiKey ? "••••••••" : "",
    steamWebApiKey: s.steamWebApiKey ? "••••••••" : "",
    steamPassword: s.steamPassword ? "••••••••" : "",
  });
}

export async function PUT(req: Request) {
  await requireAdmin();
  const body = await req.json();
  const current = getSettings();
  const next = { ...body };
  if (next.curseforgeApiKey === "••••••••")
    next.curseforgeApiKey = current.curseforgeApiKey;
  if (next.steamWebApiKey === "••••••••")
    next.steamWebApiKey = current.steamWebApiKey;
  if (next.steamPassword === "••••••••")
    next.steamPassword = current.steamPassword;
  updateSettings(next);
  return NextResponse.json({ ok: true });
}
