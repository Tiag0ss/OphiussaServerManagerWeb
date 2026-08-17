"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyLabel = "All (no restriction)",
}: {
  options: Opt[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.filter((o) => value.includes(o.id)),
    [options, value],
  );

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm"
      >
        <span className={cn(!selected.length && "text-muted")}>
          {selected.length
            ? selected.map((s) => s.name).join(", ")
            : emptyLabel || placeholder}
        </span>
        <span className="text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-xl">
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-card-elevated"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </button>
            </li>
            {options.map((o) => {
              const on = value.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-card-elevated",
                      on && "bg-accent-soft text-accent",
                    )}
                    onClick={() => toggle(o.id)}
                  >
                    <span className="inline-flex size-4 items-center justify-center rounded border border-border text-[10px]">
                      {on ? "✓" : ""}
                    </span>
                    {o.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
