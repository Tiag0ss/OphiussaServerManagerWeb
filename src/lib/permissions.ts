import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { serverPermissions, servers } from "./db/schema";
import type { SessionUser } from "./auth/session";

export type ServerAction =
  | "view"
  | "start"
  | "stop"
  | "console"
  | "files"
  | "mods"
  | "backup"
  | "settings"
  | "delete";

export function canAccessServer(user: SessionUser, serverId: string, action: ServerAction) {
  if (user.role === "admin") return true;
  const db = getDb();
  const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
  if (!server) return false;
  if (server.ownerId === user.id) return true;

  const perm = db
    .select()
    .from(serverPermissions)
    .where(
      and(
        eq(serverPermissions.serverId, serverId),
        eq(serverPermissions.userId, user.id),
      ),
    )
    .get();
  if (!perm) return false;

  switch (action) {
    case "view":
      return true;
    case "start":
      return perm.canStart;
    case "stop":
    case "delete":
      return perm.canStop;
    case "console":
      return perm.canConsole;
    case "files":
      return perm.canFiles;
    case "mods":
      return perm.canMods;
    case "backup":
      return perm.canBackup;
    case "settings":
      return perm.canSettings;
    default:
      return false;
  }
}

export function listAccessibleServers(user: SessionUser) {
  const db = getDb();
  const all = db.select().from(servers).all();
  if (user.role === "admin") return all;
  const perms = db
    .select()
    .from(serverPermissions)
    .where(eq(serverPermissions.userId, user.id))
    .all();
  const allowed = new Set(perms.map((p) => p.serverId));
  return all.filter((s) => s.ownerId === user.id || allowed.has(s.id));
}
