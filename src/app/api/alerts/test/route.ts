import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { sendTestAlert } from "@/lib/alerts/notify";

export const dynamic = "force-dynamic";

export async function POST() {
  await requireAdmin();
  await sendTestAlert();
  return NextResponse.json({ ok: true });
}
