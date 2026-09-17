"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide,
  maximizable,
  fill,
  maximized: controlledMaximized,
  onMaximizedChange,
  actions,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** Show maximize / restore button */
  maximizable?: boolean;
  /** Stretch body to fill available modal height (for editors) */
  fill?: boolean;
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
  /** Extra actions rendered in the header (e.g. Save) */
  actions?: React.ReactNode;
}) {
  const [internalMaximized, setInternalMaximized] = useState(false);
  const maximized = controlledMaximized ?? internalMaximized;

  function setMaximized(next: boolean) {
    if (controlledMaximized === undefined) setInternalMaximized(next);
    onMaximizedChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setMaximized(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Render at the document root instead of wherever this Modal happens to be
  // mounted, so it isn't clipped/stacked incorrectly by an ancestor's
  // overflow/z-index/transform (e.g. the files browser's scrollable panes).
  // Note: React still bubbles events through the *component* tree for
  // portals, not the DOM tree — this doesn't by itself stop an ancestor's
  // keydown handler from seeing keys pressed inside the modal.
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        maximized ? "items-stretch p-2" : "items-center justify-center p-4",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl",
          maximized
            ? "h-full max-h-none max-w-none"
            : fill
              ? cn("h-[80vh] max-h-[80vh]", wide ? "max-w-2xl" : "max-w-lg")
              : cn(
                  "max-h-[90vh] overflow-y-auto p-5",
                  wide ? "max-w-2xl" : "max-w-lg",
                ),
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-border",
            maximized || fill ? "border-b px-4 py-3" : "mb-4",
          )}
        >
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {title}
            </h3>
            {description && (
              <p className="mt-0.5 truncate text-sm text-muted">{description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {maximizable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={maximized ? "Restore" : "Maximize"}
                onClick={() => setMaximized(!maximized)}
              >
                {maximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div
          className={cn(
            fill && "flex min-h-0 flex-1 flex-col overflow-hidden",
            (maximized || fill) && "px-4 pb-4 pt-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
