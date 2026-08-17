import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ user: session });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${limit.retryAfterSec}s` },
      { status: 429 },
    );
  }

  const { email, password } = await req.json();
  const db = getDb();
  const user = db
    .select()
    .from(users)
    .where(eq(users.email, String(email).toLowerCase()))
    .get();
  if (!user || !(await verifyPassword(String(password), user.passwordHash))) {
    writeAudit(null, "auth.login_failed", {
      details: { email: String(email).toLowerCase(), ip },
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  writeAudit(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    "auth.login",
    { details: { ip } },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
