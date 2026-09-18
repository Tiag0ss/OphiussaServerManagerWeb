import { readdirSync, readFileSync } from "fs";
import path from "path";
import YAML from "yaml";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { templates } from "../db/schema";
import { TEMPLATES_DIR } from "../paths";
import type { GameTemplate } from "./types";
import { evaluateShowIf } from "./show-if";
import { parseTemplateYaml } from "./definition";

export { evaluateShowIf };
export {
  defaultConfigFromTemplate,
  flattenFields,
  mergeConfigWithDefaults,
  parseTemplateYaml,
} from "./definition";

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
  syncTemplatesToDb();
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

