import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  /** Max servers this user may own (null / -1 = unlimited for admin) */
  maxServers: integer("max_servers").notNull().default(3),
  /** Max total RAM (MB) across owned servers */
  maxMemoryMb: integer("max_memory_mb").notNull().default(8192),
  /** Max total CPU units across owned servers */
  maxCpu: real("max_cpu").notNull().default(4),
  /** JSON array of template ids; empty = all templates */
  allowedTemplatesJson: text("allowed_templates_json").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileId: text("file_id").notNull(),
  definitionJson: text("definition_json").notNull(),
  /** builtin templates synced from disk; custom = uploaded/edited */
  source: text("source", { enum: ["builtin", "custom"] })
    .notNull()
    .default("builtin"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => templates.id),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  containerId: text("container_id"),
  status: text("status").notNull().default("created"),
  configJson: text("config_json").notNull().default("{}"),
  memoryMb: integer("memory_mb").notNull().default(2048),
  cpuLimit: real("cpu_limit").notNull().default(1),
  ftpEnabled: integer("ftp_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  ftpUsername: text("ftp_username"),
  ftpPasswordHash: text("ftp_password_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const serverPermissions = sqliteTable("server_permissions", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  canStart: integer("can_start", { mode: "boolean" }).notNull().default(true),
  canStop: integer("can_stop", { mode: "boolean" }).notNull().default(true),
  canConsole: integer("can_console", { mode: "boolean" })
    .notNull()
    .default(true),
  canFiles: integer("can_files", { mode: "boolean" }).notNull().default(true),
  canMods: integer("can_mods", { mode: "boolean" }).notNull().default(false),
  canBackup: integer("can_backup", { mode: "boolean" }).notNull().default(false),
  canSettings: integer("can_settings", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const allocations = sqliteTable("allocations", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  hostPort: integer("host_port").notNull(),
  containerPort: integer("container_port").notNull(),
  protocol: text("protocol", { enum: ["tcp", "udp"] }).notNull(),
  key: text("key").notNull(),
});

export const serverMods = sqliteTable("server_mods", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  provider: text("provider", {
    enum: ["thunderstore", "curseforge", "steam-workshop"],
  }).notNull(),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  version: text("version"),
  installPath: text("install_path"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const backups = sqliteTable("backups", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cron: text("cron").notNull(),
  action: text("action", {
    enum: ["start", "stop", "restart", "backup"],
  }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
});
