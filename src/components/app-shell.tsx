"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] gap-0 md:gap-8 px-0 md:px-6">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar/80 md:block">
        <div className="sticky top-0 flex h-screen flex-col gap-8 px-5 py-7">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              Ophiussa
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              Server Manager
            </h1>
          </div>
          <nav className="space-y-1">
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
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition",
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
          <div className="mt-auto rounded-xl border border-border bg-card p-3.5 text-sm">
            <p className="font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-accent/80">
              {user.role}
            </p>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              size="sm"
              onClick={logout}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-2 md:py-8">{children}</main>
    </div>
  );
}
