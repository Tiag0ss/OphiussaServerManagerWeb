"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameTemplate, TemplateField } from "@/lib/templates/types";
import { evaluateShowIf } from "@/lib/templates/show-if";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { TabBar } from "@/components/ui/tab-bar";

type Props = {
  template: GameTemplate;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  mode?: "simple" | "advanced" | "all";
  ports?: Record<string, number>;
  portRange?: { start: number; end: number };
  onPortChange?: (key: string, value: number) => void;
  /**
   * Control the active field group from outside (e.g. to merge this form's
   * groups into a single tab row alongside sibling panels) instead of
   * rendering an internal tab bar.
   */
  activeGroup?: string;
  onActiveGroupChange?: (group: string) => void;
};

const PORTS_GROUP = "Ports";

/** Field groups a template would render in this mode, in display order. */
export function computeFieldGroups(
  template: GameTemplate,
  mode: "simple" | "advanced" | "all" = "all",
): [string, TemplateField[]][] {
  const map = new Map<string, TemplateField[]>();
  for (const field of template.fields) {
    if (field.type === "group") continue;
    const isAdvanced = Boolean(field.advanced);
    if (mode === "simple" && isAdvanced) continue;
    if (mode === "advanced" && !isAdvanced) continue;
    const g = field.group || "General";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(field);
  }
  return [...map.entries()];
}

export function TemplateForm({
  template,
  value,
  onChange,
  mode = "all",
  ports,
  portRange,
  onPortChange,
  activeGroup: controlledActiveGroup,
  onActiveGroupChange,
}: Props) {
  const showPorts = Boolean(ports && portRange && onPortChange);
  const controlled = controlledActiveGroup !== undefined;

  const fieldGroups = useMemo(
    () => computeFieldGroups(template, mode),
    [template, mode],
  );

  const groups = useMemo(() => {
    if (!showPorts) return fieldGroups;
    const portsEntry: [string, TemplateField[]] = [PORTS_GROUP, []];
    const serverIdx = fieldGroups.findIndex(([g]) => g === "Server");
    const insertAt = serverIdx === -1 ? 0 : serverIdx + 1;
    return [
      ...fieldGroups.slice(0, insertAt),
      portsEntry,
      ...fieldGroups.slice(insertAt),
    ];
  }, [showPorts, fieldGroups]);

  const [internalActiveGroup, setInternalActiveGroup] = useState(
    groups[0]?.[0] || "General",
  );

  useEffect(() => {
    if (controlled) return;
    const first = groups[0]?.[0] || "General";
    setInternalActiveGroup((cur) =>
      groups.some(([g]) => g === cur) ? cur : first,
    );
  }, [groups, controlled]);

  const activeGroup = controlled ? controlledActiveGroup! : internalActiveGroup;
  const setActiveGroup = onActiveGroupChange ?? setInternalActiveGroup;

  function setField(key: string, v: unknown) {
    onChange({ ...value, [key]: v });
  }

  const fields = groups.find(([g]) => g === activeGroup)?.[1] || [];

  return (
    <div className="space-y-4">
      {!controlled && groups.length > 1 && (
        <TabBar
          tabs={groups.map(([g]) => g)}
          value={activeGroup}
          onChange={setActiveGroup}
        />
      )}
      {activeGroup === PORTS_GROUP && showPorts ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Allowed range {portRange!.start}–{portRange!.end}. Consecutive
            ports are suggested automatically; change them within your
            allowed range.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {template.runtime.ports.map((p) => (
              <div key={p.key}>
                <Label className="text-xs">
                  {p.key} → container {p.container}/{p.protocol}
                </Label>
                <Input
                  type="number"
                  min={portRange!.start}
                  max={portRange!.end}
                  value={ports![p.key] ?? ""}
                  onChange={(e) => onPortChange!(p.key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => {
            if (!evaluateShowIf(field, value)) return null;
            return (
              <FieldControl
                key={field.key}
                field={field}
                template={template}
                value={value[field.key]}
                onChange={(v) => setField(field.key, v)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldControl({
  field,
  template,
  value,
  onChange,
}: {
  field: TemplateField;
  template: GameTemplate;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const options =
    field.options ||
    (field.optionsFrom ? template.options?.[field.optionsFrom] : undefined) ||
    [];

  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-3 pt-6">
        <input
          id={field.key}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-accent"
        />
        <Label className="mb-0" >
          {field.label || field.key}
        </Label>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <Label>{field.label || field.key}</Label>
        <Select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <div className="md:col-span-2">
        <Label>{field.label || field.key}</Label>
        <Textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      </div>
    );
  }

  if (field.type === "slider" || field.type === "number" || field.type === "port") {
    return (
      <div>
        <Label>
          {field.label || field.key}
          {field.type === "slider" ? ` (${String(value ?? field.default ?? 0)})` : ""}
        </Label>
        <Input
          type={field.type === "port" ? "number" : "number"}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(value ?? field.default ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {field.type === "slider" && (
          <input
            type="range"
            className="mt-2 w-full accent-accent"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value ?? field.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        )}
      </div>
    );
  }

  if (field.type === "list") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="md:col-span-2 space-y-2">
        <Label>{field.label || field.key}</Label>
        {list.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            {field.item?.type === "object" && field.item.fields ? (
              <div className="grid flex-1 gap-2 md:grid-cols-2">
                {field.item.fields.map((sub) => {
                  const obj = (item && typeof item === "object"
                    ? (item as Record<string, unknown>)
                    : {}) as Record<string, unknown>;
                  const subOpts =
                    sub.options ||
                    (sub.optionsFrom
                      ? template.options?.[sub.optionsFrom]
                      : undefined) ||
                    [];
                  if (sub.type === "select") {
                    return (
                      <Select
                        key={sub.key}
                        value={String(obj[sub.key] ?? "")}
                        onChange={(e) => {
                          const next = [...list];
                          next[idx] = { ...obj, [sub.key]: e.target.value };
                          onChange(next);
                        }}
                      >
                        {subOpts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    );
                  }
                  return (
                    <Input
                      key={sub.key}
                      type={sub.type === "slider" || sub.type === "number" ? "number" : "text"}
                      placeholder={sub.label || sub.key}
                      value={String(obj[sub.key] ?? "")}
                      onChange={(e) => {
                        const next = [...list];
                        const v =
                          sub.type === "slider" || sub.type === "number"
                            ? Number(e.target.value)
                            : e.target.value;
                        next[idx] = { ...obj, [sub.key]: v };
                        onChange(next);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <Input
                className="flex-1"
                placeholder={field.item?.placeholder}
                value={String(item ?? "")}
                onChange={(e) => {
                  const next = [...list];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(list.filter((_, i) => i !== idx))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (field.item?.type === "object") {
              onChange([...list, {}]);
            } else {
              onChange([...list, ""]);
            }
          }}
        >
          Add
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Label>{field.label || field.key}</Label>
      {field.secret ? (
        <SecretInput
          value={String(value ?? "")}
          onChange={(v) => onChange(v)}
          placeholder={field.placeholder}
          required={field.required}
        />
      ) : (
        <Input
          type="text"
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )}
      {field.description && (
        <p className="mt-1 text-xs text-muted">{field.description}</p>
      )}
    </div>
  );
}
