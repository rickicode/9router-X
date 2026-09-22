"use client";

import { cn } from "@/shared/utils/cn";

export default function Input({
 label,
 type = "text",
 placeholder,
 value,
 onChange,
 error,
 hint,
 icon,
 disabled = false,
 required = false,
 className,
 inputClassName,
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
 {icon && (
 <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
 <span className="material-symbols-outlined text-[18px]">{icon}</span>
 </div>
 )}
 <input
 type={type}
 placeholder={placeholder}
 value={value}
 onChange={onChange}
 disabled={disabled}
 className={cn(
 "h-8 w-full border border-border bg-surface px-2 text-sm text-text-main",
 "placeholder:text-text-subtle",
 "outline-none focus:border-primary",
 "disabled:cursor-not-allowed disabled:opacity-50",
 // iOS zoom fix
 icon && "pl-10",
 error && "ring-1 ring-danger border-danger/30",
 inputClassName
 )}
 {...props}
 />
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
