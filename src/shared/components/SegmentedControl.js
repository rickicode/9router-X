"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabelProp,
  ariaLabel,
  ...props
}) {
  const tabRefs = useRef([]);

  const sizes = {
    sm: "h-7 text-xs px-2.5",
    md: "h-9 text-sm px-3.5",
    lg: "h-11 text-base px-4",
  };

  const iconSizes = {
    sm: "!text-[13px] !w-3.5 !h-3.5",
    md: "!text-[16px] !w-4 !h-4",
    lg: "!text-[18px] !w-5 !h-5",
  };

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const activeTabStopIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = useCallback(
    (e) => {
      if (!options.length) return;
      const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      let nextIndex = -1;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % options.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + options.length) % options.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = options.length - 1;
      }

      if (nextIndex >= 0 && nextIndex !== currentIndex) {
        onChange?.(options[nextIndex].value);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [options, selectedIndex, onChange]
  );

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabelProp || ariaLabel || "Options"}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center p-1 rounded-[10px] overflow-x-auto max-w-full no-scrollbar",
        "bg-surface-2 border border-border-subtle",
        className
      )}
      {...props}
    >
      {options.map((option, index) => {
        const isSelected = value === option.value;
        const isTabStop = index === activeTabStopIndex;

        return (
          <button
            key={option.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "inline-flex items-center justify-center shrink-0 rounded-[8px] font-medium transition-all gap-1.5 cursor-pointer select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
              sizes[size],
              isSelected
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
        );
      })}
    </div>
  );
}
