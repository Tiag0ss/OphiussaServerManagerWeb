import YAML from "yaml";
import type { GameTemplate, TemplateField } from "./types";

export function parseTemplateYaml(raw: string): GameTemplate {
  const parsed = YAML.parse(raw) as GameTemplate;
  if (!parsed?.id || !parsed?.name || !parsed?.runtime?.image) {
    throw new Error("Invalid template: missing id, name, or runtime.image");
  }
  if (!parsed.runtime) {
    throw new Error("Invalid template: missing runtime");
  }
  if (!Array.isArray(parsed.fields)) parsed.fields = [];
  if (!Array.isArray(parsed.runtime.ports)) parsed.runtime.ports = [];
  if (!Array.isArray(parsed.runtime.volumes)) parsed.runtime.volumes = [];
  return parsed;
}

export function flattenFields(fields: TemplateField[]): TemplateField[] {
  const out: TemplateField[] = [];
  for (const f of fields) {
    out.push(f);
  }
  return out;
}

export function defaultConfigFromTemplate(
  tpl: GameTemplate,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of flattenFields(tpl.fields || [])) {
    if (field.type === "group") continue;
    if (field.default !== undefined) {
      config[field.key] = field.default;
    } else if (field.type === "boolean") {
      config[field.key] = false;
    } else if (field.type === "list") {
      config[field.key] = [];
    } else if (
      field.type === "number" ||
      field.type === "slider" ||
      field.type === "port"
    ) {
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
  return { ...defaultConfigFromTemplate(tpl), ...existing };
}
