"use client";

import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";

export function CopyTextButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  size = "sm",
  variant = "ghost",
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      className={className}
      title={`Copy ${text}`}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
