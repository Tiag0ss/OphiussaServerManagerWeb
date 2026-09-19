import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import type { GameTemplate, TemplateField } from "./types";
import { flattenFields } from "./load";

export type AppliedRuntime = {
  env: Record<string, string>;
  args: string[];
};

function setNested(obj: Record<string, unknown>, dotted: string, value: unknown) {
  const parts = dotted.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function formatValue(
  value: unknown,
  join?: string,
  trueFalse?: boolean,
): string {
  if (Array.isArray(value)) {
    const items = value.map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
    );
    return join ? items.join(join) : items.join(",");
  }
  if (typeof value === "boolean") {
    if (trueFalse) return value ? "true" : "false";
    return value ? "1" : "0";
  }
  return String(value ?? "");
}

function appendEnv(env: Record<string, string>, key: string, piece: string) {
  const next = piece.trim();
  if (!next) return;
  env[key] = env[key] ? `${env[key]} ${next}` : next;
}

function serializeIni(data: Record<string, Record<string, string>>): string {
  const lines: string[] = [];
  for (const [section, values] of Object.entries(data)) {
    lines.push(`[${section}]`);
    for (const [k, v] of Object.entries(values)) {
      lines.push(`${k}=${v}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function parseIni(raw: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let section = "DEFAULT";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
    const sec = trimmed.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1]!;
      result[section] ??= {};
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result[section] ??= {};
    result[section]![trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

export function applyBinds(
  tpl: GameTemplate,
  config: Record<string, unknown>,
  serverDir: string,
): AppliedRuntime {
  mkdirSync(serverDir, { recursive: true });
  const env: Record<string, string> = { ...(tpl.runtime.env || {}) };
  const args: string[] = [];
  const iniFiles: Record<string, Record<string, Record<string, string>>> = {};
  const jsonFiles: Record<string, Record<string, unknown>> = {};

  for (const file of tpl.runtime.files || []) {
    const full = path.join(serverDir, file.path);
    mkdirSync(path.dirname(full), { recursive: true });
    if (file.format === "ini") {
      iniFiles[file.path] = existsSync(full)
        ? parseIni(readFileSync(full, "utf8"))
        : {};
    } else if (file.format === "json") {
      jsonFiles[file.path] = existsSync(full)
        ? (JSON.parse(readFileSync(full, "utf8")) as Record<string, unknown>)
        : {};
    }
  }

  for (const field of flattenFields(tpl.fields)) {
    applyFieldBind(field, config[field.key], env, args, iniFiles, jsonFiles);
  }

  for (const [rel, data] of Object.entries(iniFiles)) {
    const full = path.join(serverDir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, serializeIni(data), "utf8");
  }
  for (const [rel, data] of Object.entries(jsonFiles)) {
    const full = path.join(serverDir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
  }

  return { env, args };
}

function applyFieldBind(
  field: TemplateField,
  value: unknown,
  env: Record<string, string>,
  args: string[],
  iniFiles: Record<string, Record<string, Record<string, string>>>,
  jsonFiles: Record<string, Record<string, unknown>>,
) {
  if (!field.bind || value === undefined || value === null || value === "") {
    return;
  }

  // Boolean flags that only emit a CLI/env fragment when enabled
  if (field.bind.ifTrue) {
    if (value !== true) return;
    if (field.bind.env) appendEnv(env, field.bind.env, field.bind.ifTrue);
    if (field.bind.arg) args.push(field.bind.ifTrue);
    return;
  }

  // ARK-style "?Key=Value" query-string fragment, composed into a single
  // shared env var (e.g. EXTRA_SETTINGS) rather than its own env var.
  if (field.bind.queryParam && field.bind.env) {
    const queryValue =
      typeof value === "boolean" ? (value ? "True" : "False") : formatValue(value);
    env[field.bind.env] = `${env[field.bind.env] || ""}?${field.bind.queryParam}=${queryValue}`;
    return;
  }

  const formatted = formatValue(value, field.bind.join, field.bind.trueFalse);
  const withPrefix = field.bind.prefix
    ? `${field.bind.prefix}${formatted}`
    : formatted;

  if (field.bind.env) {
    if (field.bind.rawAppend) {
      env[field.bind.env] = `${env[field.bind.env] || ""}${withPrefix}`;
    } else if (field.bind.prefix || env[field.bind.env]) {
      appendEnv(env, field.bind.env, withPrefix);
    } else {
      env[field.bind.env] = withPrefix;
    }
  }
  if (field.bind.arg) {
    args.push(`${field.bind.arg}${formatted}`);
  }
  if (field.bind.ini) {
    const [section, key] = field.bind.ini.split(".");
    const targetFile = Object.keys(iniFiles)[0];
    if (targetFile && section && key) {
      iniFiles[targetFile]![section] ??= {};
      iniFiles[targetFile]![section]![key] = formatted;
    }
  }
  if (field.bind.json) {
    const targetFile = Object.keys(jsonFiles)[0];
    if (targetFile) {
      setNested(jsonFiles[targetFile]!, field.bind.json, value);
    }
  }
}
