import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3.5 py-2 text-sm",
        variant === "primary" &&
          "bg-accent text-accent-fg hover:brightness-110 shadow-[0_0_0_1px_rgba(61,156,253,0.35)]",
        variant === "secondary" &&
          "border border-border bg-card-elevated text-foreground hover:border-accent/40 hover:bg-accent-soft",
        variant === "danger" &&
          "bg-danger/90 text-[#1a0a0a] hover:brightness-110",
        variant === "ghost" &&
          "text-muted hover:bg-accent-soft hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
