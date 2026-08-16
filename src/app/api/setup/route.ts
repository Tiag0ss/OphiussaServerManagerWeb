import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isSetupComplete, updateSettings } from "@/lib/settings";
import { syncTemplatesToDb } from "@/lib/templates/load";
import { ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ setupComplete: isSetupComplete() });
}

export async function POST(req: Request) {
  if (isSetupComplete()) {
    return NextResponse.json({ error: "Already set up" }, { status: 400 });
  }
  const body = await req.json();
  const {
    name,
    email,
    password,
    publicIp,
    portRangeStart,
    portRangeEnd,
    timezone,
  } = body as Record<string, string | number>;

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  ensureDataDirs();
  const db = getDb();
  syncTemplatesToDb();

  const id = nanoid();
  const passwordHash = await hashPassword(String(password));
  db.insert(users)
    .values({
      id,
      email: String(email).toLowerCase(),
      name: String(name),
      passwordHash,
      role: "admin",
      maxServers: 999,
      maxMemoryMb: 1048576,
      maxCpu: 256,
      allowedTemplatesJson: "[]",
      createdAt: new Date(),
    })
    .run();

  updateSettings({
    setupComplete: true,
    publicIp: String(publicIp || ""),
    portRangeStart: Number(portRangeStart || 25565),
    portRangeEnd: Number(portRangeEnd || 26000),
    timezone: String(timezone || "Europe/Lisbon"),
  });

  await createSession({
    id,
    email: String(email).toLowerCase(),
    name: String(name),
    role: "admin",
  });

  return NextResponse.json({ ok: true });
}

// silence unused
void eq;
