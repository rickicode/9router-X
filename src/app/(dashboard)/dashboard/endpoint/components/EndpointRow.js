"use client";

import PropTypes from "prop-types";
import { Input } from "@/shared/components";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  const isCopied = copied === copyId;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex items-center justify-between sm:justify-start">
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center ${
            badge === "CF" || badge === "TS"
              ? "bg-primary/10 text-brand-700 dark:text-brand-400 font-medium"
              : "bg-surface-2 text-text-muted"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0 w-full">
        <Input value={url} readOnly className="w-full font-mono text-sm" />
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onCopy(url, copyId)}
          aria-label={isCopied ? "Copied" : `Copy ${label} URL`}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-brand-700 dark:hover:text-brand-400 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {isCopied ? "check" : "content_copy"}
          </span>
        </button>
        {actions}
      </div>
    </div>
  );
}

EndpointRow.propTypes = {
  label: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  copyId: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  badge: PropTypes.string,
  actions: PropTypes.node,
};
