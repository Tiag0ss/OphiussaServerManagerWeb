"use client";

import { useState } from "react";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SecretInput({
  value,
  onChange,
  placeholder,
  required,
  className,
  id,
  name,
  defaultValue,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
  defaultValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined && onChange !== undefined;
  const current = controlled ? value : internal;

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        value={current}
        onChange={(e) => {
          if (controlled) onChange(e.target.value);
          else setInternal(e.target.value);
        }}
        autoComplete="new-password"
        className="flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
