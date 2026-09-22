"use client";

import { useEffect } from "react";
import { cn } from "@/shared/utils/cn";

export default function Drawer({
 isOpen,
 onClose,
 title,
 children,
 width = "md",
 className
}) {
 const widths = {
 sm: "w-full sm:w-[400px] max-w-[100vw]",
 md: "w-full sm:w-[500px] max-w-[100vw]",
 lg: "w-full sm:w-[600px] max-w-[100vw]",
 xl: "w-full sm:w-[800px] max-w-[100vw]",
 full: "w-full max-w-[100vw]",
 };

 useEffect(() => {
 if (isOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => { document.body.style.overflow = ""; };
 }, [isOpen]);

 useEffect(() => {
 const handleEscape = (e) => {
 if (e.key === "Escape" && isOpen) onClose();
 };
 document.addEventListener("keydown", handleEscape);
 return () => document.removeEventListener("keydown", handleEscape);
 }, [isOpen, onClose]);

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50">
 {/* Overlay */}
 <div
 className="absolute inset-0 bg-black/80 fade-in cursor-pointer"
 onClick={onClose}
 aria-hidden="true"
 />

 {/* Drawer panel */}
 <div className={cn(
 "absolute right-0 bottom-0 sm:top-0 w-full max-w-[100vw] h-[90vh] sm:h-full max-h-[90vh] sm:max-h-none bg-surface flex flex-col",
 "rounded-none",
 "shadow-none",
 "slide-in-right",
 "border-t sm:border-t-0 sm:border-l border-border",
 widths[width] || widths.md,
 className
 )}>
 {/* Header */}
 <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
 <div className="flex items-center gap-2">
 {title && (
 <h2 className="text-sm font-semibold text-text-main">{title}</h2>
 )}
 </div>
 <button
 type="button"
 onClick={onClose}
 aria-label="Close drawer"
 className="flex size-8 items-center justify-center text-text-muted hover:bg-bg hover:text-text-main"
 >
 <span className="material-symbols-outlined text-[18px]">close</span>
 </button>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] custom-scrollbar">
 {children}
 </div>
 </div>
 </div>
 );
}
