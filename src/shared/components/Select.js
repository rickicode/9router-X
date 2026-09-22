"use client";

import { cn } from "@/shared/utils/cn";

export default function Select({
 label,
 options = [],
 value,
 onChange,
 placeholder = "Select an option",
 error,
 hint,
 disabled = false,
 required = false,
 className,
 selectClassName,
 ...props
}) {
 return (
 <div className={cn("flex flex-col gap-1", className)}>
 {label && (
 <label className="text-xs font-medium text-text-muted">
 {label}
 {required && <span className="text-danger ml-1">*</span>}
 </label>
 )}
 <div className="relative">
 <select
 value={value}
 onChange={onChange}
 disabled={disabled}
 className={cn(
 "h-8 w-full appearance-none border border-border bg-surface px-2 pr-8 text-sm text-text-main",
 "outline-none focus:border-primary",
 "disabled:cursor-not-allowed disabled:opacity-50",

 error && "ring-1 ring-danger border-danger/30",
 selectClassName
 )}
 {...props}
 >
 <option value="" disabled>
 {placeholder}
 </option>
 {options.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>
 <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-text-muted">
 <span className="material-symbols-outlined text-[18px]">expand_more</span>
 </div>
 </div>
 {error && (
 <p className="text-xs text-danger flex items-center gap-1">
 <span className="material-symbols-outlined text-[18px]">error</span>
 {error}
 </p>
 )}
 {hint && !error && (
 <p className="text-xs text-text-muted">{hint}</p>
 )}
 </div>
 );
}
