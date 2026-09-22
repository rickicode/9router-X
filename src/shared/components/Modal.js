"use client";

import { useEffect } from "react";
import { cn } from "@/shared/utils/cn";
import Button from "./Button";


export default function Modal({
 isOpen,
 onClose,
 title,
 children,
 footer,
 size = "md",
 closeOnOverlay = true,
 showTrafficLights = true,
 className,
}) {
 const sizes = {
 sm: "max-w-sm",
 md: "max-w-md",
 lg: "max-w-lg",
 xl: "max-w-xl",
 full: "max-w-4xl",
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
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
 {/* Overlay */}
 <div
 className="absolute inset-0 bg-black/40 fade-in"
 onClick={closeOnOverlay ? onClose : undefined}
 aria-hidden="true"
 />

 {/* Modal content */}
 <div
 role="dialog"
 aria-modal="true"
 aria-label={title || "Dialog"}
 className={cn(
 "relative w-full bg-surface",
 "border border-border",
 "rounded-sm ",
 "fade-in",
 sizes[size],
 className
 )}
 >
 {/* Header */}
 {(title || showTrafficLights) && (
 <div className="flex h-12 items-center justify-between gap-3 border-b border-border px-3">
 {title ? <h2 className="text-sm font-semibold text-text-main">{title}</h2> : <span />}
 <button
 type="button"
 onClick={onClose}
 aria-label="Close dialog"
 className="size-8 rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main"
 >
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
 </button>
 </div>
 )}

 {/* Body */}
 <div className="max-h-[calc(85vh-100px)] overflow-y-auto p-3 custom-scrollbar">{children}</div>

 {/* Footer */}
 {footer && (
 <div className="flex items-center justify-end gap-2 border-t border-border p-3">
 {footer}
 </div>
 )}
 </div>
 </div>
 );
}

export function ConfirmModal({
 isOpen,
 onClose,
 onConfirm,
 title = "Confirm",
 message,
 confirmText = "Confirm",
 cancelText = "Cancel",
 variant = "danger",
 loading = false,
}) {
 return (
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title={title}
 size="sm"
 footer={
 <>
 <Button variant="ghost" onClick={onClose} disabled={loading}>
 {cancelText}
 </Button>
 <Button variant={variant} onClick={onConfirm} loading={loading}>
 {confirmText}
 </Button>
 </>
 }
 >
 <p className="text-text-muted">{message}</p>
 </Modal>
 );
}
