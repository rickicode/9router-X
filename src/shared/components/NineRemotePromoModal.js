"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

const FEATURES = [
 { icon: "terminal", label: "Terminal", desc: "Full shell access" },
 { icon: "cast", label: "Desktop", desc: "Screen sharing" },
 { icon: "folder_open", label: "Files", desc: "Browse & edit files" },
];

const BULLETS = [
 { icon: "qr_code_scanner", text: "Scan QR to connect instantly" },
 { icon: "wifi_off", text: "No port forwarding needed" },
 { icon: "devices", text: "Works on any device" },
];

const NINE_REMOTE_URL = "https://9remote.cc";

export default function NineRemotePromoModal({ isOpen, onClose }) {
 useEffect(() => {
 if (!isOpen) return;
 document.body.style.overflow = "hidden";
 const onEsc = (e) => { if (e.key === "Escape") onClose(); };
 document.addEventListener("keydown", onEsc);
 return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onEsc); };
 }, [isOpen, onClose]);

 if (!isOpen) return null;

 return createPortal(
 <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3">
 <div className="absolute inset-0 bg-black/80 fade-in" onClick={onClose} />

 <div className="relative w-full max-w-sm rounded-sm overflow-hidden fade-in flex flex-col bg-surface border border-border">
 {/* Header */}
 <div className="flex items-center justify-between px-3 border-b border-border h-8">
 <div className="flex items-center gap-3">
 <div className="size-8 rounded-sm flex items-center justify-center bg-primary">
 <span className="material-symbols-outlined text-white text-sm">terminal</span>
 </div>
 <span className="text-xs font-medium text-primary font-mono">9Remote</span>
 </div>
 <button
 onClick={onClose}
 className="p-1.5 rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main"
 >
 <span className="material-symbols-outlined text-sm">close</span>
 </button>
 </div>

 {/* Body */}
 <div className="px-7 py-7 pb-9 flex flex-col gap-3">
 {/* Hero */}
 <div className="flex flex-col items-center gap-2 text-center mt-2">
 <div className="w-14 h-14 rounded-sm flex items-center justify-center mb-1 bg-primary">
 <span className="material-symbols-outlined text-white text-[30px]">terminal</span>
 </div>
 <h1 className="text-sm font-semibold text-text-main">9Remote</h1>
 <p className="text-xs text-text-muted leading-5 max-w-[220px]">
 Access your terminal, desktop &amp; files from anywhere
 </p>
 </div>

 {/* Feature cards */}
 <div className="flex gap-2 w-full">
 {FEATURES.map(({ icon, label, desc }) => (
 <div key={label} className="flex-1 flex flex-col items-center gap-1.5 py-3 px-1 rounded-sm border border-border bg-surface">
 <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
 <p className="text-xs font-medium text-text-main">{label}</p>
 <p className="text-[11px] text-text-muted text-center leading-4">{desc}</p>
 </div>
 ))}
 </div>

 {/* Bullets */}
 <div className="flex flex-col gap-3 w-full">
 {BULLETS.map(({ icon, text }) => (
 <div key={icon} className="flex items-center gap-3">
 <span className="material-symbols-outlined flex-shrink-0 text-primary text-[18px]">{icon}</span>
 <span className="text-xs text-text-muted">{text}</span>
 </div>
 ))}
 </div>

 {/* CTA */}
 <button
 onClick={() => window.open(NINE_REMOTE_URL, "_blank")}
 className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-sm bg-primary hover:bg-primary-hover"
 >
 <span className="material-symbols-outlined text-sm">open_in_new</span>
 Get 9Remote
 </button>
 </div>
 </div>
 </div>,
 document.body
 );
}
