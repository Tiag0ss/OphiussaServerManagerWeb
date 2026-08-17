import { NextRequest, NextResponse } from "next/server";
import {
  sessionCookieName,
  verifySessionToken,
} from "@/lib/auth/verify-token";

const ADMIN_PATHS = ["/templates", "/users", "/settings", "/audit"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/auth/login")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(sessionCookieName())?.value;
  const session = await verifySessionToken(token);

  if (pathname.startsWith("/api/auth/logout")) {
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const isAdminRoute =
    ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/templates") ||
    pathname.startsWith("/api/audit") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/api/settings");

  if (isAdminRoute && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (
    pathname.startsWith("/api/settings") &&
    req.method !== "GET" &&
    session.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
