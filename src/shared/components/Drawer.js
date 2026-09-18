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
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] fade-in cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className={cn(
        "absolute right-0 bottom-0 sm:top-0 w-full max-w-[100vw] h-[90vh] sm:h-full max-h-[90vh] sm:max-h-none bg-surface flex flex-col",
        "rounded-t-2xl sm:rounded-none",
        "shadow-[var(--shadow-elev)]",
        "slide-in-right",
        "border-t sm:border-t-0 sm:border-l border-border-subtle",
        widths[width] || widths.md,
        className
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            {title && (
              <h2 className="text-base sm:text-lg font-semibold text-text-main">{title}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-[10px] text-text-muted hover:bg-surface-2 hover:text-text-main transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
