"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-primary text-black hover:bg-primary-hover disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "border border-border bg-surface text-text-main hover:bg-surface-2 disabled:opacity-50",
  outline: "border border-border text-text-main hover:bg-surface-2",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main",
  danger: "bg-danger text-black hover:bg-danger disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-success text-black hover:bg-success disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "h-9 min-w-9 px-2.5 text-xs",
  md: "h-11 min-w-11 px-3 text-sm",
  lg: "h-12 px-4 text-sm",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{iconRight}</span>
      )}
    </button>
  );
}
