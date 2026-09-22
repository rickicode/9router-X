"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import NineRemotePromoModal from "./NineRemotePromoModal";

// Module-level fetch cache: sidebar re-mounts on navigation; these promises
// persist for the SPA session so /api/settings + /api/version fire once.
let settingsPromise = null;
let versionPromise = null;
const fetchSettingsOnce = () =>
  (settingsPromise ||= fetch("/api/settings").then((res) => res.json()).catch((e) => { settingsPromise = null; throw e; }));
const fetchVersionOnce = () =>
  (versionPromise ||= fetch("/api/version").then((res) => res.json()).catch((e) => { versionPromise = null; throw e; }));

// const VISIBLE_MEDIA_KINDS = ["embedding", "image", "imageToText", "tts", "stt", "webSearch", "webFetch", "video", "music"];
const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
// Combined entry: webSearch + webFetch share one page at /dashboard/media-providers/web
const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

// Core Features
const coreItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
];

// Routing & Performance
const routingItems = [
  { href: "/dashboard/combos", label: "Combo & Vision Adapter", icon: "layers" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/proxy-fitness", label: "Proxy Fitness", icon: "network_check" },
];

// Monitoring
const monitoringItems = [
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/usage", label: "Usage & Analytics", icon: "bar_chart" },
  { href: "/dashboard/benchmark", label: "Benchmark", icon: "speed" },
];

// Tools & Integration
const toolsItems = [
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

export default function Sidebar({ onClose }) {
 const pathname = usePathname();
 const [mediaOpen, setMediaOpen] = useState(false);
 const [showRemoteModal, setShowRemoteModal] = useState(false);
 const [isDisconnected, setIsDisconnected] = useState(false);
 const [updateInfo, setUpdateInfo] = useState(null);
 const [showUpdateModal, setShowUpdateModal] = useState(false);
 const [isUpdating, setIsUpdating] = useState(false);
 const [shutdownCountdown, setShutdownCountdown] = useState(0);
 const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
 const [shutdownCancelled, setShutdownCancelled] = useState(false);
 const [enableTranslator, setEnableTranslator] = useState(false);
 const shutdownTimerRef = useRef(null);
 const { copied, copy } = useCopyToClipboard(2000);

 const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

 // Cleanup shutdown timer on unmount
 useEffect(() => {
 return () => {
 if (shutdownTimerRef.current) {
 clearInterval(shutdownTimerRef.current);
 }
 };
 }, []);

 useEffect(() => {
 fetch("/api/settings")
 .then(res => res.json())
 .then(data => { if (data.enableTranslator) setEnableTranslator(true); })
 .catch(() => {});
 }, []);

 // Lazy check for new npm version on mount
 useEffect(() => {
 fetch("/api/version")
 .then(res => res.json())
 .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
 .catch(() => {});
 }, []);

 const isActive = (href) => {
 if (href === "/dashboard/endpoint") {
 return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
 }
 return pathname.startsWith(href);
 };

 // Open manual update panel (no countdown yet — user must click Copy to trigger shutdown)
 const handleUpdate = () => {
 setShowUpdateModal(false);
 setIsUpdating(true);
 setShutdownCancelled(false);
 };

 // User clicked "Copy & Shutdown" inside panel -> prompt confirm modal first
 const handleRequestShutdown = () => {
 setShowShutdownConfirm(true);
 };

 // User confirmed shutdown: copy command, initiate countdown + undo window, then shutdown
 const handleConfirmShutdown = async () => {
 setShowShutdownConfirm(false);
 setShutdownCancelled(false);
 try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
 copy(INSTALL_CMD);
 let remaining = UPDATER_CONFIG.shutdownCountdownSec || 10;
 setShutdownCountdown(remaining);
 if (shutdownTimerRef.current) clearInterval(shutdownTimerRef.current);
 shutdownTimerRef.current = setInterval(() => {
 remaining -= 1;
 setShutdownCountdown(remaining);
 if (remaining <= 0) {
 clearInterval(shutdownTimerRef.current);
 shutdownTimerRef.current = null;
 fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
 setIsDisconnected(true);
 }
 }, 1000);
 };

 // Undo window: user can abort the shutdown countdown at any time
 const handleUndoShutdown = () => {
 if (shutdownTimerRef.current) {
 clearInterval(shutdownTimerRef.current);
 shutdownTimerRef.current = null;
 }
 setShutdownCountdown(0);
 setShutdownCancelled(true);
 };

 const handleCancelUpdate = () => {
 if (shutdownTimerRef.current) {
 clearInterval(shutdownTimerRef.current);
 shutdownTimerRef.current = null;
 }
 setIsUpdating(false);
 setShutdownCountdown(0);
 setShutdownCancelled(false);
 };

 // Note: legacy updater poll removed. New flow: copy install cmd + shutdown server,
 // user runs the command manually in another terminal.


 return (
 <>
 <aside className="flex w-60 flex-col border-r border-border bg-sidebar min-h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" aria-label="Dashboard">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary text-white">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">hub</span>
 </div>
 <span className="truncate text-sm font-semibold text-text-main">{APP_CONFIG.name}</span>
 </Link>
 {onClose && (
 <button
 type="button"
 onClick={onClose}
            className="size-9 rounded-sm text-text-muted hover:text-text-main hover:bg-surface-2"
 aria-label="Close navigation sidebar"
 >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
 </button>
 )}
 </div>



      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {/* Core Section */}
        <div className="mb-4">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Core</span>
          </div>
          {coreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : ""
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Routing & Performance Section */}
        <div className="mb-4">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Routing & Performance</span>
          </div>
          {routingItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : ""
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Monitoring Section */}
        <div className="mb-4">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Monitoring</span>
          </div>
          {monitoringItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : ""
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Tools Section */}
        <div className="mb-4">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Tools</span>
          </div>
          {toolsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : ""
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* System Section */}
        <div className="pt-2 border-t border-border/50">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">System</span>
          </div>

          {/* Media Providers accordion */}
          <button
            onClick={() => setMediaOpen((v) => !v)}
            className={cn(
              "flex h-9 w-full items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
              pathname.startsWith("/dashboard/media-providers")
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">perm_media</span>
            <span className="flex-1 text-left">Media Providers</span>
            <span 
              className="material-symbols-outlined text-[18px] transition-transform" 
              style={{ transform: mediaOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              expand_more
            </span>
          </button>
          
          {mediaOpen && (
            <div className="mt-1 space-y-0.5">
              {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                <Link
                  key={kind.id}
                  href={`/dashboard/media-providers/${kind.id}`}
                  onClick={onClose}
                  className={cn(
                    "flex h-8 items-center gap-3 pl-9 pr-3 rounded-sm text-[13px] transition-colors",
                    pathname.startsWith(`/dashboard/media-providers/${kind.id}`)
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">{kind.icon}</span>
                  <span>{kind.label}</span>
                </Link>
              ))}
              <Link
                key={COMBINED_WEB_ITEM.id}
                href={COMBINED_WEB_ITEM.href}
                onClick={onClose}
                className={cn(
                  "flex h-8 items-center gap-3 pl-9 pr-3 rounded-sm text-[13px] transition-colors",
                  pathname.startsWith(COMBINED_WEB_ITEM.href)
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">{COMBINED_WEB_ITEM.icon}</span>
                <span>{COMBINED_WEB_ITEM.label}</span>
              </Link>
            </div>
          )}

          {systemItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : ""
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Debug items */}
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Debug</span>
          </div>
          {debugItems.map((item) => {
            const show = item.href !== "/dashboard/translator" || enableTranslator;
            return show ? (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-[18px]",
                    isActive(item.href) ? "fill-1" : ""
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            ) : null;
          })}


          {/* Settings */}
          <Link
            href="/dashboard/profile"
            onClick={onClose}
            className={cn(
              "flex h-9 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
              isActive("/dashboard/profile")
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            )}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[18px]",
                isActive("/dashboard/profile") ? "fill-1" : ""
              )}
            >
              settings
            </span>
            <span>Settings</span>
          </Link>
        </div>
      </nav>

 <div className="flex h-8 items-center border-t border-border px-3">
 <a
 href="https://github.com/rickicode/9router-X"
 target="_blank"
 rel="noreferrer"
 className="text-xs text-text-muted hover:text-text-main"
 >
 X Version · GitHub
 </a>
 </div>

 </aside>

 {/* Remote Promo Modal */}
 <NineRemotePromoModal isOpen={showRemoteModal} onClose={() => setShowRemoteModal(false)} />

 {/* Update Confirmation Modal */}
 <ConfirmModal
 isOpen={showUpdateModal}
 onClose={() => setShowUpdateModal(false)}
 onConfirm={handleUpdate}
 title="Update 9Router"
 message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
 confirmText="Show Command"
 cancelText="Cancel"
 variant="primary"
 />

 {/* Shutdown Confirmation Modal */}
 <ConfirmModal
 isOpen={showShutdownConfirm}
 onClose={() => setShowShutdownConfirm(false)}
 onConfirm={handleConfirmShutdown}
 title="Confirm Server Shutdown"
 message={`9Router will copy the update command to your clipboard and begin a ${UPDATER_CONFIG.shutdownCountdownSec || 10}-second countdown before shutting down. You will have an undo window to cancel if needed.\n\nProceed?`}
 confirmText="Proceed with Shutdown"
 cancelText="Cancel"
 variant="danger"
 />

 {/* Disconnected / Updating Overlay */}
 {(isDisconnected || isUpdating) && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-3 p-3">
 {isUpdating ? (
 <ManualUpdatePanel
 latestVersion={updateInfo?.latestVersion}
 installCmd={INSTALL_CMD}
 copied={copied}
 onRequestShutdown={handleRequestShutdown}
 onUndoShutdown={handleUndoShutdown}
 onCancel={handleCancelUpdate}
 countdown={shutdownCountdown}
 shutdownCancelled={shutdownCancelled}
 isDisconnected={isDisconnected}
 />
 ) : (
 <div className="text-center p-3">
 <div className="mb-3 flex size-8 items-center justify-center rounded-sm bg-danger/10 text-danger">
 <span className="material-symbols-outlined text-[18px]">power_off</span>
 </div>
 <h2 className="mb-2 text-sm font-semibold text-text-main">Server Disconnected</h2>
 <p className="text-text-muted mb-3">The proxy server has been stopped.</p>
 <Button variant="secondary" onClick={() => globalThis.location.reload()}>
 Reload Page
 </Button>
 </div>
 )}
 </div>
 )}
 </>
 );
}

Sidebar.propTypes = {
 onClose: PropTypes.func,
};

function ManualUpdatePanel({
 latestVersion,
 installCmd,
 copied,
 onRequestShutdown,
 onUndoShutdown,
 onCancel,
 countdown,
 shutdownCancelled,
 isDisconnected,
}) {
 const isCountingDown = countdown > 0;
 return (
 <div className="w-full max-w-lg rounded-sm bg-surface/95 border border-border p-3 text-white">
 <div className="flex items-center gap-3 mb-3">
 <div className="flex items-center justify-center size-11 rounded-sm bg-warning/10 text-warning shrink-0">
 <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
 {isCountingDown ? "timer" : "content_copy"}
 </span>
 </div>
 <div>
 <h2 className="text-lg font-medium">Update 9Router{latestVersion ? ` to v${latestVersion}` : ""}</h2>
 <p className="text-xs text-text-muted">
 {isDisconnected
 ? "Server stopped. Paste the command into a terminal to install."
 : isCountingDown
 ? `Command copied! Server stopping in ${countdown}s. Click 'Undo' to abort.`
 : shutdownCancelled
 ? "Shutdown aborted. Server remains active. Command copied."
 : "Review the command below, then click 'Copy & Shutdown'."}
 </p>
 </div>
 </div>

 <p className="text-sm text-text-main mb-2 font-medium">Install command:</p>
 <div className="w-full px-3 h-8 rounded-sm bg-surface border border-border mb-3">
 <code className="text-xs font-mono text-warning break-all">{installCmd}</code>
 </div>

 <ol className="text-xs text-text-muted space-y-3 list-decimal list-inside mb-3">
 <li>Click <strong>Copy & Shutdown</strong> and confirm.</li>
 <li>Paste the command into your terminal and press Enter.</li>
 <li>Run <code className="px-1 py-1 rounded-sm bg-white/10 text-success font-mono">9router</code> again after install.</li>
 </ol>

 {isDisconnected ? (
 <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
 Reload Page
 </Button>
 ) : isCountingDown ? (
 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between text-xs px-3 h-8 rounded-sm bg-warning/10 border border-warning/30 text-warning">
 <span className="flex items-center gap-2">
 <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>
 Shutting down in {countdown}s...
 </span>
 <span className="font-mono text-xs">Undo window active</span>
 </div>
 <Button
 variant="danger"
 fullWidth
 onClick={onUndoShutdown}
 aria-label="Cancel server shutdown"
 >
 Undo Shutdown ({countdown}s)
 </Button>
 </div>
 ) : (
 <div className="flex gap-2">
 <Button variant="secondary" onClick={onCancel}>
 Cancel
 </Button>
 <Button
 variant="primary"
 fullWidth
 onClick={onRequestShutdown}
 aria-label="Copy install command and initiate shutdown"
 >
 {copied ? "✓ Copied — Click to Shutdown" : "Copy & Shutdown"}
 </Button>
 </div>
 )}
 </div>
 );
}

ManualUpdatePanel.propTypes = {
 latestVersion: PropTypes.string,
 installCmd: PropTypes.string.isRequired,
 copied: PropTypes.bool,
 onRequestShutdown: PropTypes.func.isRequired,
 onUndoShutdown: PropTypes.func.isRequired,
 onCancel: PropTypes.func.isRequired,
 countdown: PropTypes.number,
 shutdownCancelled: PropTypes.bool,
 isDisconnected: PropTypes.bool,
};
