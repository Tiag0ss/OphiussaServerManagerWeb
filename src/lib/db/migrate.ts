import type Database from "better-sqlite3";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    max_servers INTEGER NOT NULL DEFAULT 3,
    max_memory_mb INTEGER NOT NULL DEFAULT 8192,
    max_cpu REAL NOT NULL DEFAULT 4,
    allowed_templates_json TEXT NOT NULL DEFAULT '[]',
    port_range_start INTEGER NOT NULL DEFAULT 0,
    port_range_end INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_id TEXT NOT NULL,
    definition_json TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'builtin',
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_id TEXT NOT NULL REFERENCES templates(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    container_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    config_json TEXT NOT NULL DEFAULT '{}',
    memory_mb INTEGER NOT NULL DEFAULT 2048,
    cpu_limit REAL NOT NULL DEFAULT 1,
    ftp_enabled INTEGER NOT NULL DEFAULT 1,
    ftp_username TEXT,
    ftp_password_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS server_permissions (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_start INTEGER NOT NULL DEFAULT 1,
    can_stop INTEGER NOT NULL DEFAULT 1,
    can_console INTEGER NOT NULL DEFAULT 1,
    can_files INTEGER NOT NULL DEFAULT 1,
    can_mods INTEGER NOT NULL DEFAULT 0,
    can_backup INTEGER NOT NULL DEFAULT 0,
    can_settings INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS allocations (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    host_port INTEGER NOT NULL,
    container_port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS server_mods (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    install_path TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cron TEXT NOT NULL,
    action TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER
  )`,
];

const ALTERS = [
  `ALTER TABLE users ADD COLUMN max_servers INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE users ADD COLUMN max_memory_mb INTEGER NOT NULL DEFAULT 8192`,
  `ALTER TABLE users ADD COLUMN max_cpu REAL NOT NULL DEFAULT 4`,
  `ALTER TABLE users ADD COLUMN allowed_templates_json TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE users ADD COLUMN port_range_start INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN port_range_end INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE templates ADD COLUMN source TEXT NOT NULL DEFAULT 'builtin'`,
  `ALTER TABLE backups ADD COLUMN label TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE servers ADD COLUMN ftp_password_enc TEXT`,
];

export function migrate(sqlite: Database.Database) {
  for (const sql of STATEMENTS) {
    sqlite.exec(sql);
  }
  for (const sql of ALTERS) {
    try {
      sqlite.exec(sql);
    } catch {
      /* column already exists */
    }
  }
}
