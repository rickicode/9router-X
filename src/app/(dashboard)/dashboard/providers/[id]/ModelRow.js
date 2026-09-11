import PropTypes from "prop-types";
import { useState, useRef, useEffect } from "react";
import { CapacityBadges } from "@/shared/components";

export default function ModelRow({
  model,
  fullModel,
  alias,
  copied,
  onCopy,
  testStatus,
  isCustom,
  isFree,
  onDeleteAlias,
  onTest,
  isTesting,
  onDisable,
  caps,
  thinkingSuffix,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayModel = thinkingSuffix
    ? `${fullModel}(${thinkingSuffix})`
    : fullModel;
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-border";

  const iconColor =
    testStatus === "ok"
      ? "#22c55e"
      : testStatus === "error"
        ? "#ef4444"
        : undefined;

  return (
    <div
      className={`group min-w-0 w-full rounded-lg border px-3 py-1.5 sm:py-2.5 sm:w-auto ${borderColor} bg-card/60 transition-colors hover:bg-sidebar/50`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="material-symbols-outlined shrink-0 text-base"
            style={iconColor ? { color: iconColor } : undefined}
          >
            {testStatus === "ok"
              ? "check_circle"
              : testStatus === "error"
                ? "cancel"
                : "smart_toy"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <code
              title={displayModel}
              className="w-full whitespace-normal break-all rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs leading-relaxed text-text-muted select-all"
            >
              {displayModel}
            </code>
            <span className="flex min-w-0 items-center text-[9px] gap-1 pl-0.5">
              {model.name && (
                <span
                  title={model.name}
                  className="w-full truncate text-[9px] italic text-text-muted/70"
                >
                  {model.name}
                </span>
              )}
              <CapacityBadges
                caps={caps}
                colorOverride="text-text-muted/70"
                size={12}
              />
            </span>
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex shrink-0 items-center gap-1">
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                aria-label="Test model"
                className={`rounded p-1 text-text-muted transition-opacity hover:bg-sidebar hover:text-primary ${isTesting ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
              >
                <span
                  className="material-symbols-outlined text-base"
                  style={
                    isTesting
                      ? { animation: "spin 1s linear infinite" }
                      : undefined
                  }
                >
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute mt-1 top-6 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(displayModel, `model-${model.id}`)}
              aria-label="Copy model name"
              className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">
                {copied === `model-${model.id}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-6 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${model.id}` ? "Copied!" : "Copy"}
            </span>
          </div>
          {isCustom ? (
            <button
              onClick={onDeleteAlias}
              className="rounded p-1 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              title="Remove custom model"
              aria-label="Remove custom model"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          ) : onDisable ? (
            <button
              onClick={onDisable}
              className="rounded p-1 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              title="Disable this model"
              aria-label="Disable this model"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          ) : null}
        </div>

        {/* Mobile Action Dropdown */}
        <div className="flex sm:hidden shrink-0 relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="rounded p-1 text-text-muted hover:bg-sidebar transition-colors"
            aria-label="Model actions"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-50 min-w-[120px] rounded-md border border-border bg-sidebar p-1 shadow-lg">
              <button
                onClick={() => {
                  onCopy(displayModel, `model-${model.id}`);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-text-main hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              >
                <span className="material-symbols-outlined text-base">
                  {copied === `model-${model.id}` ? "check" : "content_copy"}
                </span>
                <span>Copy</span>
              </button>
              {onTest && (
                <button
                  onClick={() => {
                    onTest();
                    setShowMenu(false);
                  }}
                  disabled={isTesting}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-text-main hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                >
                  <span
                    className="material-symbols-outlined text-base"
                    style={
                      isTesting
                        ? { animation: "spin 1s linear infinite" }
                        : undefined
                    }
                  >
                    {isTesting ? "progress_activity" : "science"}
                  </span>
                  <span>Test</span>
                </button>
              )}
              {isCustom ? (
                <button
                  onClick={() => {
                    onDeleteAlias();
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                >
                  <span className="material-symbols-outlined text-base">
                    close
                  </span>
                  <span>Remove</span>
                </button>
              ) : onDisable ? (
                <button
                  onClick={() => {
                    onDisable();
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                >
                  <span className="material-symbols-outlined text-base">
                    close
                  </span>
                  <span>Disable</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
