"use client";

export default function ToolDetectionBanner({
  installed = false,
  toolName = "",
  hasConfig = false,
}) {
  if (installed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-700 dark:text-emerald-300 text-xs">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        <span>
          <strong>{toolName}</strong> detected locally in server environment.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-800 dark:text-blue-300 text-xs">
      <div className="flex items-start sm:items-center gap-2">
        <span className="material-symbols-outlined text-blue-500 text-[18px] shrink-0">
          dns
        </span>
        <div>
          <span className="font-semibold">Docker / Remote Host Mode:</span>{" "}
          <span className="text-text-muted">
            {toolName} is not installed inside the Docker container. Configure your models below, then run the <strong>Host One-Click Auto Setup</strong> command in your host terminal.
          </span>
        </div>
      </div>
    </div>
  );
}
