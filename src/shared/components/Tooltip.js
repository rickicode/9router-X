"use client";

import { useState, useEffect, useId, useRef } from "react";

export default function Tooltip({ text, children, position = "top", color }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const containerRef = useRef(null);

  const posClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[position] || "bottom-full left-1/2 -translate-x-1/2 mb-1.5";

  const bgStyle = color ? { backgroundColor: color } : {};
  const bgClass = color ? "" : "bg-gray-900";

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
    : "opacity-0 group-hover/tt:opacity-100 focus-within:opacity-100";

  return (
    <div
      ref={containerRef}
      className="relative inline-flex group/tt"
      aria-describedby={id}
      tabIndex={children ? undefined : 0}
      onClick={() => {
        setDismissed(false);
        setIsOpen((prev) => !prev);
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onPointerLeave={() => setDismissed(false)}
    >
      {children}
      <div
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute ${posClass} z-50 w-max max-w-56 rounded px-2 py-1 text-[11px] leading-snug ${bgClass} text-white transition-opacity duration-150 whitespace-normal ${visibleClass}`}
        style={bgStyle}
      >
        {text}
      </div>
    </div>
  );
}
