import type { TemplateField } from "./types";

export function evaluateShowIf(
  field: TemplateField,
  config: Record<string, unknown>,
): boolean {
  if (!field.showIf) return true;
  const value = config[field.showIf.field];
  if (field.showIf.equals !== undefined) return value === field.showIf.equals;
  if (field.showIf.notEquals !== undefined)
    return value !== field.showIf.notEquals;
  return Boolean(value);
}
