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
 sm: "h-8 text-xs px-2",
 md: "h-8 text-sm px-2.5",
 lg: "h-8 text-sm px-3",
 };

 const iconSizes = {
 sm: "text-[18px]",
 md: "text-[18px]",
 lg: "text-[18px]",
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
 "inline-flex items-center border border-border bg-bg",
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
 onClick={() => onChange?.(option.value)}
 className={cn(
 "inline-flex items-center justify-center shrink-0 rounded-sm font-medium gap-1.5 cursor-pointer select-none",
 "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
 sizes[size],
 isSelected
 ? "bg-surface text-text-main"
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
