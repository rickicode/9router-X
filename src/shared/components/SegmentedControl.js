"use client";

import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs px-2.5",
    md: "h-9 text-sm px-3.5",
    lg: "h-11 text-base px-4",
  };

  const iconSizes = {
    sm: "text-[15px]",
    md: "text-[18px]",
    lg: "text-[20px]",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-[10px] overflow-x-auto max-w-full",
        "bg-surface-2 border border-border-subtle",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center justify-center shrink-0 rounded-[8px] font-medium transition-all gap-1.5 cursor-pointer select-none",
            sizes[size],
            value === option.value
              ? "bg-surface text-text-main shadow-sm font-semibold"
              : "text-text-muted hover:text-text-main hover:bg-surface/50"
          )}
        >
          {option.icon && (
            <span
              className={cn(
                "material-symbols-outlined leading-none shrink-0 inline-flex items-center justify-center",
                iconSizes[size] || "text-[16px]"
              )}
            >
              {option.icon}
            </span>
          )}
          <span className="leading-none whitespace-nowrap">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
