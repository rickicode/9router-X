"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: "info",
  };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  const mobileDrawerRef = useRef(null);
  const triggerRef = useRef(null);

  // Handle Escape key and focus trap for mobile drawer
  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        return;
      }

      if (e.key === "Tab" && mobileDrawerRef.current) {
        const focusableElements = mobileDrawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Focus first focusable element inside drawer on open
    const timer = setTimeout(() => {
      if (mobileDrawerRef.current) {
        const focusable = mobileDrawerRef.current.querySelector(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) focusable.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    };
  }, [sidebarOpen]);

  const handleOpenMenu = (e) => {
    triggerRef.current = e?.currentTarget || null;
    setSidebarOpen(true);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      {/* Skip Link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand-700 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 font-medium text-sm"
      >
        Skip to main content
      </a>

      {/* Accessible Toast Notifications container */}
      <div
        className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${style.wrapper}`}
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] leading-5" aria-hidden="true">
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
                    aria-label="Dismiss notification"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="button"
          tabIndex={-1}
          aria-label="Close navigation sidebar"
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile Drawer with Focus Trap */}
      <div
        ref={mobileDrawerRef}
        role="dialog"
        aria-modal={sidebarOpen}
        aria-label="Navigation sidebar"
        className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-col flex-1 h-full min-w-0 relative transition-colors duration-300 isolate outline-none"
      >
        {/* Faint grid background */}
        <div className="landing-grid absolute inset-0 pointer-events-none -z-10" aria-hidden="true" />
        <Header key={pathname} onMenuClick={handleOpenMenu} />
        <div className={`flex-1 overflow-y-auto custom-scrollbar ${pathname === "/dashboard/basic-chat" ? "" : "p-6 lg:p-10"} ${pathname === "/dashboard/basic-chat" ? "flex flex-col overflow-hidden" : ""}`}>
          <div className={`${pathname === "/dashboard/basic-chat" ? "flex-1 w-full h-full flex flex-col" : "max-w-7xl mx-auto"}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}

DashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
