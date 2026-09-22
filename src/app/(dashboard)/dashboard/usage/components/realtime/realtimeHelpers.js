"use client";

import { useState, useEffect } from "react";

export function timeAgo(timestamp) {
 if (!timestamp) return "just now";
 const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
 if (diff < 5) return "just now";
 if (diff < 60) return `${diff}s ago`;
 if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
 if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
 return `${Math.floor(diff / 86400)}d ago`;
}

export function TimeAgo({ timestamp }) {
 const [, setTick] = useState(0);
 useEffect(() => {
 const timer = setInterval(() => {
 if (typeof document !== "undefined" && document.hidden) return; // pause hidden
 setTick((t) => t + 1);
 }, 30000);
 const onVisibility = () => {
 if (typeof document !== "undefined" && !document.hidden) setTick((t) => t + 1); // catch-up on return
 };
 if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
 return () => {
 clearInterval(timer);
 if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
 };
 }, []);
 return <>{timeAgo(timestamp)}</>;
}

export const fmt = (n) => {
 const num = Number(n) || 0;
 if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
 if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
 return String(num);
};
