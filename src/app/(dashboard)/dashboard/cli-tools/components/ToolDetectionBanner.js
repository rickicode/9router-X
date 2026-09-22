"use client";

export default function ToolDetectionBanner({
 installed = false,
 toolName = "",
 hasConfig = false,
}) {
 if (installed) {
 return (
 <div className="flex items-center gap-2 px-3 h-8 bg-success/10 border border-success/30 rounded-sm text-success text-xs">
 <span className="material-symbols-outlined text-[18px]">check_circle</span>
 <span>
 <strong>{toolName}</strong> detected locally in server environment.
 </span>
 </div>
 );
 }

 return (
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-primary/10 border border-primary/30 rounded-sm text-primary text-xs">
 <div className="flex items-start sm:items-center gap-2">
 <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
 dns
 </span>
 <div>
 <span className="font-medium">Docker / Remote Host Mode:</span>{" "}
 <span className="text-text-muted">
 {toolName} is not installed inside the Docker container. Configure your models below, then run the <strong>Host One-Click Auto Setup</strong> command in your host terminal.
 </span>
 </div>
 </div>
 </div>
 );
}
