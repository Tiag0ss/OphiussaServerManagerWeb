import { readdirSync, readFileSync } from "fs";
import path from "path";
import YAML from "yaml";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { templates } from "../db/schema";
import { TEMPLATES_DIR } from "../paths";
import type { GameTemplate, TemplateField } from "./types";
import { evaluateShowIf } from "./show-if";

export { evaluateShowIf };

export function parseTemplateYaml(raw: string): GameTemplate {
  const parsed = YAML.parse(raw) as GameTemplate;
  if (!parsed?.id || !parsed?.name || !parsed?.runtime?.image) {
    throw new Error("Invalid template: missing id, name, or runtime.image");
  }
  if (!Array.isArray(parsed.fields)) parsed.fields = [];
  if (!Array.isArray(parsed.runtime.ports)) parsed.runtime.ports = [];
  if (!Array.isArray(parsed.runtime.volumes)) parsed.runtime.volumes = [];
  return parsed;
}

export function loadTemplatesFromDisk(): GameTemplate[] {
  try {
    const files = readdirSync(TEMPLATES_DIR).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );
    return files.map((file) => {
      const raw = readFileSync(path.join(TEMPLATES_DIR, file), "utf8");
      return parseTemplateYaml(raw);
    });
  } catch {
    return [];
  }
}

export function syncTemplatesToDb() {
  const db = getDb();
  const now = new Date();
  for (const tpl of loadTemplatesFromDisk()) {
    const existing = db
      .select()
      .from(templates)
      .where(eq(templates.id, tpl.id))
      .get();
    // Do not overwrite templates that were customized or uploaded
    if (existing?.source === "custom") continue;
    db.insert(templates)
      .values({
        id: tpl.id,
        name: tpl.name,
        fileId: tpl.id,
        definitionJson: JSON.stringify(tpl),
        source: "builtin",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: templates.id,
        set: {
          name: tpl.name,
          definitionJson: JSON.stringify(tpl),
          source: "builtin",
          updatedAt: now,
        },
      })
      .run();
  }
}

export function listTemplateRows() {
  syncTemplatesToDb();
  return getDb().select().from(templates).all();
}

export function saveTemplateDefinition(
  tpl: GameTemplate,
  source: "builtin" | "custom" = "custom",
) {
  const db = getDb();
  const now = new Date();
  db.insert(templates)
    .values({
      id: tpl.id,
      name: tpl.name,
      fileId: tpl.id,
      definitionJson: JSON.stringify(tpl),
      source,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: templates.id,
      set: {
        name: tpl.name,
        definitionJson: JSON.stringify(tpl),
        source,
        updatedAt: now,
      },
    })
    .run();
}

export function deleteTemplate(id: string) {
  getDb().delete(templates).where(eq(templates.id, id)).run();
}

export function templateToYaml(tpl: GameTemplate): string {
  return YAML.stringify(tpl);
}

export function getTemplate(id: string): GameTemplate | null {
  const db = getDb();
  const row = db.select().from(templates).where(eq(templates.id, id)).get();
  if (!row) return null;
  return JSON.parse(row.definitionJson) as GameTemplate;
}

export function listTemplates(): GameTemplate[] {
  syncTemplatesToDb();
  const db = getDb();
  return db
    .select()
    .from(templates)
    .all()
    .map((r) => JSON.parse(r.definitionJson) as GameTemplate);
}

export function defaultConfigFromTemplate(tpl: GameTemplate): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of flattenFields(tpl.fields)) {
    if (field.type === "group") continue;
    if (field.default !== undefined) {
      config[field.key] = field.default;
    } else if (field.type === "boolean") {
      config[field.key] = false;
    } else if (field.type === "list") {
      config[field.key] = [];
    } else if (field.type === "number" || field.type === "slider" || field.type === "port") {
      config[field.key] = field.min ?? 0;
    } else {
      config[field.key] = "";
    }
  }
  return config;
}

export function mergeConfigWithDefaults(
  tpl: GameTemplate,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = defaultConfigFromTemplate(tpl);
  return { ...defaults, ...existing };
}

export function flattenFields(fields: TemplateField[]): TemplateField[] {
  const out: TemplateField[] = [];
  for (const f of fields) {
    out.push(f);
    if (f.type === "list" && f.item?.type === "object" && f.item.fields) {
      // nested fields are not top-level config keys
    }
  }
  return out;
}
