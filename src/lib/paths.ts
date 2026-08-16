import { mkdirSync } from "fs";
import path from "path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const DB_PATH = process.env.OPHIUSSA_DB_PATH || path.join(DATA_DIR, "panel.db");
export const SERVERS_DIR = path.join(DATA_DIR, "servers");
export const BACKUPS_DIR = path.join(DATA_DIR, "backups");
export const PANEL_BACKUPS_DIR = path.join(BACKUPS_DIR, "panel");
export const LOGS_DIR = path.join(DATA_DIR, "logs");
export const TEMPLATES_DIR =
  process.env.TEMPLATES_DIR || path.join(process.cwd(), "templates");

export function ensureDataDirs() {
  for (const dir of [
    DATA_DIR,
    SERVERS_DIR,
    BACKUPS_DIR,
    PANEL_BACKUPS_DIR,
    LOGS_DIR,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function serverDataDir(serverId: string) {
  return path.join(SERVERS_DIR, serverId);
}

export function serverBackupDir(serverId: string) {
  return path.join(BACKUPS_DIR, "servers", serverId);
}

/** Absolute path on the Docker host for volume binds (may differ from DATA_DIR inside the panel container). */
export function hostServerDataDir(serverId: string) {
  const hostRoot = process.env.HOST_DATA_DIR || DATA_DIR;
  return path.resolve(path.join(hostRoot, "servers", serverId));
}
