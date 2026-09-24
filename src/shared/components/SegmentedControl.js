"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  snap = false,
  className,
  "aria-label": ariaLabelProp,
  ariaLabel,
  ...props
}) {
  const tabRefs = useRef([]);

  // Matches the Quota Tracker tab bar: padding-based height, text-xs labels,
  // selected tab filled with the primary color.
  // `touch` keeps a 40px minimum height so the control stays tappable on phones.
  const sizes = {
    sm: "px-2 py-1.5 text-[11px]",
    md: "px-2.5 py-2 text-xs",
    lg: "px-3 py-2 text-sm",
    touch: "px-2.5 py-1 text-xs min-h-7 min-w-7 sm:min-h-7",
  };

  const iconSizes = {
    sm: "text-[16px]",
    md: "text-[18px]",
    lg: "text-[18px]",
    touch: "text-[16px]",
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
  "inline-flex items-center gap-0.5 rounded-sm border border-border bg-surface p-0.5",
  "max-w-full overflow-x-auto no-scrollbar",
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
          data-active={isSelected ? "true" : undefined}
          onClick={() => onChange?.(option.value)}
          className={cn(
            "inline-flex items-center justify-center shrink-0 rounded-sm font-medium gap-1.5 cursor-pointer select-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            snap && "scroll-snap-align-start",
            sizes[size],
  isSelected
  ? "bg-primary text-white"
  : "text-text-muted hover:text-text-main hover:bg-surface-2"
  )}
 >
 {option.icon && (
 <span
 className={cn(
 "material-symbols-outlined shrink-0 inline-flex items-center justify-center",
 iconSizes[size] || "text-[18px]"
 )}
 >
 {option.icon}
 </span>
 )}
 <span className="whitespace-nowrap">{option.label}</span>
 </button>
 );
 })}
 </div>
 );
}
