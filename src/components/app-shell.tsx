"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/servers", label: "Servers" },
  { href: "/servers/new", label: "Create" },
  { href: "/templates", label: "Templates" },
  { href: "/users", label: "Users" },
  { href: "/settings", label: "Settings" },
];

function NavLinks({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn("space-y-1", className)}>
      {links.map((l) => {
        const active =
          pathname === l.href ||
          (l.href !== "/servers" && pathname.startsWith(l.href + "/")) ||
          (l.href === "/servers" &&
            pathname.startsWith("/servers/") &&
            !pathname.startsWith("/servers/new"));
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={cn(
              "block rounded-lg px-3 py-2.5 text-sm transition",
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-card-elevated hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard({
  user,
  onLogout,
}: {
  user: { name: string; email: string; role: string };
  onLogout: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 text-sm">
      <p className="font-medium">{user.name}</p>
      <p className="truncate text-xs text-muted">{user.email}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-accent/80">
        {user.role}
      </p>
      <Button className="mt-3 w-full" variant="secondary" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const activeLabel =
    links.find(
      (l) =>
        pathname === l.href ||
        (l.href !== "/servers" && pathname.startsWith(l.href + "/")) ||
        (l.href === "/servers" &&
          pathname.startsWith("/servers/") &&
          !pathname.startsWith("/servers/new")),
    )?.label ?? "Panel";

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar/80 md:flex md:flex-col">
        <div className="sticky top-0 flex h-dvh flex-col gap-8 px-5 py-7">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              Ophiussa
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              Server Manager
            </h1>
          </div>
          <NavLinks pathname={pathname} className="flex-1" />
          <UserCard user={user} onLogout={logout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card-elevated text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium">{activeLabel}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-muted">
              Ophiussa
            </p>
          </div>
          <div className="w-10" aria-hidden />
        </header>

        {navOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/60"
              onClick={() => setNavOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(100vw-3rem,18rem)] flex-col gap-6 border-r border-border bg-sidebar px-5 py-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
                    Ophiussa
                  </p>
                  <h1 className="mt-1 text-lg font-semibold tracking-tight">
                    Server Manager
                  </h1>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setNavOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card-elevated"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setNavOpen(false)} />
              <div className="mt-auto">
                <UserCard user={user} onLogout={logout} />
              </div>
            </aside>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
