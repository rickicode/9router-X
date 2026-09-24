"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";

const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

// Core & Routing
const coreRoutingItems = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo Adapter", icon: "layers" },
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
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [mediaOpen, setMediaOpen] = useState(false);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-sidebar min-h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <Link href="/dashboard" prefetch={false} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-sm" aria-label="Dashboard">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary text-white">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">hub</span>
          </div>
          <span className="truncate text-sm font-semibold text-text-main">{APP_CONFIG.name}</span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="size-10 rounded-sm text-text-muted hover:text-text-main hover:bg-surface-2"
            aria-label="Close navigation sidebar"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {/* Core & Routing Section */}
        <div className="mb-4">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Core & Routing</span>
          </div>
          {coreRoutingItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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

        {/* System & Tools Section */}
        <div className="pt-2 border-t border-border/50">
          <div className="px-3 mb-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">System & Tools</span>
          </div>
          {toolsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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

          {/* Media Providers accordion */}
          <button
            onClick={() => setMediaOpen((v) => !v)}
            className={cn(
              "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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
                  prefetch={false}
                  onClick={onClose}
                  aria-current={pathname.startsWith(`/dashboard/media-providers/${kind.id}`) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 pl-9 pr-3 rounded-sm text-[13px] transition-colors",
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
                prefetch={false}
                onClick={onClose}
                aria-current={pathname.startsWith(COMBINED_WEB_ITEM.href) ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 pl-9 pr-3 rounded-sm text-[13px] transition-colors",
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
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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

          {debugItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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

          {/* Settings */}
          <Link
            href="/dashboard/profile"
            prefetch={false}
            onClick={onClose}
            className={cn(
              "flex min-h-11 items-center gap-3 px-3 rounded-sm text-[13px] font-medium transition-colors",
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

      <div className="flex min-h-11 items-center border-t border-border px-1">
        <a
          href="https://github.com/rickicode/AxonRouter"
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center rounded-sm px-2 text-xs text-text-muted hover:text-text-main"
        >
          AxonRouter · GitHub
        </a>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};
