"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import PropTypes from "prop-types";
import { Badge, Toggle, Tooltip } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import CooldownTimer from "./CooldownTimer";

export default function ConnectionRow({ connection, proxyPools, proxyGroups = null, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete, onResetStatus = null, onUnlockModel = null, oneByOneStatus = null, autoPing = null }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const [resettingStatus, setResettingStatus] = useState(false);
  const [selectedProxyIds, setSelectedProxyIds] = useState([]);
  const [rotationStrategy, setRotationStrategy] = useState("none");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [fetchedProxyGroups, setFetchedProxyGroups] = useState(null);
  const { copied, copy } = useCopyToClipboard();
  const proxyDropdownRef = useRef(null);

  const localProxyGroups = proxyGroups || fetchedProxyGroups;

  useEffect(() => {
    if (proxyGroups) return;
    let ignore = false;
    fetch("/api/proxy-groups", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!ignore && data) setFetchedProxyGroups(data);
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [proxyGroups]);

  // Initialize proxy state from connection
  useEffect(() => {
    const proxyPoolIds = connection.providerSpecificData?.proxyPoolIds || [];
    const legacyProxyPoolId = connection.providerSpecificData?.proxyPoolId;
    
    // Migrate legacy single proxy to array format
    queueMicrotask(() => {
      if (legacyProxyPoolId && proxyPoolIds.length === 0) {
        setSelectedProxyIds([legacyProxyPoolId]);
      } else {
        setSelectedProxyIds(proxyPoolIds);
      }
      setRotationStrategy(connection.providerSpecificData?.proxyRotationStrategy || "none");
      setSelectedGroup(connection.providerSpecificData?.proxyGroup || "");
    });
  }, [connection]);

  const defaultGroupsList = useMemo(() => {
    return localProxyGroups?.defaultGroups || [
      { id: "default-cloudflare", key: "cloudflare", name: "Cloudflare Relay", type: "cloudflare" },
      { id: "default-http", key: "http", name: "HTTP", type: "http" },
      { id: "default-vercel", key: "vercel", name: "Vercel", type: "vercel" },
      { id: "default-deno", key: "deno", name: "Deno", type: "deno" },
    ];
  }, [localProxyGroups]);

  const customGroupsList = useMemo(() => {
    return localProxyGroups?.customGroups || [];
  }, [localProxyGroups]);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const availableGroups = useMemo(() => {
    const s = new Set();
    (proxyPools || []).forEach(p => {
      if (p.group && typeof p.group === "string" && p.group.trim()) s.add(p.group.trim());
    });
    return [...s].sort();
  }, [proxyPools]);

  // Display logic - support both new (multi-proxy) and legacy (single proxy) formats
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = selectedProxyIds.length > 0 || hasLegacyProxy || !!selectedGroup;

  const getProxyDisplayText = () => {
    if (selectedProxyIds.length === 0 && !hasLegacyProxy && !selectedGroup) return "";

    if (selectedGroup) {
      const def = defaultGroupsList.find((g) => g.key === selectedGroup || g.name.toLowerCase() === selectedGroup.toLowerCase() || g.id === selectedGroup);
      if (def) {
        const poolCount = (proxyPools || []).filter((p) => p.type === def.type && p.isActive).length;
        return `Group: ${def.name} (${poolCount} pools, Round Robin)`;
      }

      const custom = customGroupsList.find((g) => g.name.toLowerCase() === selectedGroup.toLowerCase() || g.id === selectedGroup);
      if (custom) {
        const poolCount = (custom.poolIds || []).length;
        const stickyText = custom.isSticky ? `Sticky ${custom.stickyLimit || 3}x` : "Round Robin";
        return `Group: ${custom.name} (${poolCount} pools, ${stickyText})`;
      }

      const grpPools = (proxyPools || []).filter(p => p.group && p.group.toLowerCase() === selectedGroup.toLowerCase());
      const strategyLabel = rotationStrategy === "random" ? "Random" : rotationStrategy === "failover" ? "Failover" : rotationStrategy === "smart" ? "Smart" : "Round Robin";
      return `Group: ${selectedGroup} (${grpPools.length} pools, ${strategyLabel})`;
    }

    if (selectedProxyIds.length === 1) {
      const pool = proxyPoolMap.get(selectedProxyIds[0]);
      return pool ? `Pool: ${pool.name}` : `Pool: ${selectedProxyIds[0]} (inactive/missing)`;
    }

    if (selectedProxyIds.length > 1) {
      const strategyLabel = rotationStrategy === "random" ? "Random" : rotationStrategy === "round-robin" ? "Round Robin" : rotationStrategy === "failover" ? "Failover" : rotationStrategy === "smart" ? "Smart" : "Multiple";
      return `${selectedProxyIds.length} pools (${strategyLabel})`;
    }

    if (hasLegacyProxy) {
      return `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`;
    }

    return "";
  };
  
  const proxyDisplayText = getProxyDisplayText();
  const autoPingTooltip = autoPing?.provider === "codex"
    ? "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota."
    : "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.";

  let maskedProxyUrl = "";
  if (selectedProxyIds.length > 0) {
    const selectedPools = selectedProxyIds.map(id => proxyPoolMap.get(id)).filter(Boolean);
    if (selectedPools.length > 0) {
      try {
        const parsed = new URL(selectedPools[0].proxyUrl);
        maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
        if (selectedPools.length > 1) {
          maskedProxyUrl += ` (+${selectedPools.length - 1} more)`;
        }
      } catch {
        maskedProxyUrl = selectedPools[0].proxyUrl;
      }
    }
  } else if (connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = selectedProxyIds.length > 0 
    ? proxyPoolMap.get(selectedProxyIds[0])?.noProxy || ""
    : connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant = "default";
  if (selectedGroup) {
    proxyBadgeVariant = "success";
  } else if (selectedProxyIds.length > 0) {
    const allActive = selectedProxyIds.every(id => proxyPoolMap.get(id)?.isActive === true);
    proxyBadgeVariant = allActive ? "success" : "error";
  } else if (hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
        setShowProxyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleToggleProxySelection = (poolId) => {
    setSelectedGroup("");
    setSelectedProxyIds(prev => {
      if (prev.includes(poolId)) {
        return prev.filter(id => id !== poolId);
      } else {
        return [...prev, poolId];
      }
    });
  };

  const handleStrategyChange = (strategy) => {
    setRotationStrategy(strategy);
    
    // Auto-select all active proxy pools when switching to rotation strategies
    if (strategy !== "none" && selectedProxyIds.length === 0) {
      const activePoolIds = (proxyPools || [])
        .filter(pool => pool.isActive === true)
        .map(pool => pool.id);
      setSelectedProxyIds(activePoolIds);
    }
    
    // Reset to single proxy when switching to "none"
    if (strategy === "none" && selectedProxyIds.length > 1) {
      setSelectedProxyIds(selectedProxyIds.slice(0, 1));
    }
  };

  const handleApplyProxyChanges = async () => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy({
        proxyPoolIds: selectedGroup ? [] : selectedProxyIds,
        proxyRotationStrategy: rotationStrategy,
        proxyGroup: selectedGroup || null,
      });
      setShowProxyDropdown(false);
    } finally {
      setUpdatingProxy(false);
    }
  };

  const handleSelectProxy = async (poolId) => {
    // Legacy single-proxy mode (backwards compatibility)
    setUpdatingProxy(true);
    try {
      setSelectedGroup("");
      setSelectedProxyIds(poolId === "__none__" ? [] : [poolId]);
      setRotationStrategy("none");
      await onUpdateProxy({
        proxyPoolIds: poolId === "__none__" ? [] : [poolId],
        proxyRotationStrategy: "none",
        proxyGroup: null,
      });
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
  const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
  const displayName = connection.name?.trim()
    || connection.email?.trim()
    || connection.displayName?.trim()
    || (isOAuthConnection ? "OAuth Account" : isCookieConnection ? "Cookie Account" : "API Key");
  const secondaryDisplayName = connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()
    ? connection.email.trim()
    : connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()
      ? connection.displayName.trim()
      : null;

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState(false);
  const [activeLocks, setActiveLocks] = useState([]);

  const hasAnyModelLockKey = Object.keys(connection).some((k) => k.startsWith("modelLock_"));

  useEffect(() => {
    const checkCooldown = () => {
      const now = Date.now();
      const flatLocks = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .filter(([, v]) => v && new Date(v).getTime() > now)
        .map(([k, v]) => ({
          model: k.slice("modelLock_".length) || "__all",
          until: v,
        }));

      const dictLocks = Object.entries(connection.modelLocks || {})
        .filter(([, v]) => v && new Date(v).getTime() > now)
        .map(([k, v]) => ({
          model: k || "__all",
          until: v,
        }));

      const merged = new Map();
      [...flatLocks, ...dictLocks].forEach(item => merged.set(item.model, item));
      const locks = [...merged.values()].sort((a, b) => new Date(b.until) - new Date(a.until));

      setActiveLocks(locks);
      setIsCooldown(locks.length > 0);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connection]);

  // Determine effective status (override unavailable if cooldown expired)
  const hasFatalError = Boolean(
    connection.providerSpecificData?.refreshBlocked ||
    (connection.lastError && /\b(banned|account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(connection.lastError))
  );
  const accountLockUntil = connection.lockedAllUntil
    || connection.rateLimitedUntil
    || connection.modelLocks?.__all
    || connection.modelLock___all;
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!accountLockUntil && !connection.lockedToModelUntil) return;
    const updateTime = () => setCurrentTime(Date.now());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [accountLockUntil, connection.lockedToModelUntil]);

  const now = currentTime;
  const hasAccountLock = Boolean(
    accountLockUntil && new Date(accountLockUntil).getTime() > now
  );
  const hasModelLock = activeLocks.some((lock) => lock.model !== "__all");

  const isFreebuff = connection.provider === "freebuff";
  const hasModelAffinityLock = Boolean(
    isFreebuff &&
    connection.lockedToModel &&
    connection.lockedToModelUntil &&
    new Date(connection.lockedToModelUntil).getTime() > now
  );
  const affinityMinutesRemaining = hasModelAffinityLock
    ? Math.max(1, Math.ceil((new Date(connection.lockedToModelUntil).getTime() - now) / 60000))
    : null;

  const isExhausted = connection.testStatus === "exhausted" || hasModelLock;

  const effectiveStatus = connection.isActive === false
    ? "disabled"
    : (hasFatalError || ["unavailable", "error", "expired", "invalid"].includes(connection.testStatus))
      ? "unavailable"
      : isExhausted
        ? "exhausted"
        : hasAccountLock
          ? "unavailable"
          : (connection.testStatus || "active");

  const getStatusVariant = () => getConnectionStatusVariant(connection.isActive, effectiveStatus);

  const getOneByOneVariant = () => {
    if (!oneByOneStatus) return "default";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return "error";
    if (oneByOneStatus.state === "testing") return "primary";
    return "default";
  };

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "queued";
    if (oneByOneStatus.state === "testing") return "testing";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
    return null;
  };

  return (
    <div className={`group flex min-w-0 flex-col gap-3 rounded-lg p-2 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between ${connection.isActive === false ? "opacity-60" : ""} ${showProxyDropdown ? "relative z-30" : ""}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        {/* Priority arrows */}
        <div className="flex shrink-0 flex-col">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`p-0.5 rounded ${isFirst ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`p-0.5 rounded ${isLast ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>
        </div>
        <span className="material-symbols-outlined shrink-0 text-base text-text-muted">
          {authIcon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          {secondaryDisplayName && (
            <p className="text-xs text-text-muted truncate">{secondaryDisplayName}</p>
          )}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge
              variant={getStatusVariant()}
              size="sm"
              dot
              title={connection.isActive === false && connection.previousStatus && connection.previousStatus !== "disabled" ? `Status before disabled: ${connection.previousStatus}${connection.disabledAt ? ` at ${new Date(connection.disabledAt).toLocaleString()}` : ""}` : undefined}
            >
              {connection.isActive === false
                ? (connection.previousStatus && connection.previousStatus !== "disabled" ? `disabled (was: ${connection.previousStatus})` : "disabled")
                : (effectiveStatus || "Unknown")}
            </Badge>
            <Badge variant="default" size="sm">
              {authLabel}
            </Badge>
            {hasAnyProxy && (
              <Badge variant={proxyBadgeVariant} size="sm">
                Proxy
              </Badge>
            )}
            {isFreebuff && connection.isActive !== false && (
              hasModelAffinityLock ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <span className="material-symbols-outlined text-[13px]">lock</span>
                  <span className="font-medium">Locked: {connection.lockedToModel}</span>
                  {affinityMinutesRemaining !== null && (
                    <span className="opacity-75 font-mono text-[11px]">({affinityMinutesRemaining}m)</span>
                  )}
                  {typeof onUnlockModel === "function" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnlockModel();
                      }}
                      className="ml-0.5 hover:text-amber-700 dark:hover:text-amber-300"
                      title="Release model lock"
                    >
                      <span className="material-symbols-outlined text-[13px]">lock_open</span>
                    </button>
                  )}
                </span>
              ) : effectiveStatus === "active" ? (
                <Badge variant="success" size="sm">
                  Unlocked
                </Badge>
              ) : null
            )}
            {isCooldown && connection.isActive !== false && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeLocks.map((lock) => (
                  <span key={lock.model} className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-medium">{lock.model === "__all" ? "all models" : lock.model}</span>
                    <CooldownTimer until={lock.until} />
                  </span>
                ))}
              </div>
            )}
            {connection.lastError && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            {connection.isActive === false && (connection.disabledReason || connection.lastError) && (
              <span
                className="max-w-full truncate text-xs text-amber-600 dark:text-amber-400 sm:max-w-[340px]"
                title={`Reason: ${connection.disabledReason || connection.lastError}${connection.disabledAt ? ` (${new Date(connection.disabledAt).toLocaleString()})` : ""}`}
              >
                Reason: {connection.disabledReason || connection.lastError}
              </span>
            )}
            <span className="text-xs text-text-muted">#{connection.priority}</span>
            {connection.globalPriority && (
              <span className="text-xs text-text-muted">Auto: {connection.globalPriority}</span>
            )}
            {getOneByOneLabel() && (
              <Badge variant={getOneByOneVariant()} size="sm">
                {getOneByOneLabel()}
              </Badge>
            )}
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[420px]" title={proxyDisplayText}>
                {proxyDisplayText}
              </span>
              {maskedProxyUrl && (
                <code className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5 sm:max-w-[260px]">
                  {maskedProxyUrl}
                </code>
              )}
              {noProxyText && (
                <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[320px]" title={noProxyText}>
                  no_proxy: {noProxyText}
                </span>
              )}
            </div>
          )}
          {connection.providerSpecificData?.validationUrl && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">⚠️ Action Required:</span>
              <span className="max-w-[300px] truncate" title={connection.providerSpecificData.validationMessage || "Verification required by Google"}>
                {connection.providerSpecificData.validationMessage || "Verification required by Google"}
              </span>
              <div className="inline-flex items-center gap-2">
                <a
                  href={connection.providerSpecificData.validationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline hover:text-amber-900 dark:hover:text-amber-100"
                >
                  Verify ↗
                </a>
                <button
                  type="button"
                  onClick={() => copy(connection.providerSpecificData.validationUrl, `val-${connection.id}`)}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
                  title="Copy validation URL"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {copied === `val-${connection.id}` ? "check" : "content_copy"}
                  </span>
                  <span>{copied === `val-${connection.id}` ? "Copied" : "Copy Link"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="grid flex-1 grid-cols-3 gap-1 sm:flex sm:flex-none">
          {/* Proxy button with inline dropdown */}
          {(proxyPools || []).length > 0 && (
            <div className={`relative ${showProxyDropdown ? "z-50" : ""}`} ref={proxyDropdownRef}>
              <button
                onClick={() => setShowProxyDropdown((v) => !v)}
                className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`}
                disabled={updatingProxy}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {updatingProxy ? "progress_activity" : "lan"}
                </span>
                <span className="text-[10px] leading-tight">Proxy</span>
              </button>
              {showProxyDropdown && (
                <div className="absolute left-0 top-full z-50 mt-1 max-w-[calc(100vw-2rem)] min-w-[280px] rounded-lg border border-border bg-bg shadow-lg sm:left-auto sm:right-0">
                  {/* Group Selector */}
                  <div className="border-b border-border p-3 bg-black/[0.01] dark:bg-white/[0.01]">
                    <label className="block text-xs font-medium text-text-muted mb-1.5">Proxy Group</label>
                    <select
                      value={selectedGroup}
                      onChange={(e) => {
                        const grp = e.target.value;
                        setSelectedGroup(grp);
                        if (grp) {
                          setSelectedProxyIds([]);
                          if (rotationStrategy === "none") setRotationStrategy("round-robin");
                        }
                      }}
                      className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text-main focus:border-primary focus:outline-none"
                    >
                      <option value="">None (Select individual proxies)</option>

                      <optgroup label="Default Groups (Auto Round-Robin)">
                        {defaultGroupsList.map((def) => {
                          const count = (proxyPools || []).filter((p) => p.type === def.type && p.isActive).length;
                          return (
                            <option key={def.id} value={def.key}>
                              {def.name} ({count} active pools)
                            </option>
                          );
                        })}
                      </optgroup>

                      {customGroupsList.length > 0 && (
                        <optgroup label="Custom Groups">
                          {customGroupsList.map((cg) => {
                            const stickyLabel = cg.isSticky ? `Sticky ${cg.stickyLimit || 3}x` : "Round Robin";
                            return (
                              <option key={cg.id} value={cg.name}>
                                {cg.name} ({cg.poolIds?.length || 0} pools, {stickyLabel})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}

                      {/* Legacy groups if any */}
                      {(() => {
                        const legacy = availableGroups.filter(
                          (ag) => !customGroupsList.some((cg) => cg.name.toLowerCase() === ag.toLowerCase())
                        );
                        if (legacy.length === 0) return null;
                        return (
                          <optgroup label="Tagged Groups">
                            {legacy.map((grp) => {
                              const count = (proxyPools || []).filter(p => p.group && p.group.toLowerCase() === grp.toLowerCase()).length;
                              return (
                                <option key={grp} value={grp}>{grp} ({count} proxies)</option>
                              );
                            })}
                          </optgroup>
                        );
                      })()}
                    </select>
                    {selectedGroup && (
                      <p className="mt-1 text-[10px] text-primary">Dynamic: All active proxies in group &quot;{selectedGroup}&quot; will be routed automatically.</p>
                    )}
                  </div>

                  {/* Rotation Strategy Selector */}
                  <div className="border-b border-border p-3">
                    <label className="block text-xs font-medium text-text-muted mb-2">Rotation Strategy</label>
                    <select
                      value={rotationStrategy}
                      onChange={(e) => handleStrategyChange(e.target.value)}
                      className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text-main focus:border-primary focus:outline-none"
                    >
                      <option value="none">None (Single Proxy)</option>
                      <option value="random">Random</option>
                      <option value="round-robin">Round Robin</option>
                      <option value="failover">Failover</option>
                      <option value="smart">Smart</option>
                    </select>
                    {rotationStrategy !== "none" && (
                      <p className="mt-1 text-[10px] text-text-muted">
                        {rotationStrategy === "random" && "Randomly select proxy on each request"}
                        {rotationStrategy === "round-robin" && "Rotate proxies in order across requests"}
                        {rotationStrategy === "failover" && "Try next proxy on failure"}
                        {rotationStrategy === "smart" && "Skip pools whose egress IP is blocked for this provider/model (e.g. Freebuff limited-IP). See Proxy Fitness to clear/block."}
                      </p>
                    )}
                  </div>

                  {/* Proxy Pool Selection */}
                  <div className="max-h-[200px] overflow-y-auto py-1">
                    <button
                      onClick={() => {
                        setSelectedProxyIds([]);
                        setSelectedGroup("");
                        setRotationStrategy("none");
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${selectedProxyIds.length === 0 && !selectedGroup ? "text-primary font-medium" : "text-text-main"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">
                          {selectedProxyIds.length === 0 && !selectedGroup ? "check_box" : "check_box_outline_blank"}
                        </span>
                        <span>None</span>
                      </div>
                    </button>

                    {/* Select All Button (only for rotation strategies) */}
                    {rotationStrategy !== "none" && (
                      <button
                        onClick={() => {
                          setSelectedGroup("");
                          const activePoolIds = (proxyPools || [])
                            .filter(pool => pool.isActive === true)
                            .map(pool => pool.id);
                          const allSelected = activePoolIds.length > 0 && activePoolIds.every(id => selectedProxyIds.includes(id));
                          
                          if (allSelected) {
                            setSelectedProxyIds([]);
                          } else {
                            setSelectedProxyIds(activePoolIds);
                          }
                        }}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-border hover:bg-black/5 dark:hover:bg-white/5 ${selectedProxyIds.length === (proxyPools || []).filter(p => p.isActive).length ? "bg-black/5 dark:bg-white/5" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">
                            {selectedProxyIds.length === (proxyPools || []).filter(p => p.isActive).length && selectedProxyIds.length > 0
                              ? "check_box"
                              : "check_box_outline_blank"
                            }
                          </span>
                          <span className="font-medium">Select All Active</span>
                        </div>
                      </button>
                    )}
                    
                    {(proxyPools || []).map((pool) => {
                      const isSelected = selectedProxyIds.includes(pool.id);
                      const isActive = pool.isActive === true;
                      return (
                        <button
                          key={pool.id}
                          onClick={() => {
                            if (rotationStrategy === "none") {
                              setSelectedProxyIds([pool.id]);
                            } else {
                              handleToggleProxySelection(pool.id);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${isSelected ? "bg-black/5 dark:bg-white/5" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">
                              {rotationStrategy === "none" 
                                ? (isSelected ? "radio_button_checked" : "radio_button_unchecked")
                                : (isSelected ? "check_box" : "check_box_outline_blank")
                              }
                            </span>
                            <span className={isSelected ? "text-primary font-medium" : "text-text-main"}>{pool.name}</span>
                            {!isActive && (
                              <span className="ml-auto text-[10px] text-red-500">(inactive)</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Apply Button */}
                  <div className="border-t border-border p-2">
                    <button
                      onClick={handleApplyProxyChanges}
                      disabled={updatingProxy}
                      className="w-full rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updatingProxy ? "Applying..." : "Apply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {autoPing && (
            <Tooltip text={autoPingTooltip}>
              <button
                onClick={() => autoPing.onToggle(!autoPing.on)}
                className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${autoPing.on ? "text-primary" : "text-text-muted hover:text-primary"}`}
              >
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                <span className="text-[10px] leading-tight">Auto-ping</span>
              </button>
            </Tooltip>
          )}
          {onResetStatus && (isCooldown || connection.testStatus === "unavailable" || connection.lastError || hasModelAffinityLock) && (
            <Tooltip text="Reset exhausted/cooldown status">
              <button
                onClick={async () => {
                  setResettingStatus(true);
                  try {
                    await onResetStatus(connection.id);
                  } finally {
                    setResettingStatus(false);
                  }
                }}
                disabled={resettingStatus}
                className="flex flex-col items-center rounded px-2 py-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
              >
                <span className={`material-symbols-outlined text-[18px] ${resettingStatus ? "animate-spin" : ""}`}>
                  restart_alt
                </span>
                <span className="text-[10px] leading-tight">Reset</span>
              </button>
            </Tooltip>
          )}
          <button onClick={onEdit} className="flex flex-col items-center rounded px-2 py-1 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5">
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span className="text-[10px] leading-tight">Edit</span>
          </button>
          <button onClick={onDelete} className="flex flex-col items-center rounded px-2 py-1 text-red-500 hover:bg-red-500/10">
            <span className="material-symbols-outlined text-[18px]">delete</span>
            <span className="text-[10px] leading-tight">Delete</span>
          </button>
        </div>
        <Toggle
          size="sm"
          checked={connection.isActive ?? true}
          onChange={onToggleActive}
          title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
        />
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    modelLockUntil: PropTypes.string,
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
    globalPriority: PropTypes.number,
  }).isRequired,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    proxyUrl: PropTypes.string,
    noProxy: PropTypes.string,
    isActive: PropTypes.bool,
  })),
  isOAuth: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onUnlockModel: PropTypes.func,
  proxyGroups: PropTypes.object,
  oneByOneStatus: PropTypes.shape({
    state: PropTypes.string,
    error: PropTypes.string,
  }),
  autoPing: PropTypes.shape({
    on: PropTypes.bool,
    onToggle: PropTypes.func,
    provider: PropTypes.string,
  }),
};
