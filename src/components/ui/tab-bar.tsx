"use client";

import { cn } from "@/lib/utils";

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  labels,
  className,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  labels?: Partial<Record<T, string>>;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-5 overflow-x-auto border-b border-border",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={value === t}
          onClick={() => onChange(t)}
          className={cn(
            "shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 text-sm capitalize transition",
            value === t
              ? "border-accent font-medium text-foreground"
              : "border-transparent text-muted hover:text-foreground",
          )}
        >
          {labels?.[t] ?? t}
        </button>
      ))}
    </div>
  );
}
