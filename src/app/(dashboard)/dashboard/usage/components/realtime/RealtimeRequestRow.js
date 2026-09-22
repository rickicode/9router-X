"use client";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import { fmt, TimeAgo } from "./realtimeHelpers";

export default function RealtimeRequestRow({ req, onOpenError }) {
 const r = req;
 const isOk = !r.status || r.status === "ok" || r.status === "success";

 return (
 <tr className={cn("", !isOk && "row-failed")}>
 {/* Status Dot + Text */}
 <td className="h-8 px-3 text-center text-sm">
 {!isOk ? (
 <button
 type="button"
 onClick={() => onOpenError(r)}
 className="inline-flex items-center justify-center size-5 rounded-sm bg-danger/10 text-danger hover:bg-danger/10 cursor-pointer"
 title={`Failed (${r.status || "error"}) - Click to view error`}
 aria-label={`Failed (${r.status || "error"}) - Click to view error`}
 >
 <span className="material-symbols-outlined !text-[18px]">
 close
 </span>
 </button>
 ) : (
 <span
 className="inline-flex items-center justify-center size-5 rounded-sm bg-success/10 text-success"
 title="Success (200 OK)"
 >
 <span className="material-symbols-outlined !text-[18px]">
 check
 </span>
 </span>
 )}
 </td>

 {/* Format Type (STREAM vs JSON) */}
 <td className="h-8 px-3 text-sm">
 {r.isStream ? (
 <span className="inline-flex items-center gap-1 rounded-sm bg-info/10 border border-info/30 px-2 py-1 text-[11px] font-medium text-info">
 <span className="material-symbols-outlined !text-[11px]">
 wifi_tethering
 </span>
 STREAM
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 border border-primary/30 px-2 py-1 text-[11px] font-medium text-primary">
 <span className="material-symbols-outlined !text-[11px]">
 code
 </span>
 JSON
 </span>
 )}
 </td>

 {/* Stream State (Streaming vs Completed) */}
 <td className="h-8 px-3 text-sm">
 <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
 <span className="size-1.5 rounded-full bg-text-muted/60" />
 Completed
 </span>
 </td>

 {/* Model */}
 <td className="h-8 px-3 font-mono font-medium text-text-main truncate max-w-[200px] text-sm" title={r.model}>
 {r.model}
 </td>

 {/* Provider */}
 <td className="h-8 px-3 text-sm">
 <Badge variant="neutral" size="sm">
 {r.provider || "unknown"}
 </Badge>
 </td>

 {/* Upstream account */}
 <td className="h-8 px-3 truncate max-w-[180px] text-sm" title={r.account || "Direct request"}>
 <span className="inline-flex items-center gap-1 text-text-muted">
 <span className="material-symbols-outlined !text-[18px]">account_circle</span>
 <span className="text-[11px] text-text-main truncate">{r.account || "Direct request"}</span>
 </span>
 </td>

 {/* Client API Key */}
 <td className="h-8 px-3 truncate max-w-[150px] text-sm" title={r.rawApiKey || r.apiKey}>
 <span className="inline-flex items-center gap-1 text-text-muted">
 <span className="material-symbols-outlined !text-[18px]">
 key
 </span>
 <span className="font-mono text-[11px] text-text-main truncate">
 {r.clientApiKey || r.apiKey || "Default Key"}
 </span>
 </span>
 </td>

 {/* Tokens */}
 <td className="h-8 px-3 text-right whitespace-nowrap font-mono text-[11px] text-sm">
 <span className="text-primary font-medium">
 {fmt(r.promptTokens)}↑
 </span>{" "}
 <span className="text-success font-medium">
 {fmt(r.completionTokens)}↓
 </span>
 </td>

 {/* When */}
 <td className="h-8 px-3 text-right text-text-muted whitespace-nowrap text-[11px] text-sm">
 <TimeAgo timestamp={r.timestamp} />
 </td>

 {/* Action */}
 <td className="h-8 px-3 text-center whitespace-nowrap text-sm">
 {!isOk || r.error ? (
 <Button
 type="button"
 variant="danger"
 size="sm"
 onClick={() => onOpenError(r)}
 className="!h-8 !px-2 !text-xs font-medium inline-flex items-center gap-1"
 >
 <span className="material-symbols-outlined !text-[18px]">
 error
 </span>
 Show Error
 </Button>
 ) : (
 <span className="text-text-muted text-[11px]">—</span>
 )}
 </td>
 </tr>
 );
}

export function RealtimeRequestCardMobile({ req, onOpenError }) {
 const r = req;
 const isOk = !r.status || r.status === "ok" || r.status === "success";

 return (
 <div className="p-3 space-y-3 hover:bg-surface-2">
 {/* Row 1: Status badge, type badge, When */}
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span
 className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-medium border ${
 isOk
 ? "bg-success/10 text-success border-success/30"
 : "bg-danger/10 text-danger border-danger/30"
 }`}
 >
 <span className="material-symbols-outlined !text-[18px]">
 {isOk ? "check_circle" : "error"}
 </span>
 {isOk ? "OK" : r.status || "Failed"}
 </span>

 {r.isStream ? (
 <span className="inline-flex items-center gap-1 rounded-sm bg-info/10 border border-info/30 px-2 py-1 text-[11px] font-medium text-info">
 <span className="material-symbols-outlined !text-[11px]">
 wifi_tethering
 </span>
 STREAM
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 border border-primary/30 px-2 py-1 text-[11px] font-medium text-primary">
 <span className="material-symbols-outlined !text-[11px]">
 code
 </span>
 JSON
 </span>
 )}

 <Badge variant="neutral" size="sm">
 {r.provider || "unknown"}
 </Badge>
 </div>

 <span className="text-[11px] text-text-muted font-mono whitespace-nowrap">
 <TimeAgo timestamp={r.timestamp} />
 </span>
 </div>

 {/* Row 2: Model name */}
 <div className="font-mono text-xs font-medium text-text-main break-all" title={r.model}>
 {r.model}
 </div>

 {/* Row 3: Account & Client Key */}
 <div className="grid grid-cols-1 gap-1 text-[11px] text-text-muted">
 <div className="flex items-center gap-1 truncate">
 <span className="material-symbols-outlined !text-[18px] shrink-0">account_circle</span>
 <span className="text-text-main truncate">{r.account || "Direct request"}</span>
 </div>
 {(r.clientApiKey || r.apiKey) && (
 <div className="flex items-center gap-1 truncate font-mono text-[11px]">
 <span className="material-symbols-outlined !text-[18px] shrink-0">key</span>
 <span className="text-text-muted truncate">{r.clientApiKey || r.apiKey}</span>
 </div>
 )}
 </div>

 {/* Row 4: Tokens + Action button */}
 <div className="flex items-center justify-between gap-2 pt-1 border-t border-border h-8">
 <div className="font-mono text-[11px]">
 <span className="text-primary font-medium">{fmt(r.promptTokens)}↑</span>
 {" "}
 <span className="text-success font-medium">{fmt(r.completionTokens)}↓</span>
 </div>

 {!isOk || r.error ? (
 <Button
 type="button"
 variant="danger"
 size="sm"
 onClick={() => onOpenError(r)}
 className="min-h-[44px] min-w-[44px] !px-3 !text-xs font-medium inline-flex items-center gap-1"
 >
 <span className="material-symbols-outlined !text-[18px]">
 error
 </span>
 Show Error
 </Button>
 ) : (
 <span className="text-text-muted text-[11px]">—</span>
 )}
 </div>
 </div>
 );
}
