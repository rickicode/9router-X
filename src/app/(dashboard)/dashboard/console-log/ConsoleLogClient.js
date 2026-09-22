"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
 LOG: "text-success",
 INFO: "text-info",
 WARN: "text-warning",
 ERROR: "text-danger",
 DEBUG: "text-primary",
};

function colorLine(line) {
 const match = line.match(/\[(\w+)\]/g);
 const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
 const color = LOG_LEVEL_COLORS[levelTag] || "text-success";
 return <span className={color}>{line}</span>;
}

export default function ConsoleLogClient() {
 const [logs, setLogs] = useState([]);
 const [connected, setConnected] = useState(false);
 const [paused, setPaused] = useState(false);
 const logRef = useRef(null);

 const handleClear = async () => {
 try {
 await fetch("/api/translator/console-logs", { method: "DELETE" });
 // UI cleared via SSE "clear" event
 } catch (err) {
 console.error("Failed to clear console logs:", err);
 }
 };

 useEffect(() => {
 if (paused) {
 setConnected(false);
 return undefined;
 }

 const es = new EventSource("/api/translator/console-logs/stream");

 es.onopen = () => setConnected(true);

 es.onmessage = (e) => {
 const msg = JSON.parse(e.data);
 if (msg.type === "init") {
 setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
 } else if (msg.type === "line") {
 setLogs((prev) => {
 const next = [...prev, msg.line];
 return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
 });
 } else if (msg.type === "lines") {
 setLogs((prev) => {
 const next = [...prev, ...msg.lines];
 return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
 });
 } else if (msg.type === "clear") {
 setLogs([]);
 }
 };

 es.onerror = () => setConnected(false);

 return () => es.close();
 }, [paused]);

 // Auto-scroll to bottom on new logs
 useEffect(() => {
 if (!logRef.current) return;
 logRef.current.scrollTop = logRef.current.scrollHeight;
 }, [logs]);

 return (
 <div className="flex w-full flex-col gap-3">
 <Card padding="none">
 <div className="flex items-center justify-end gap-2 border-b border-border px-3 h-8">
 <Button
 size="sm"
 variant="outline"
 icon={paused ? "play_arrow" : "pause"}
 onClick={() => setPaused((value) => !value)}
 >
 {paused ? "Resume" : "Pause"}
 </Button>
 <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
 Clear
 </Button>
 </div>
 <div
 ref={logRef}
 className="bg-black rounded-b-sm p-3 text-xs font-mono h-[calc(100vh-220px)] overflow-y-auto"
 >
 {logs.length === 0 ? (
 <span className="text-text-muted">No console logs yet.</span>
 ) : (
 <div className="space-y-3">
 {logs.map((line, i) => (
 <div key={i}>{colorLine(line)}</div>
 ))}
 </div>
 )}
 </div>
 </Card>
 </div>
 );
}
