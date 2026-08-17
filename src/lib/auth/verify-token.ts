import { jwtVerify } from "jose";

const COOKIE = "ophiussa_session";

function secret() {
  const key =
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    "dev-only-change-me-ophiussa-secret-key";
  return new TextEncoder().encode(key);
}

export type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: "admin" | "user";
};

export async function verifySessionToken(
  token: string | undefined,
): Promise<TokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: String(payload.name || ""),
      role: payload.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}

export function sessionCookieName() {
  return COOKIE;
}

export async function verifyRequestSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return verifySessionToken(match?.[1]);
}
