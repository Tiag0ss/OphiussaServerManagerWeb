import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as tar from "tar";
import { getDb } from "../db";
import { backups, servers } from "../db/schema";
import { withServerLock } from "../docker/locks";
import { getSettings } from "../settings";
import {
  DB_PATH,
  PANEL_BACKUPS_DIR,
  serverBackupDir,
  serverDataDir,
} from "../paths";
import { getTemplate } from "../templates/load";
import type { GameTemplate } from "../templates/types";
import { sendRcon } from "../rcon/client";
import { stopServer, startServer } from "../docker/servers";

/** Always skip game binaries / caches even if include is missing. */
const GLOBAL_EXCLUDE_PREFIXES = [
  "steamapps",
  "steamcmd",
  "Steam",
  ".steam",
  "linux64",
  "linux32",
  "Package",
  "depotcache",
  "appcache",
  ".cache",
  "node_modules",
];

function normalizeRel(p: string) {
  return p.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function shouldExclude(rel: string, extra: string[] = []) {
  const n = normalizeRel(rel);
  const prefixes = [...GLOBAL_EXCLUDE_PREFIXES, ...extra.map(normalizeRel)];
  return prefixes.some(
    (ex) => n === ex || n.startsWith(ex + "/") || n.includes("/" + ex + "/"),
  );
}

function listBackupEntries(dataDir: string, tpl: GameTemplate | null) {
  const include = tpl?.runtime.backup?.include;
  const exclude = tpl?.runtime.backup?.exclude || [];

  if (include && include.length > 0) {
    return include
      .map(normalizeRel)
      .filter((rel) => {
        if (shouldExclude(rel, exclude)) return false;
        return existsSync(path.join(dataDir, rel));
      });
  }

  if (!existsSync(dataDir)) return [];
  return readdirSync(dataDir).filter(
    (name) => !shouldExclude(name, exclude) && name !== "backups",
  );
}

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "server"
  );
}

function backupLabel(serverName: string, at: Date) {
  const ts = at.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `${slugify(serverName)}-${ts}.tar.gz`;
}

export async function createServerBackup(serverId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    if (!server) throw new Error("Server not found");
    const tpl = getTemplate(server.templateId);
    const wasRunning = server.status === "running";
    const stopForBackup = Boolean(tpl?.runtime.backup?.stopServer);

    if (wasRunning && tpl?.rcon?.enabled && tpl.rcon.saveCommand) {
      try {
        await sendRcon(serverId, tpl.rcon.saveCommand);
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        /* ignore */
      }
    }

    if (wasRunning && stopForBackup) {
      await stopServer(serverId);
    }

    const dir = serverBackupDir(serverId);
    mkdirSync(dir, { recursive: true });
    const id = nanoid();
    const createdAt = new Date();
    const label = backupLabel(server.name, createdAt);
    const outPath = path.join(dir, label);
    const dataDir = serverDataDir(serverId);
    mkdirSync(dataDir, { recursive: true });

    const entries = listBackupEntries(dataDir, tpl);
    if (entries.length === 0) {
      if (wasRunning && stopForBackup) {
        await startServer(serverId).catch(() => undefined);
      }
      throw new Error(
        "Nothing to back up — no save/config paths found for this template",
      );
    }

    const exclude = tpl?.runtime.backup?.exclude || [];
    await tar.c(
      {
        gzip: true,
        file: outPath,
        cwd: dataDir,
        filter: (p) => !shouldExclude(p, exclude),
      },
      entries,
    );

    const size = existsSync(outPath) ? statSync(outPath).size : 0;
    db.insert(backups)
      .values({
        id,
        serverId,
        label,
        path: outPath,
        sizeBytes: size,
        createdAt,
      })
      .run();

    rotateBackups(serverId);

    if (wasRunning && stopForBackup) {
      await startServer(serverId);
    }

    return {
      id,
      label,
      path: outPath,
      sizeBytes: size,
      entries,
      stopped: stopForBackup && wasRunning,
    };
  });
}

function rotateBackups(serverId: string) {
  const db = getDb();
  const settings = getSettings();
  const rows = db
    .select()
    .from(backups)
    .where(eq(backups.serverId, serverId))
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const row of rows.slice(settings.backupRetention)) {
    if (existsSync(row.path)) rmSync(row.path, { force: true });
    db.delete(backups).where(eq(backups.id, row.id)).run();
  }
}

export async function restoreServerBackup(serverId: string, backupId: string) {
  return withServerLock(serverId, async () => {
    const db = getDb();
    const backup = db.select().from(backups).where(eq(backups.id, backupId)).get();
    if (!backup || backup.serverId !== serverId) {
      throw new Error("Backup not found");
    }
    const server = db.select().from(servers).where(eq(servers.id, serverId)).get();
    const tpl = server ? getTemplate(server.templateId) : null;
    const wasRunning = server?.status === "running";
    if (wasRunning) await stopServer(serverId);

    const dataDir = serverDataDir(serverId);
    mkdirSync(dataDir, { recursive: true });

    // Overlay restore: replace only included save/config paths, keep game binaries
    const include = tpl?.runtime.backup?.include;
    if (include?.length) {
      for (const rel of include.map(normalizeRel)) {
        const target = path.join(dataDir, rel);
        if (existsSync(target)) {
          rmSync(target, { recursive: true, force: true });
        }
      }
    }

    await tar.x({ file: backup.path, cwd: dataDir });

    if (wasRunning) await startServer(serverId);
  });
}

export async function deleteBackup(backupId: string) {
  const db = getDb();
  const backup = db.select().from(backups).where(eq(backups.id, backupId)).get();
  if (!backup) return;
  if (existsSync(backup.path)) rmSync(backup.path, { force: true });
  db.delete(backups).where(eq(backups.id, backupId)).run();
}

export type ContainerBackupEntry = {
  id: string;
  name: string;
  sizeBytes: number | null;
  isDirectory: boolean;
  createdAt: Date;
};

/**
 * Some game images (e.g. lloesche/valheim-server) run their own scheduled
 * backups inside the container, writing into a "backups" folder at the root
 * of the data volume — entirely separate from this panel's own tracked
 * backups. Surface them read-only so they're not invisible to the user.
 */
export function listContainerBackups(serverId: string): ContainerBackupEntry[] {
  const dir = path.join(serverDataDir(serverId), "backups");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => {
      const full = path.join(dir, name);
      const stat = statSync(full);
      return {
        id: `container:${name}`,
        name,
        sizeBytes: stat.isDirectory() ? null : stat.size,
        isDirectory: stat.isDirectory(),
        createdAt: stat.mtime,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Resolve a container-backup id (from listContainerBackups) to its file path, guarding path traversal. */
export function resolveContainerBackupPath(serverId: string, backupId: string) {
  if (!backupId.startsWith("container:")) return null;
  const name = backupId.slice("container:".length);
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return null;
  }
  const dir = path.join(serverDataDir(serverId), "backups");
  const full = path.join(dir, name);
  if (!existsSync(full)) return null;
  return full;
}

export async function backupPanelDb() {
  mkdirSync(PANEL_BACKUPS_DIR, { recursive: true });
  const dest = path.join(
    PANEL_BACKUPS_DIR,
    `panel-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
  );
  if (!existsSync(DB_PATH)) return null;
  const { copyFileSync } = await import("fs");
  copyFileSync(DB_PATH, dest);

  const { readdirSync: rd } = await import("fs");
  const files = rd(PANEL_BACKUPS_DIR)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse();
  for (const f of files.slice(14)) {
    rmSync(path.join(PANEL_BACKUPS_DIR, f), { force: true });
  }
  return dest;
}
