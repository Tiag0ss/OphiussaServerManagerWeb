"use client";

import Link from "next/link";
import {
  BookOpen,
  FileStack,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Search,
  Server,
  Settings,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type NavServer = {
  id: string;
  name: string;
  templateId: string;
  status: string;
};

const adminLinks = [
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/docs", label: "Docs", icon: BookOpen },
] as const;

function isPathActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function resolveActiveLabel(pathname: string, servers: NavServer[]): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/servers/new") return "Create server";
  const match = pathname.match(/^\/servers\/([^/]+)/);
  if (match) {
    const server = servers.find((s) => s.id === match[1]);
    if (server) return server.name;
  }
  const admin = adminLinks.find((l) => isPathActive(pathname, l.href));
  if (admin) return admin.label;
  return "Panel";
}

function groupServersByGame(
  servers: NavServer[],
  templateNames: Record<string, string>,
) {
  const groups = new Map<string, NavServer[]>();
  for (const s of servers) {
    const list = groups.get(s.templateId) ?? [];
    list.push(s);
    groups.set(s.templateId, list);
  }
  return [...groups.entries()]
    .sort((a, b) =>
      (templateNames[a[0]] ?? a[0]).localeCompare(templateNames[b[0]] ?? b[0]),
    )
    .map(([templateId, list]) => ({
      templateId,
      label: templateNames[templateId] ?? templateId,
      servers: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-4 first:pt-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/55">
        {children}
      </span>
      {action}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  indent,
}: {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  onNavigate?: () => void;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] transition-colors duration-150",
        indent ? "pl-9 pr-3" : "px-3",
        active
          ? "bg-accent/[0.12] font-medium text-foreground shadow-[inset_2px_0_0_0_var(--color-accent)]"
          : "text-muted/90 hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "size-[15px] shrink-0",
            active ? "text-accent" : "text-muted/70 group-hover:text-muted",
          )}
          strokeWidth={active ? 2.25 : 1.75}
        />
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ServerLink({
  href,
  label,
  status,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  status: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  const running = status === "running";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-2 text-[13px] transition-colors duration-150",
        active
          ? "bg-accent/[0.12] font-medium text-foreground shadow-[inset_2px_0_0_0_var(--color-accent)]"
          : "text-muted/85 hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          running
            ? "bg-ok shadow-[0_0_6px_rgba(127,217,154,0.65)]"
            : status === "stopped"
              ? "bg-muted/50"
              : "bg-warn",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Server
        className={cn(
          "size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-40",
          active && "opacity-50 text-accent",
        )}
        strokeWidth={1.75}
      />
    </Link>
  );
}

export function SidebarBrand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 via-accent/10 to-transparent ring-1 ring-accent/20">
        <div className="absolute inset-0 rounded-xl bg-accent/5 blur-sm" />
        <Server className="relative size-4 text-accent" strokeWidth={2} />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            Ophiussa
          </p>
          <p className="truncate text-[11px] text-muted/70">Server Manager</p>
        </div>
      )}
    </div>
  );
}

export function SidebarUserFooter({
  user,
  onLogout,
}: {
  user: { name: string; email: string; role: string };
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/40 p-2.5 backdrop-blur-sm">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-accent/5 text-xs font-semibold text-accent ring-1 ring-accent/15">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
        <p className="truncate text-[11px] capitalize text-muted/70">{user.role}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        title="Sign out"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted/70 transition hover:bg-white/[0.05] hover:text-foreground"
      >
        <LogOut className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function SidebarNav({
  pathname,
  servers,
  templateNames,
  onNavigate,
  className,
  isAdmin = false,
}: {
  pathname: string;
  servers: NavServer[];
  templateNames: Record<string, string>;
  onNavigate?: () => void;
  className?: string;
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const gameGroups = useMemo(
    () => groupServersByGame(servers, templateNames),
    [servers, templateNames],
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gameGroups;
    return gameGroups
      .map((g) => ({
        ...g,
        servers: g.servers.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.servers.length > 0 || g.label.toLowerCase().includes(q));
  }, [gameGroups, query]);

  const activeServerId = pathname.match(/^\/servers\/([^/]+)/)?.[1];

  return (
    <nav className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="shrink-0 space-y-0.5">
        <NavLink
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={pathname === "/dashboard"}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        {servers.length > 0 && (
          <div className="relative mb-3 px-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted/50" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search servers…"
              className="w-full rounded-lg border border-border/70 bg-card/30 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted/50 focus:border-accent/40 focus:outline-none"
            />
          </div>
        )}

        <div className="sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {filteredGroups.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted/60">
              {query ? "No matches" : "No servers yet"}
            </p>
          )}

          {filteredGroups.map((group) => {
            const running = group.servers.filter(
              (s) => s.status === "running",
            ).length;
            return (
            <div key={group.templateId}>
              <div className="mb-1 flex items-center justify-between gap-2 px-3">
                <p className="truncate text-xs font-medium text-muted/75">
                  {group.label}
                </p>
                <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] tabular-nums text-muted/60">
                  {running}/{group.servers.length}
                </span>
              </div>
              <div className="ml-3 space-y-0.5 border-l border-border/45 pl-2">
                {group.servers.map((s) => (
                  <ServerLink
                    key={s.id}
                    href={`/servers/${s.id}`}
                    label={s.name}
                    status={s.status}
                    active={activeServerId === s.id}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {isAdmin && (
      <div className="mt-3 shrink-0 border-t border-border/60 pt-3">
        <SectionLabel>Admin</SectionLabel>
        <div className="space-y-0.5">
          {adminLinks.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              label={l.label}
              icon={l.icon}
              active={isPathActive(pathname, l.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
      )}
    </nav>
  );
}
