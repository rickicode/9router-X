"use client";

import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import { fmt, TimeAgo } from "./realtimeHelpers";

export default function RealtimeRequestRow({ req, onOpenError }) {
  const r = req;
  const isOk = !r.status || r.status === "ok" || r.status === "success";

  return (
    <tr className="hover:bg-surface-2/60 transition-colors">
      {/* Status Dot + Text */}
      <td className="py-2 px-3 text-center">
        {!isOk ? (
          <button
            type="button"
            onClick={() => onOpenError(r)}
            className="inline-flex items-center justify-center size-5 rounded-full bg-rose-500/10 text-danger hover:bg-rose-500/20 cursor-pointer transition-colors"
            title={`Failed (${r.status || "error"}) - Click to view error`}
            aria-label={`Failed (${r.status || "error"}) - Click to view error`}
          >
            <span className="material-symbols-outlined !text-[13px] leading-none">
              close
            </span>
          </button>
        ) : (
          <span
            className="inline-flex items-center justify-center size-5 rounded-full bg-emerald-500/10 text-success"
            title="Success (200 OK)"
          >
            <span className="material-symbols-outlined !text-[13px] leading-none">
              check
            </span>
          </span>
        )}
      </td>

      {/* Format Type (STREAM vs JSON) */}
      <td className="py-2 px-3">
        {r.isStream ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-500">
            <span className="material-symbols-outlined !text-[11px]">
              wifi_tethering
            </span>
            STREAM
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
            <span className="material-symbols-outlined !text-[11px]">
              code
            </span>
            JSON
          </span>
        )}
      </td>

      {/* Stream State (Streaming vs Completed) */}
      <td className="py-2 px-3">
        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
          <span className="size-1.5 rounded-full bg-text-muted/60" />
          Completed
        </span>
      </td>

      {/* Model */}
      <td className="py-2 px-3 font-mono font-medium text-text-main truncate max-w-[200px]" title={r.model}>
        {r.model}
      </td>

      {/* Provider */}
      <td className="py-2 px-3">
        <Badge variant="neutral" size="sm">
          {r.provider || "unknown"}
        </Badge>
      </td>

      {/* Upstream account */}
      <td className="py-2 px-3 truncate max-w-[180px]" title={r.account || "Direct request"}>
        <span className="inline-flex items-center gap-1 text-text-muted">
          <span className="material-symbols-outlined !text-[12px]">account_circle</span>
          <span className="text-[11px] text-text-main truncate">{r.account || "Direct request"}</span>
        </span>
      </td>

      {/* Client API Key */}
      <td className="py-2 px-3 truncate max-w-[150px]" title={r.rawApiKey || r.apiKey}>
        <span className="inline-flex items-center gap-1 text-text-muted">
          <span className="material-symbols-outlined !text-[12px]">
            key
          </span>
          <span className="font-mono text-[11px] text-text-main truncate">
            {r.clientApiKey || r.apiKey || "Default Key"}
          </span>
        </span>
      </td>

      {/* Tokens */}
      <td className="py-2 px-3 text-right whitespace-nowrap font-mono text-[11px]">
        <span className="text-primary font-semibold">
          {fmt(r.promptTokens)}↑
        </span>{" "}
        <span className="text-success font-semibold">
          {fmt(r.completionTokens)}↓
        </span>
      </td>

      {/* When */}
      <td className="py-2 px-3 text-right text-text-muted whitespace-nowrap text-[11px]">
        <TimeAgo timestamp={r.timestamp} />
      </td>

      {/* Action */}
      <td className="py-2 px-3 text-center whitespace-nowrap">
        {!isOk || r.error ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => onOpenError(r)}
            className="!h-6 !px-2 !text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs"
          >
            <span className="material-symbols-outlined !text-[13px] leading-none">
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
