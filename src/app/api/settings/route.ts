import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getSettings, updateSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const s = getSettings();
  return NextResponse.json({
    ...s,
    curseforgeApiKey: s.curseforgeApiKey ? "••••••••" : "",
    steamWebApiKey: s.steamWebApiKey ? "••••••••" : "",
    steamPassword: s.steamPassword ? "••••••••" : "",
    smtpPass: s.smtpPass ? "••••••••" : "",
  });
}

export async function PUT(req: Request) {
  const user = await requireAdmin();
  const body = await req.json();
  const current = getSettings();
  const next = { ...body };
  if (next.curseforgeApiKey === "••••••••")
    next.curseforgeApiKey = current.curseforgeApiKey;
  if (next.steamWebApiKey === "••••••••")
    next.steamWebApiKey = current.steamWebApiKey;
  if (next.steamPassword === "••••••••")
    next.steamPassword = current.steamPassword;
  if (next.smtpPass === "••••••••") next.smtpPass = current.smtpPass;
  updateSettings(next);
  writeAudit(user, "settings.update", { details: { keys: Object.keys(body) } });
  return NextResponse.json({ ok: true });
}
