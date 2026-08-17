"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  resolveActiveLabel,
  SidebarBrand,
  SidebarNav,
  SidebarUserFooter,
  type NavServer,
} from "@/components/sidebar-nav";
import { cn } from "@/lib/utils";

export type { NavServer };

export function AppShell({
  children,
  user,
  servers,
  templateNames,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
  servers: NavServer[];
  templateNames: Record<string, string>;
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

  const activeLabel = resolveActiveLabel(pathname, servers);

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="hidden w-[264px] shrink-0 border-r border-border/80 bg-sidebar md:flex md:flex-col">
        <div className="flex h-dvh flex-col px-4 py-5">
          <SidebarBrand />
          <div className="mt-7 min-h-0 flex-1">
            <SidebarNav
              pathname={pathname}
              servers={servers}
              templateNames={templateNames}
              className="h-full"
            />
          </div>
          <div className="mt-4 shrink-0">
            <SidebarUserFooter user={user} onLogout={logout} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-sidebar/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/75 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-card/60 text-foreground"
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
            <p className="truncate text-[10px] uppercase tracking-wider text-muted/60">
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
              className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
              onClick={() => setNavOpen(false)}
            />
            <aside
              className={cn(
                "absolute inset-y-0 left-0 flex w-[min(100vw-2.5rem,280px)] flex-col",
                "border-r border-border/80 bg-sidebar shadow-2xl shadow-black/40",
              )}
            >
              <div className="flex items-center justify-between gap-3 px-4 pt-5">
                <SidebarBrand />
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setNavOpen(false)}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card/60 text-muted hover:text-foreground"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <div className="mt-6 min-h-0 flex-1 px-4">
                <SidebarNav
                  pathname={pathname}
                  servers={servers}
                  templateNames={templateNames}
                  onNavigate={() => setNavOpen(false)}
                  className="h-full"
                />
              </div>
              <div className="shrink-0 px-4 pb-5 pt-4">
                <SidebarUserFooter user={user} onLogout={logout} />
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
