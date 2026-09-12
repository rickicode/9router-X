"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import QuotaTable from "./QuotaTable";
import Toggle from "@/shared/components/Toggle";
import Tooltip from "@/shared/components/Tooltip";
import {
  parseQuotaData,
  calculatePercentage,
  filterQuotasByVisibility,
  formatFreebucksHeader,
  getHiddenQuotaRows,
  getQuotaVisibilityKey,
  getConnectionLabel,
  getConnectionQuotaRemaining,
  sortVisibleConnections,
  buildLoadingState,
  filterQuotaStateByConnections,
  getConnectionsEmptyMessage,
  getPageSizeLabel,
  getConnectionsPaginationSummary,
  getSafePagination,
  getSafeTotals,
  shouldResetPage,
  getPaginationPageValue,
  getProviderOptions,
  reconcileConnectionsPage,
  getQuotaCache,
  setQuotaCache,
  getEffectiveConnectionStatus,
  QUOTA_CACHE_KEY,
  REFRESH_INTERVAL_MS,
  CLAUDE_REFRESH_INTERVAL_MS,
  DEPLETED_QUOTA_THRESHOLD,
  AUTO_REFRESH_STORAGE_KEY,
  CONNECTIONS_PAGE_SIZE,
  ACCOUNT_PAGE_SIZE_OPTIONS,
  ACCOUNT_PAGE_SIZE_MAX,
  ACCOUNT_FILTER_OPTIONS,
  QUOTA_SORT_OPTIONS,
} from "./utils";
import Card from "@/shared/components/Card";
import { ConfirmModal, EditConnectionModal, Badge, CardSkeleton } from "@/shared/components";
import { getStatusVariant } from "@/shared/utils/connectionStatus";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
// Maps the stored providerSpecificData.authMethod to a human label for Kiro.
// Values come from the Kiro connect flows: builder-id/idc (device code),
// google/github (social), imported (refresh-token paste), api_key (headless).
const KIRO_METHOD_LABELS = {
  "builder-id": "AWS Builder ID",
  idc: "IAM Identity Center",
  google: "Google",
  github: "GitHub",
  imported: "Imported Token",
  api_key: "API Key",
};

const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

const AUTO_PING_TOOLTIPS = {
  claude: "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.",
  codex: "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota.",
};

function kiroMethodLabel(conn) {
  const m = conn.providerSpecificData?.authMethod;
  if (m && KIRO_METHOD_LABELS[m]) return KIRO_METHOD_LABELS[m];
  return conn.authType === "api_key" ? "API Key" : "OAuth";
}

function getConnectionSecondaryLabel(connection) {
  if (connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()) {
    return connection.email.trim();
  }

  if (connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()) {
    return connection.displayName.trim();
  }

  return null;
}

// Region is stored for builder-id/idc/api_key flows; social and imported flows
// omit it, so fall back to the region segment of the profileArn
// (arn:aws:codewhisperer:<region>:...).
function kiroRegion(conn) {
  const r = conn.providerSpecificData?.region;
  if (r) return r;
  const arn = conn.providerSpecificData?.profileArn;
  const seg = typeof arn === "string" ? arn.split(":")[3] : "";
  return seg || "";
}

