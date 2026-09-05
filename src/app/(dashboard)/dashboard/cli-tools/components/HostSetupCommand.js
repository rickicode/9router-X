"use client";

import { useState, useMemo } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function HostSetupCommand({
  toolId,
  baseUrl = "",
  apiKey = "",
  model = "",
  subagentModel = "",
  models = {},
  modelsList = [],
  maxContextTokens = "",
}) {
  const [activeTab, setActiveTab] = useState("bash"); // "bash" | "ps1"
  const { copy, copied } = useCopyToClipboard();

  // Determine current origin from window if running in browser
  const currentOrigin = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:10128";
  }, []);

  const effectiveBaseUrl = baseUrl || currentOrigin;

  // Build query string for the script endpoint
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("baseUrl", effectiveBaseUrl);
    if (apiKey) params.set("apiKey", apiKey);
    if (model) params.set("model", model);
    if (subagentModel) params.set("subagentModel", subagentModel);
    if (maxContextTokens) params.set("maxContextTokens", maxContextTokens);

    if (models) {
      Object.entries(models).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    }

    if (modelsList && modelsList.length > 0) {
      params.set("modelsList", modelsList.join(","));
    }

    return params.toString();
  }, [effectiveBaseUrl, apiKey, model, subagentModel, maxContextTokens, models, modelsList]);

  const scriptUrlBash = `${currentOrigin}/api/cli-tools/setup/${toolId}?${queryParams}`;
  const scriptUrlPs1 = `${currentOrigin}/api/cli-tools/setup/${toolId}?format=ps1&${queryParams}`;

  const bashCommand = `curl -fsSL "${scriptUrlBash}" | bash`;
  const ps1Command = `irm "${scriptUrlPs1}" | iex`;

  const activeCommand = activeTab === "bash" ? bashCommand : ps1Command;

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-hover/70 dark:bg-surface-hover/30 border border-primary/20 rounded-lg">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-[18px]">terminal</span>
          <span className="text-xs font-semibold text-text-primary">
            Host One-Click Auto Setup
          </span>
          <span className="px-1.5 py-0.2 text-[9px] bg-primary/10 text-primary font-medium rounded-full">
            Remote & Docker Ready
          </span>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-md border border-border">
          <button
            type="button"
            onClick={() => setActiveTab("bash")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              activeTab === "bash"
                ? "bg-surface text-primary shadow-xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            macOS / Linux (Bash)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ps1")}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              activeTab === "ps1"
                ? "bg-surface text-primary shadow-xs"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Windows (PowerShell)
          </button>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        Paste and run this command in your host machine terminal to apply the configured endpoint, API key, and models directly:
      </p>

      {/* Command snippet box */}
      <div className="relative group">
        <pre className="p-2.5 pr-20 bg-black/80 dark:bg-black/90 text-emerald-400 font-mono text-xs rounded-md overflow-x-auto whitespace-pre-wrap break-all select-all border border-black/10 dark:border-white/10">
          {activeCommand}
        </pre>

        <button
          type="button"
          onClick={() => copy(activeCommand)}
          className="absolute right-2 top-2 px-2.5 py-1 bg-surface/90 hover:bg-surface border border-border text-text-primary text-[11px] font-medium rounded shadow-xs flex items-center gap-1 transition-all"
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied ? "check" : "content_copy"}
          </span>
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
