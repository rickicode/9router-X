"use client";

import { useState, useEffect, useId, useRef } from "react";

/** Inline tooltip, Claude Code CLI style */
export default function Tooltip({ text }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setDismissed(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setDismissed(true);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setIsOpen(false);
      setDismissed(true);
    }
  };

  const handleBlur = (e) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
      setDismissed(false);
    }
  };

  const visibleClass = dismissed
    ? "opacity-0"
    : isOpen
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100";

  return (
    <span
      ref={containerRef}
      className="relative group inline-flex items-center cursor-help"
      aria-describedby={id}
      tabIndex={0}
      role="button"
      aria-label="More information"
      onClick={() => {
        setDismissed(false);
        setIsOpen((prev) => !prev);
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onPointerLeave={() => setDismissed(false)}
    >
      <span className="material-symbols-outlined text-[14px] text-text-muted" aria-hidden="true">
        help
      </span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 w-64 rounded bg-gray-900 dark:bg-gray-800 text-white text-xs px-2.5 py-1.5 transition-opacity shadow-lg ${visibleClass}`}
      >
        {text}
      </span>
    </span>
  );
}
