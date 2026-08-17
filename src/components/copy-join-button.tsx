"use client";

import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";

export function CopyJoinButton({
  address,
  size = "sm",
}: {
  address: string | null;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <Button type="button" variant="secondary" size={size} disabled>
        No join address
      </Button>
    );
  }

  async function copy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={copy}
      title={address}
    >
      {copied ? "Copied" : "Copy join"}
    </Button>
  );
}