function getCodexResetCreditCount(quota) {
  const value = quota?.raw?.resetCredits?.availableCount;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function formatCreditDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRemaining(value) {
  if (!value) return "N/A";
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "N/A";
  if (diffMs <= 0) return "Expired";
  const totalHours = Math.ceil(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export default function ProviderLimits() {
  const { copied, copy } = useCopyToClipboard();
  const [connections, setConnections] = useState([]);
  const [quotaData, setQuotaData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoPingMaps, setAutoPingMaps] = useState({ claude: {}, codex: {} });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hasHydratedAutoRefresh, setHasHydratedAutoRefresh] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [resettingLimitId, setResettingLimitId] = useState(null);
  const [resetConfirmState, setResetConfirmState] = useState(null);
  const [resetCreditsState, setResetCreditsState] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [proxyPools, setProxyPools] = useState([]);
  const [providerFilter, setProviderFilter] = useState("all");
  const [providerOptions, setProviderOptions] = useState([]);
  const [accountFilter, setAccountFilter] = useState("all");
  const [quotaSortMode, setQuotaSortMode] = useState("default");
  const [quotaVisibility, setQuotaVisibility] = useState({});
  const [expiringFirst, setExpiringFirst] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [bulkToggling, setBulkToggling] = useState(false);
  const [openMenuConnectionId, setOpenMenuConnectionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const headerSearchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);
  const setHeaderSearchQuery = useHeaderSearchStore((s) => s.setQuery);

  useEffect(() => {
    registerSearch("Search accounts...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  useEffect(() => {
    if (headerSearchQuery !== searchQuery) {
      setSearchQuery(headerSearchQuery);
    }
  }, [headerSearchQuery, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchQuery.trim();
      setDebouncedSearch((prev) => {
        if (prev !== trimmed) {
          setPage(1);
        }
        return trimmed;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CONNECTIONS_PAGE_SIZE);
  const [customPageSizeInput, setCustomPageSizeInput] = useState(
    String(CONNECTIONS_PAGE_SIZE),
  );
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: CONNECTIONS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [totals, setTotals] = useState({
    eligibleConnections: 0,
    providerFilteredConnections: 0,
  });
  const [statusCounts, setStatusCounts] = useState({
    total: 0,
    active: 0,
    exhausted: 0,
    unavailable: 0,
    disabled: 0,
  });

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const tickCountRef = useRef(0);

  const fetchConnections = useCallback(
    async (targetPage = page) => {
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(pageSize),
          accountStatus: accountFilter,
          sort: "priority",
        });
        if (providerFilter !== "all") {
          params.set("provider", providerFilter);
        }

        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        params.set("_t", String(Date.now()));
        const response = await fetch(
          `/api/providers/client?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Failed to fetch connections");

        const data = await response.json();
        const connectionList = data.connections || [];
        const nextPagination = getSafePagination(data.pagination, pageSize);
        const nextTotals = getSafeTotals(data.totals, connectionList.length);

        setConnections(connectionList);
        setProviderOptions(getProviderOptions(data.providerOptions));
        setPagination(nextPagination);
        setTotals(nextTotals);
        setPage(getPaginationPageValue(data.pagination, targetPage));
        if (data.statusCounts) {
          setStatusCounts(data.statusCounts);
        }
        return connectionList;
      } catch (error) {
        console.error("Error fetching connections:", error);
        setConnections([]);
        setProviderOptions([]);
        setPagination({ page: 1, pageSize, total: 0, totalPages: 1 });
        setTotals({ eligibleConnections: 0, providerFilteredConnections: 0 });
        setStatusCounts({
          total: 0,
          active: 0,
          exhausted: 0,
          unavailable: 0,
          disabled: 0,
        });
        return [];
      }
    },
    [accountFilter, page, pageSize, providerFilter, debouncedSearch],
  );

  // Fetch quota for a specific connection
  const fetchQuota = useCallback(async (connectionId, provider, { force = false } = {}) => {
    setLoading((prev) => ({ ...prev, [connectionId]: true }));
    setErrors((prev) => ({ ...prev, [connectionId]: null }));

    try {
      console.log(
        `[ProviderLimits] Fetching quota for ${provider} (${connectionId})`,
      );
      const url = `/api/usage/${connectionId}${force ? "?force=1" : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;

        // Handle different error types gracefully
        if (response.status === 404) {
          // Connection not found - skip silently
          console.warn(
            `[ProviderLimits] Connection not found for ${provider}, skipping`,
          );
          return;
        }

        if (response.status === 401) {
          // Auth error - show message instead of throwing
          console.warn(
            `[ProviderLimits] Auth error for ${provider}:`,
            errorMsg,
          );
          const quotaEntry = {
            quotas: [],
            message: errorMsg,
          };
          setQuotaData((prev) => ({
            ...prev,
            [connectionId]: quotaEntry,
          }));
          setQuotaCache(connectionId, quotaEntry);
          return;
        }

        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      console.log(`[ProviderLimits] Got quota for ${provider}:`, data);

      // Parse quota data using provider-specific parser
      const parsedQuotas = parseQuotaData(provider, data);

      const quotaEntry = {
        quotas: parsedQuotas,
        plan: data.plan || null,
        message: data.message || null,
        raw: data,
      };

      setQuotaData((prev) => ({
        ...prev,
        [connectionId]: quotaEntry,
      }));
      setQuotaCache(connectionId, quotaEntry);
    } catch (error) {
      console.error(
        `[ProviderLimits] Error fetching quota for ${provider} (${connectionId}):`,
        error,
      );
      setErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Failed to fetch quota",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  // Refresh quota for a specific provider
  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider, { force: true });
      setLastUpdated(new Date());
    },
    [fetchQuota],
  );

  const [resettingStatusId, setResettingStatusId] = useState(null);

  const handleResetConnectionStatus = useCallback(async (connectionId, provider) => {
    setResettingStatusId(connectionId);
    try {
      const res = await fetch(`/api/providers/${connectionId}/reset-status`, { method: "POST" });
      if (res.ok) {
        notify.success("Status and cooldown reset");
        await fetchQuota(connectionId, provider);
        await fetchConnections(pagination.page);
      } else {
        const d = await res.json().catch(() => ({}));
        notify.error(d.error || "Failed to reset status");
      }
    } catch {
      notify.error("Failed to reset status");
    } finally {
      setResettingStatusId(null);
    }
  }, [fetchQuota, fetchConnections, pagination.page]);

  const handleResetCodexLimit = useCallback(
    async (connectionId, provider) => {
      if (provider !== "codex" || resettingLimitId) return;

      setResettingLimitId(connectionId);
      setErrors((prev) => ({ ...prev, [connectionId]: null }));

      try {
        const response = await fetch(`/api/usage/${connectionId}/codex-reset-credits`, { method: "POST" });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.message || result.error || result.code || "Failed to reset Codex limit");
        }

        await fetchQuota(connectionId, provider);
        setLastUpdated(new Date());
      } catch (error) {
        setErrors((prev) => ({ ...prev, [connectionId]: error.message || "Failed to reset Codex limit" }));
      } finally {
        setResettingLimitId(null);
      }
    },
    [fetchQuota, resettingLimitId],
  );

  const handleViewCodexResetCredits = useCallback(async (connection) => {
    setResetCreditsState({ connection, loading: true, error: null, data: null });
    try {
      const response = await fetch(`/api/usage/${connection.id}/codex-reset-credits`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to load Codex reset credits");
      }
      const credits = Array.isArray(result.credits) ? [...result.credits] : [];
      credits.sort((a, b) => {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
      setResetCreditsState({ connection, loading: false, error: null, data: { ...result, credits } });
    } catch (error) {
      setResetCreditsState({ connection, loading: false, error: error.message || "Failed to load Codex reset credits", data: null });
    }
  }, []);

  const handleDeleteConnection = useCallback(
    async (id) => {
      if (!confirm("Delete this connection?")) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
        if (res.ok) {
          setQuotaData((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setLoading((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setErrors((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });

          if (typeof window !== "undefined") {
            try {
              const cache = getQuotaCache();
              if (cache[id]) {
                delete cache[id];
                window.localStorage.setItem(
                  QUOTA_CACHE_KEY,
                  JSON.stringify(cache),
                );
              }
            } catch (e) {
              console.error("Error deleting cache entry:", e);
            }
          }

          await reconcileConnectionsPage(fetchConnections, page);
        }
      } catch (error) {
        console.error("Error deleting connection:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [fetchConnections, page],
  );

  const handleToggleConnectionActive = useCallback(
    async (id, isActive) => {
      setTogglingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        });
        if (res.ok) {
          setQuotaData((prev) => {
            const next = { ...prev };
            return next;
          });
          await reconcileConnectionsPage(fetchConnections, page);
        }
      } catch (error) {
        console.error("Error updating connection status:", error);
      } finally {
        setTogglingId(null);
      }
    },
    [fetchConnections, page],
  );

  const handleUpdateConnection = useCallback(
    async (formData) => {
      if (!selectedConnection?.id) return;
      const connectionId = selectedConnection.id;
      const provider = selectedConnection.provider;
      try {
        const res = await fetch(`/api/providers/${connectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          await fetchConnections();
          setShowEditModal(false);
          setSelectedConnection(null);
          if (USAGE_SUPPORTED_PROVIDERS.includes(provider)) {
            await fetchQuota(connectionId, provider);
          }
        }
      } catch (error) {
        console.error("Error saving connection:", error);
      }
    },
    [selectedConnection, fetchConnections, fetchQuota],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/proxy-pools?isActive=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.proxyPools) {
          setProxyPools(data.proxyPools);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAll = useCallback(async (force = false) => {
    if (refreshingAll) return;

    setRefreshingAll(true);
    setCountdown(60);

    // Throttle Claude: poll its quota every Nth auto-tick (manual force bypasses)
    const tick = (tickCountRef.current += 1);
    const claudeEvery = Math.round(CLAUDE_REFRESH_INTERVAL_MS / REFRESH_INTERVAL_MS);
    const shouldFetch = (conn) =>
      force || conn.provider !== "claude" || tick % claudeEvery === 0;

    try {
      const visibleConnections = await fetchConnections(page);

      setLoading(buildLoadingState(visibleConnections));
      setErrors((prev) =>
        filterQuotaStateByConnections(prev, visibleConnections),
      );
      setQuotaData((prev) =>
        filterQuotaStateByConnections(prev, visibleConnections),
      );

      await Promise.all(
        visibleConnections
          .filter(shouldFetch)
          .map((conn) => fetchQuota(conn.id, conn.provider)),
      );

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error refreshing all providers:", error);
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshingAll, fetchConnections, fetchQuota, page]);

  useEffect(() => {
    const initializeData = async () => {
      setConnectionsLoading(true);
      const visibleConnections = await fetchConnections(page);
      setConnectionsLoading(false);

      // Always fetch fresh quota on mount, no cache display
      setLoading(buildLoadingState(visibleConnections));
      setErrors((prev) =>
        filterQuotaStateByConnections(prev, visibleConnections),
      );
      setQuotaData((prev) =>
        filterQuotaStateByConnections(prev, visibleConnections),
      );

      await Promise.all(
        visibleConnections.map((conn) => fetchQuota(conn.id, conn.provider)),
      );
      setLastUpdated(new Date());
    };

    initializeData();
  }, [fetchConnections, fetchQuota, page]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    setAutoRefresh(stored === null ? true : stored === "true");
    setHasHydratedAutoRefresh(true);
  }, []);

  // Persist auto-refresh preference
  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedAutoRefresh) return;
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
  }, [autoRefresh, hasHydratedAutoRefresh]);

  // Load auto-ping per-connection maps
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => {
        setAutoPingMaps({
          claude: s?.claudeAutoPing?.connections || {},
          codex: s?.codexAutoPing?.connections || {},
        });
        setQuotaVisibility(s?.quotaVisibility || {});
      })
      .catch(() => {});
  }, []);

  const toggleAutoPing = useCallback(async (connectionId, provider, on) => {
    const settingsKey = AUTO_PING_SETTINGS_KEYS[provider];
    if (!settingsKey) return;

    const previous = autoPingMaps;
    const nextProviderMap = { ...(autoPingMaps[provider] || {}), [connectionId]: on };
    const nextMaps = { ...autoPingMaps, [provider]: nextProviderMap };
    setAutoPingMaps(nextMaps);
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      const s = r.ok ? await r.json() : {};
      const cfg = { ...(s[settingsKey] || {}), connections: nextProviderMap };
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [settingsKey]: cfg }),
      });
    } catch {
      setAutoPingMaps(previous);
    }
  }, [autoPingMaps]);

  const updateQuotaVisibility = useCallback(async (nextVisibility, previousVisibility) => {
    setQuotaVisibility(nextVisibility);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaVisibility: nextVisibility }),
      });
      if (!response.ok) throw new Error("Failed to update quota visibility");
    } catch (error) {
      console.error("Error updating quota visibility:", error);
      setQuotaVisibility(previousVisibility);
    }
  }, []);

  const handleHideQuota = useCallback((provider, quota) => {
    const key = getQuotaVisibilityKey(quota);
    if (!provider || !key) return;

    const previous = quotaVisibility;
    const providerVisibility = previous[provider] || {};
    const hidden = new Set(providerVisibility.hidden || []);
    hidden.add(key);
    if (provider === "antigravity") {
      if (key === "gemini") {
        for (const k of hidden) {
          if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
        }
      } else if (key === "claude") {
        for (const k of hidden) {
          if (k.startsWith("claude-")) hidden.delete(k);
        }
      }
    }
    const next = {
      ...previous,
      [provider]: {
        ...providerVisibility,
        hidden: [...hidden],
      },
    };
    updateQuotaVisibility(next, previous);
  }, [quotaVisibility, updateQuotaVisibility]);

  const handleShowQuota = useCallback((provider, quota) => {
    const key = getQuotaVisibilityKey(quota);
    if (!provider || !key) return;

    const previous = quotaVisibility;
    const providerVisibility = previous[provider] || {};
    const hidden = new Set(providerVisibility.hidden || []);
    hidden.delete(key);
    if (provider === "antigravity") {
      if (key === "gemini") {
        for (const k of hidden) {
          if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
        }
      } else if (key === "claude") {
        for (const k of hidden) {
          if (k.startsWith("claude-")) hidden.delete(k);
        }
      }
    }
    const next = {
      ...previous,
      [provider]: {
        ...providerVisibility,
        hidden: [...hidden],
      },
    };
    updateQuotaVisibility(next, previous);
  }, [quotaVisibility, updateQuotaVisibility]);

  // Auto-refresh interval
  useEffect(() => {
    if (!hasHydratedAutoRefresh || !autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    // Main refresh interval
    intervalRef.current = setInterval(() => {
      refreshAll();
    }, REFRESH_INTERVAL_MS);

    // Countdown interval
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 60;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

  // Pause auto-refresh when tab is hidden (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      } else if (autoRefresh && hasHydratedAutoRefresh) {
        // Resume auto-refresh when tab becomes visible
        intervalRef.current = setInterval(() => refreshAll(), REFRESH_INTERVAL_MS);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

  const sortedConnections = useMemo(
    () =>
      sortVisibleConnections(
        accountFilter === "disabled"
          ? connections
          : connections.filter((c) => c.isActive !== false),
        quotaData,
        expiringFirst,
        providerFilter,
        quotaSortMode,
      ),
    [connections, quotaData, expiringFirst, providerFilter, quotaSortMode, accountFilter],
  );

  // Connection is depleted when any quota entry hit the threshold
  const isConnectionDepleted = (conn) => {
    const quotas = quotaData[conn.id]?.quotas;
    if (!quotas?.length) return false;
    return quotas.some((q) => {
      if (!q.total || q.total <= 0) return false;
      return calculatePercentage(q.used, q.total) <= DEPLETED_QUOTA_THRESHOLD;
    });
  };

  const bulkSetActive = useCallback(
    async (targetIds, isActive) => {
      if (!targetIds.length || bulkToggling) return;
      setBulkToggling(true);
      try {
        await fetch("/api/providers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targetIds, isActive }),
        });
        await reconcileConnectionsPage(fetchConnections, page);
      } catch (error) {
        console.error("Error bulk toggling connections:", error);
      } finally {
        setBulkToggling(false);
      }
    },
    [bulkToggling, fetchConnections, page],
  );

  const handleDisableDepleted = () => {
    const ids = sortedConnections
      .filter((c) => (c.isActive ?? true) && isConnectionDepleted(c))
      .map((c) => c.id);
    bulkSetActive(ids, false);
  };

  const handleEnableAvailable = () => {
    const ids = sortedConnections
      .filter((c) => !(c.isActive ?? true) && !isConnectionDepleted(c))
      .map((c) => c.id);
    bulkSetActive(ids, true);
  };

  const selectedProviderLabel =
    providerFilter === "all" ? "All providers" : providerFilter;
  const hasEligibleConnections = totals.eligibleConnections > 0;
  const hasVisibleConnections = sortedConnections.length > 0;
  const emptyState = getConnectionsEmptyMessage(
    totals,
    providerFilter,
    accountFilter,
    debouncedSearch,
  );
  const connectionsPageSummary = getConnectionsPaginationSummary(pagination);
  const isCustomPageSize = !ACCOUNT_PAGE_SIZE_OPTIONS.includes(pageSize);
  const pageSizeLabel = getPageSizeLabel(pageSize, isCustomPageSize);

  if (!connectionsLoading && !hasEligibleConnections) {
    return (
      <Card padding="lg">
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-[64px] text-text-muted opacity-20">
            cloud_off
          </span>
          <h3 className="mt-4 text-lg font-semibold text-text-primary">
            No Providers Connected
          </h3>
          <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">
            Connect to providers with OAuth to track your API quota limits and
            usage.
          </p>
        </div>
      </Card>
    );
  }


  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="space-y-3">
        {/* Top Bar: Status Tabs + Search */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Status Filter Tabs */}
          <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-1 dark:border-white/10 dark:bg-white/[0.03]">
            {[
              { key: "all", label: "All", count: statusCounts.total, dot: null },
              { key: "active", label: "Active", count: statusCounts.active, dot: "bg-emerald-500" },
              { key: "exhausted", label: "Exhausted", count: statusCounts.exhausted, dot: "bg-red-500" },
              { key: "unavailable", label: "Unavailable", count: statusCounts.unavailable, dot: "bg-amber-500" },
              { key: "disabled", label: "Turned off", count: statusCounts.disabled, dot: "bg-zinc-400" },
            ].map((tab) => {
              const isSelected = accountFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (accountFilter !== tab.key) {
                      setPage(1);
                    }
                    setAccountFilter(tab.key);
                  }}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-primary text-white shadow-xs"
                      : "text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5"
                  }`}
                >
                  {tab.dot && (
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${isSelected ? "bg-white" : tab.dot}`}
                    />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-black/5 text-text-muted dark:bg-white/10"
                    }`}
                  >
                    {tab.count ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Account Search Input */}
          <div className="relative w-full sm:w-72 lg:w-80">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                setHeaderSearchQuery(val);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = searchQuery.trim();
                  if (trimmed !== debouncedSearch) {
                    setPage(1);
                    setDebouncedSearch(trimmed);
                  }
                }
              }}
              placeholder="Search accounts..."
              aria-label="Search accounts"
              className="h-9 w-full rounded-xl border border-black/10 bg-surface pl-8.5 pr-8 text-xs text-text-primary placeholder:text-text-muted outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary/40 dark:border-white/10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setHeaderSearchQuery("");
                  if (debouncedSearch !== "") {
                    setPage(1);
                    setDebouncedSearch("");
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-main transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Toolbar: Filters & Sorting (Left) + Actions & Utilities (Right) */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-black/[0.06] bg-black/[0.01] px-2.5 py-2 dark:border-white/[0.06] dark:bg-white/[0.01]">
          {/* Left: Provider & Sorting Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Provider Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProviderMenuOpen((prev) => !prev)}
                className={`flex h-8 items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                  providerFilter !== "all"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-black/10 bg-surface text-text-primary hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                }`}
                aria-haspopup="menu"
                aria-expanded={providerMenuOpen}
                title="Filter quota providers"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {providerFilter === "all" ? (
                    <span className="material-symbols-outlined text-[15px] text-text-muted">
                      apps
                    </span>
                  ) : (
                    <ProviderIcon
                      src={`/providers/${providerFilter}.png`}
                      alt={providerFilter}
                      size={16}
                      className="size-4 rounded object-contain"
                      fallbackText={providerFilter.slice(0, 2).toUpperCase()}
                    />
                  )}
                  <span className="truncate capitalize">
                    {selectedProviderLabel}
                  </span>
                </span>
                <span className="material-symbols-outlined text-[14px] text-text-muted">
                  expand_more
                </span>
              </button>

              {providerMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-30 bg-transparent"
                    aria-label="Close provider filter"
                    onClick={() => setProviderMenuOpen(false)}
                  />
                  <div className="absolute left-0 z-40 mt-1.5 w-64 overflow-hidden rounded-2xl border border-black/10 bg-surface/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-surface/95 sm:w-72">
                    <button
                      type="button"
                      onClick={() => {
                        if (shouldResetPage(providerFilter, "all")) {
                          setPage(1);
                        }
                        setProviderFilter("all");
                        setProviderMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                        providerFilter === "all"
                          ? "bg-primary/10 text-primary"
                          : "text-text-primary hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        apps
                      </span>
                      <span>All providers</span>
                      {providerFilter === "all" && (
                        <span className="material-symbols-outlined ml-auto text-[18px]">
                          check
                        </span>
                      )}
                    </button>
                    <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
                    <div className="max-h-72 overflow-y-auto pr-1">
                      {providerOptions.map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => {
                            if (shouldResetPage(providerFilter, provider)) {
                              setPage(1);
                            }
                            setProviderFilter(provider);
                            setProviderMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                            providerFilter === provider
                              ? "bg-primary/10 text-primary"
                              : "text-text-primary hover:bg-black/5 dark:hover:bg-white/10"
                          }`}
                        >
                          <ProviderIcon
                            src={`/providers/${provider}.png`}
                            alt={provider}
                            size={20}
                            className="size-5 rounded object-contain"
                            fallbackText={provider.slice(0, 2).toUpperCase()}
                          />
                          <span className="capitalize">{provider}</span>
                          {providerFilter === provider && (
                            <span className="material-symbols-outlined ml-auto text-[18px]">
                              check
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Codex Quota Sort */}
            {providerFilter === "codex" && (
              <select
                value={quotaSortMode}
                onChange={(event) => setQuotaSortMode(event.target.value)}
                className="h-8 rounded-lg border border-black/10 bg-surface px-2 text-xs font-medium text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                aria-label="Sort Codex quotas by remaining"
              >
                {QUOTA_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {/* Expiring First Toggle */}
            <button
              type="button"
              onClick={() => setExpiringFirst((prev) => !prev)}
              aria-pressed={expiringFirst}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                expiringFirst
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                  : "border-black/10 bg-surface text-text-primary hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              }`}
              title="Sort accounts by earliest quota reset time"
            >
              <span className="material-symbols-outlined text-[15px]">
                hourglass_top
              </span>
              <span>Expiring first</span>
            </button>

            {/* Reset active filters */}
            {(debouncedSearch || providerFilter !== "all" || accountFilter !== "all" || expiringFirst) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setHeaderSearchQuery("");
                  setAccountFilter("all");
                  setProviderFilter("all");
                  setExpiringFirst(false);
                  setPage(1);
                }}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
                title="Reset all filters"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Right: Actions & Utilities */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Bulk: Disable depleted */}
            <button
              type="button"
              onClick={handleDisableDepleted}
              disabled={bulkToggling}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-50"
              title="Disable connections with depleted quota on the current page"
            >
              <span className="material-symbols-outlined text-[14px]">block</span>
              <span>Turn off Empty</span>
            </button>

            {/* Bulk: Enable available */}
            <button
              type="button"
              onClick={handleEnableAvailable}
              disabled={bulkToggling}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
              title="Enable connections that still have quota on the current page"
            >
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              <span>Turn on Available</span>
            </button>

            <div className="hidden h-4 w-px bg-black/10 dark:bg-white/10 sm:block mx-0.5" />

            {/* Auto-refresh toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-surface px-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
            >
              <span
                className={`material-symbols-outlined text-[16px] ${
                  autoRefresh ? "text-primary" : "text-text-muted"
                }`}
              >
                {autoRefresh ? "toggle_on" : "toggle_off"}
              </span>
              <span>Auto-refresh</span>
              {autoRefresh && (
                <span className="text-[10px] text-text-muted tabular-nums">
                  ({countdown}s)
                </span>
              )}
            </button>

            {/* Refresh all button */}
            <button
              type="button"
              onClick={() => refreshAll(true)}
              disabled={refreshingAll}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-surface text-xs text-text-primary transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 disabled:opacity-50"
              title="Refresh all quotas"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${refreshingAll ? "animate-spin" : ""}`}
              >
                refresh
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Provider cards: 2 columns, compact */}
      {expiringFirst && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Expiring-first currently reorders accounts inside the current page.
          Cross-page ordering still follows backend pagination.
        </div>
      )}

      {/* Main Content: Loading Skeleton, Empty State, or Card Grid */}
      {connectionsLoading && !hasVisibleConnections ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !hasVisibleConnections ? (
        <Card padding="lg">
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-[56px] text-text-muted opacity-25">
              {emptyState.icon}
            </span>
            <h3 className="mt-3 text-base font-semibold text-text-primary">
              {emptyState.title}
            </h3>
            <p className="mt-1.5 text-xs text-text-muted max-w-md mx-auto">
              {emptyState.description}
            </p>
            {(debouncedSearch || accountFilter !== "all" || providerFilter !== "all" || expiringFirst) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setDebouncedSearch("");
                    setHeaderSearchQuery("");
                    setAccountFilter("all");
                    setProviderFilter("all");
                    setExpiringFirst(false);
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-surface px-3 py-1.5 text-xs font-medium text-text-primary shadow-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                  <span>Reset all filters</span>
                </button>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedConnections.map((conn) => {
          const quota = quotaData[conn.id];
          const isLoading = loading[conn.id];
          const error = errors[conn.id];

          // Use table layout for all providers
          const isInactive = conn.isActive === false;
          const isCodex = conn.provider === "codex";
          const resetCreditCount = getCodexResetCreditCount(quota);
          const isResettingLimit = resettingLimitId === conn.id;
          const rowBusy = deletingId === conn.id || togglingId === conn.id || isResettingLimit;
          const rawQuotas = quota?.quotas || [];
          const visibleQuotas = filterQuotasByVisibility(conn.provider, rawQuotas, quotaVisibility);
          const hiddenQuotaRows = getHiddenQuotaRows(conn.provider, rawQuotas, quotaVisibility);

          return (
            <Card
              key={conn.id}
              padding="none"
              className={`min-w-0 ${isInactive ? "opacity-60" : ""} ${openMenuConnectionId === conn.id ? "relative z-20" : ""}`}
            >
              <div className="px-3 py-2 border-b border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-md flex items-center justify-center overflow-hidden">
                      <ProviderIcon
                        src={`/providers/${conn.provider}.png`}
                        alt={conn.provider}
                        size={32}
                        className="object-contain"
                        fallbackText={
                          conn.provider?.slice(0, 2).toUpperCase() || "PR"
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-text-primary capitalize truncate">
                        {conn.provider}
                      </h3>
                      {getConnectionLabel(conn) ? (
                        <p className="text-xs text-text-muted truncate">
                          {getConnectionLabel(conn)}
                        </p>
                      ) : null}
                      {getConnectionSecondaryLabel(conn) ? (
                        <p className="text-[11px] text-text-muted/80 truncate">
                          {getConnectionSecondaryLabel(conn)}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {conn.provider === "kiro" && (
                          <>
                            <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                              {kiroMethodLabel(conn)}
                            </span>
                            {kiroRegion(conn) && (
                              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                {kiroRegion(conn)}
                              </span>
                            )}
                          </>
                        )}
                        <Badge
                          variant={getStatusVariant(conn.isActive, getEffectiveConnectionStatus(conn))}
                          size="sm"
                          dot
                          title={conn.isActive === false && conn.previousStatus && conn.previousStatus !== "disabled" ? `Status before disabled: ${conn.previousStatus}${conn.disabledAt ? ` at ${new Date(conn.disabledAt).toLocaleString()}` : ""}` : undefined}
                        >
                          {conn.isActive === false
                            ? (conn.previousStatus && conn.previousStatus !== "disabled" ? `disabled (was: ${conn.previousStatus})` : "disabled")
                            : getEffectiveConnectionStatus(conn)}
                        </Badge>
                        {conn.isActive === false && (conn.disabledReason || conn.lastError) && (
                          <span
                            className="max-w-full truncate text-xs text-amber-600 dark:text-amber-400 sm:max-w-[260px]"
                            title={`Reason: ${conn.disabledReason || conn.lastError}${conn.disabledAt ? ` (${new Date(conn.disabledAt).toLocaleString()})` : ""}`}
                          >
                            {conn.disabledReason || conn.lastError}
                          </span>
                        )}
                        {conn.providerSpecificData?.validationUrl && (
                          <div className="inline-flex flex-wrap items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="font-semibold">⚠️ Verify:</span>
                            <a
                              href={conn.providerSpecificData.validationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100"
                            >
                              Action Required ↗
                            </a>
                            <button
                              type="button"
                              onClick={() => copy(conn.providerSpecificData.validationUrl, `val-${conn.id}`)}
                              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
                              title="Copy validation URL"
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {copied === `val-${conn.id}` ? "check" : "content_copy"}
                              </span>
                              <span>{copied === `val-${conn.id}` ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        )}
                        {conn.provider === "kiro" && conn.providerSpecificData?.profileArn && (
                          <button
                            type="button"
                            onClick={() => copy(conn.providerSpecificData.profileArn, conn.id)}
                            title={conn.providerSpecificData.profileArn}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:text-primary"
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              {copied === conn.id ? "check" : "content_copy"}
                            </span>
                            <code className="truncate font-mono">
                              {conn.providerSpecificData.profileArn}
                            </code>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isCodex && resetCreditCount > 0 && (
                      <Tooltip
                        text={`Use one Codex reset credit. Available: ${resetCreditCount}`}
                      >
                        <button
                          type="button"
                          onClick={() => setResetConfirmState({ connection: conn, resetCreditCount })}
                          disabled={isLoading || rowBusy}
                          aria-label={`Use one Codex reset credit. ${resetCreditCount} available.`}
                          className="flex h-7 min-w-9 items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-1.5 text-[11px] font-medium tabular-nums text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className={`material-symbols-outlined text-[14px] ${isResettingLimit ? "animate-spin" : ""}`}>
                            {isResettingLimit ? "progress_activity" : "restart_alt"}
                          </span>
                          <span>{resetCreditCount}</span>
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip text="Refresh quota">
                      <button
                        type="button"
                        onClick={() => refreshProvider(conn.id, conn.provider)}
                        disabled={isLoading || rowBusy}
                        aria-label="Refresh quota"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <span
                          className={`material-symbols-outlined text-[16px] ${isLoading ? "animate-spin" : ""}`}
                        >
                          refresh
                        </span>
                      </button>
                    </Tooltip>

                    <div
                      className="inline-flex items-center px-0.5"
                      title={
                        (conn.isActive ?? true)
                          ? "Disable connection"
                          : "Enable connection"
                      }
                    >
                      <Toggle
                        size="sm"
                        checked={conn.isActive ?? true}
                        disabled={rowBusy}
                        onChange={(nextActive) =>
                          handleToggleConnectionActive(conn.id, nextActive)
                        }
                      />
                    </div>

                    {/* More actions menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuConnectionId((prev) => (prev === conn.id ? null : conn.id))}
                        aria-label="More actions"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-black/5 hover:text-text-main dark:hover:bg-white/5 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>

                      {openMenuConnectionId === conn.id && (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-30 bg-transparent"
                            aria-label="Close menu"
                            onClick={() => setOpenMenuConnectionId(null)}
                          />
                          <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-xl border border-black/10 bg-surface/95 p-1 shadow-xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-surface/95">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConnectionId(null);
                                setSelectedConnection(conn);
                                setShowEditModal(true);
                              }}
                              disabled={rowBusy}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[16px] text-text-muted">edit</span>
                              <span>Edit connection</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConnectionId(null);
                                handleResetConnectionStatus(conn.id, conn.provider);
                              }}
                              disabled={isLoading || rowBusy || resettingStatusId === conn.id}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                              <span className={`material-symbols-outlined text-[16px] text-amber-500 ${resettingStatusId === conn.id ? "animate-spin" : ""}`}>
                                restart_alt
                              </span>
                              <span>Reset status</span>
                            </button>

                            {isCodex && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuConnectionId(null);
                                  handleViewCodexResetCredits(conn);
                                }}
                                disabled={isLoading || rowBusy}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[16px] text-text-muted">schedule</span>
                                <span>Credit expiry</span>
                              </button>
                            )}

                            {AUTO_PING_SETTINGS_KEYS[conn.provider] && conn.authType === "oauth" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuConnectionId(null);
                                  toggleAutoPing(conn.id, conn.provider, !(autoPingMaps[conn.provider]?.[conn.id] === true));
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`material-symbols-outlined text-[16px] ${autoPingMaps[conn.provider]?.[conn.id] === true ? "text-primary" : "text-text-muted"}`}>
                                    bolt
                                  </span>
                                  <span>Auto-ping</span>
                                </div>
                                <span className="text-[10px] text-text-muted uppercase font-semibold">
                                  {autoPingMaps[conn.provider]?.[conn.id] === true ? "ON" : "OFF"}
                                </span>
                              </button>
                            )}

                            <div className="my-1 h-px bg-black/10 dark:bg-white/10" />

                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConnectionId(null);
                                handleDeleteConnection(conn.id);
                              }}
                              disabled={rowBusy}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              <span className={`material-symbols-outlined text-[16px] ${deletingId === conn.id ? "animate-pulse" : ""}`}>
                                delete
                              </span>
                              <span>Delete connection</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-2 py-1.5">
                {quota?.raw?.freebucks && !error && !isLoading && (
                  <div className="mb-1.5 rounded-md bg-black/[0.03] px-2 py-1.5 text-[10px] leading-relaxed text-text-muted dark:bg-white/[0.03]">
                    {formatFreebucksHeader(quota.raw.freebucks)}
                  </div>
                )}
                {isLoading ? (
                  <div className="text-center py-5 text-text-muted">
                    <span className="material-symbols-outlined text-[28px] animate-spin">
                      progress_activity
                    </span>
                  </div>
                ) : error ? (
                  <div className="text-center py-5">
                    <span className="material-symbols-outlined text-[28px] text-red-500">
                      error
                    </span>
                    <p className="mt-1.5 text-xs text-text-muted">{error}</p>
                  </div>
                ) : quota?.message ? (
                  <div className="text-center py-5">
                    <p className="text-xs text-text-muted">{quota.message}</p>
                  </div>
                ) : (
                  <QuotaTable
                    quotas={visibleQuotas}
                    compact
                    sortMode="default"
                    showSortLabel={
                      conn.provider === "codex" && quotaSortMode !== "default"
                    }
                    onHideQuota={(quotaRow) => handleHideQuota(conn.provider, quotaRow)}
                  />
                )}
                {quota?.message && !error && !isLoading && (
                  <p className="mt-2 px-1 text-[10px] leading-relaxed text-text-muted">
                    {quota.message}
                  </p>
                )}
                {hiddenQuotaRows.length > 0 && (
                  <div className="mt-2 flex min-w-0 items-center gap-1 border-t border-black/5 pt-2 text-[10px] text-text-muted dark:border-white/5">
                    <span className="material-symbols-outlined shrink-0 text-[14px]">
                      visibility_off
                    </span>
                    <span className="shrink-0">Hidden:</span>
                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap pb-2">
                      {hiddenQuotaRows.map((quotaRow) => (
                        <button
                          key={getQuotaVisibilityKey(quotaRow)}
                          type="button"
                          onClick={() => handleShowQuota(conn.provider, quotaRow)}
                          className="shrink-0 rounded-md border border-black/10 px-1.5 py-0.5 transition-colors hover:bg-black/5 hover:text-text-primary dark:border-white/10 dark:hover:bg-white/5"
                          title="Show this quota row"
                        >
                          {quotaRow.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      )}

{hasVisibleConnections && (
      <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-text-muted">{connectionsPageSummary}</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={isCustomPageSize ? "custom" : String(pageSize)}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "custom") return;
                  const nextPageSize = Number.parseInt(nextValue, 10);
                  if (Number.isFinite(nextPageSize)) {
                    setPage(1);
                    setPageSize(nextPageSize);
                    setCustomPageSizeInput(String(nextPageSize));
                  }
                }}
                className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
                aria-label="Accounts per page"
              >
                {ACCOUNT_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>
                    {option} / page
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <input
                type="number"
                min="1"
                max={String(ACCOUNT_PAGE_SIZE_MAX)}
                inputMode="numeric"
                value={customPageSizeInput}
                onChange={(event) => setCustomPageSizeInput(event.target.value)}
                onBlur={() => {
                  const parsedValue = Number.parseInt(customPageSizeInput, 10);
                  if (!Number.isFinite(parsedValue)) {
                    setCustomPageSizeInput(String(pageSize));
                    return;
                  }
                  const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
                  setPage(1);
                  setPageSize(nextPageSize);
                  setCustomPageSizeInput(String(nextPageSize));
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const parsedValue = Number.parseInt(customPageSizeInput, 10);
                  if (!Number.isFinite(parsedValue)) {
                    setCustomPageSizeInput(String(pageSize));
                    return;
                  }
                  const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
                  setPage(1);
                  setPageSize(nextPageSize);
                  setCustomPageSizeInput(String(nextPageSize));
                }}
                className="h-8 w-20 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
                aria-label="Custom accounts per page"
                placeholder="Custom"
              />
              <span className="text-xs text-text-muted">Page {pagination.page} / {pagination.totalPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={
                  pagination.page <= 1 || connectionsLoading || refreshingAll
                }
                className="flex h-8 items-center rounded-lg border border-black/10 px-3 text-xs text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                First Page
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((currentPage) => Math.max(1, currentPage - 1))
                }
                disabled={
                  pagination.page <= 1 || connectionsLoading || refreshingAll
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                aria-label="Previous accounts page"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((currentPage) =>
                    Math.min(pagination.totalPages, currentPage + 1),
                  )
                }
                disabled={
                  pagination.page >= pagination.totalPages ||
                  connectionsLoading ||
                  refreshingAll
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                aria-label="Next accounts page"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPage(pagination.totalPages)}
                disabled={
                  pagination.page >= pagination.totalPages ||
                  connectionsLoading ||
                  refreshingAll
                }
                className="flex h-8 items-center rounded-lg border border-black/10 px-3 text-xs text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              >
                Last Page
              </button>
            </div>
          </div>
        </div>
)}

      <ConfirmModal
        isOpen={Boolean(resetConfirmState)}
        onClose={() => {
          if (!resettingLimitId) setResetConfirmState(null);
        }}
        onConfirm={async () => {
          const connection = resetConfirmState?.connection;
          if (!connection) return;
          await handleResetCodexLimit(connection.id, connection.provider);
          setResetConfirmState(null);
        }}
        title="Reset Codex limit?"
        message={`Use 1 Codex reset credit for ${getConnectionLabel(resetConfirmState?.connection || {}) || "this account"}. This cannot be undone. Remaining credits: ${resetConfirmState?.resetCreditCount ?? 0}.`}
        confirmText="Reset limit"
        cancelText="Cancel"
        variant="danger"
        loading={Boolean(resettingLimitId)}
      />

      {resetCreditsState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-black/15 bg-white shadow-2xl ring-1 ring-black/10 dark:border-white/15 dark:bg-neutral-950 dark:ring-white/10">
            <div className="flex items-start justify-between gap-3 border-b border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary">Codex Reset Credit Expiry</h3>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {getConnectionLabel(resetCreditsState.connection) || "Codex account"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetCreditsState(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/5"
                aria-label="Close reset credit expiry modal"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto bg-white p-4 dark:bg-neutral-950">
              {resetCreditsState.loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  Loading reset credits...
                </div>
              ) : resetCreditsState.error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {resetCreditsState.error}
                </div>
              ) : resetCreditsState.data?.credits?.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
                    <span>{resetCreditsState.data.credits.length} reset credit{resetCreditsState.data.credits.length === 1 ? "" : "s"}</span>
                    <span>{resetCreditsState.data.availableCount ?? 0} available</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-text-muted dark:bg-white/[0.04]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Granted At</th>
                          <th className="px-3 py-2 font-medium">Expires At</th>
                          <th className="px-3 py-2 font-medium">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resetCreditsState.data.credits.map((credit, index) => (
                          <tr key={`${credit.status}-${credit.expiresAt || index}`} className="border-t border-black/5 dark:border-white/5">
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {credit.status || "unknown"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-text-muted">{formatCreditDate(credit.grantedAt)}</td>
                            <td className="px-3 py-2 text-text-primary">{formatCreditDate(credit.expiresAt)}</td>
                            <td className="px-3 py-2 font-medium text-text-primary">{formatTimeRemaining(credit.expiresAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-8 text-center text-sm text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
                  No reset credit details returned for this account.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConnection(null);
        }}
      />
    </div>
  );
}
