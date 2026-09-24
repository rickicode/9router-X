"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { Card, Button, Badge, CardSkeleton } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { formatTokens } from "@/shared/utils/formatTokens";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const emptySubscribe = () => () => {};

const fmt = (n) => new Intl.NumberFormat().format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function AppPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [connections, setConnections] = useState([]);
  const [keys, setKeys] = useState([]);
  const { copied, copy } = useCopyToClipboard();

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const baseUrl = isClient && typeof window !== "undefined"
    ? `${window.location.origin}/v1`
    : "/v1";

  const gatewayUrl = isClient && typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:10129/v1`
    : "";

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [statsRes, provRes, keysRes] = await Promise.all([
        fetch("/api/usage/stats?period=24h"),
        fetch("/api/providers"),
        fetch("/api/keys"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (provRes.ok) {
        const provData = await provRes.json();
        setConnections(provData.connections || []);
      }
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setKeys(keysData.keys || []);
      }
    } catch (err) {
      console.error("[DashboardApp] Error fetching overview data:", err);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-machine-id={machineId}>
        <CardSkeleton />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  const activeKey = keys.find((k) => k.isActive !== false)?.key || keys[0]?.key || "";
  const maskedKey = activeKey
    ? `${activeKey.slice(0, 7)}...${activeKey.slice(-4)}`
    : "No API key created";

  const totalReq = stats?.totalRequests || 0;
  const failedReq = stats?.totalFailedRequests || 0;
  const successRate = totalReq > 0
    ? (((totalReq - failedReq) / totalReq) * 100).toFixed(1)
    : "100";

  // Aggregate connected providers
  const activeConnections = connections.filter((c) => c.isActive !== false);
  const providerGroups = activeConnections.reduce((acc, c) => {
    const provId = c.provider || "unknown";
    if (!acc[provId]) {
      acc[provId] = {
        id: provId,
        name: AI_PROVIDERS[provId]?.name || c.name || provId,
        color: AI_PROVIDERS[provId]?.color,
        count: 0,
        hasError: false,
      };
    }
    acc[provId].count += 1;
    if (c.status === "error") acc[provId].hasError = true;
    return acc;
  }, {});

  const connectedProviderList = Object.values(providerGroups).slice(0, 6);
  const recentRequests = (stats?.recentRequests || []).slice(0, 8);

  const curlCommand = `curl -X POST ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${activeKey || "YOUR_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello"}]}'`;

  return (
    <div className="flex flex-col gap-3" data-machine-id={machineId}>
      {/* 1. Gateway Status & Quick Connect Hero */}
      <Card
        title="Gateway Overview"
        subtitle="High-performance AI routing proxy status and primary connection endpoints"
        icon="hub"
        action={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium border flex items-center gap-1.5 bg-success/10 text-success border-success/30">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-success" />
              </span>
              GATEWAY ACTIVE
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={refreshing ? "progress_activity" : "refresh"}
              loading={refreshing}
              onClick={() => fetchData(true)}
              aria-label="Refresh overview data"
            >
              Refresh
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Main API Endpoint */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3.5 gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">api</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-text-main">Base Endpoint URL</h4>
                  <p className="text-[10px] text-text-muted">Standard OpenAI /v1 compatibility</p>
                </div>
              </div>
              <Badge variant="primary" size="sm">OpenAI v1</Badge>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2">
              <code className="font-mono text-xs text-text-main truncate select-all">{baseUrl}</code>
              <Button
                size="xs"
                variant="secondary"
                icon={copied === "base_url" ? "check" : "content_copy"}
                onClick={() => copy(baseUrl, "base_url")}
                aria-label={copied === "base_url" ? "Copied Base URL" : "Copy Base URL"}
              >
                {copied === "base_url" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Active API Key */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3.5 gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">key</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-text-main">Default API Key</h4>
                  <p className="text-[10px] text-text-muted">{keys.length} key(s) configured</p>
                </div>
              </div>
              <Link
                href="/dashboard/endpoint"
                className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5"
              >
                Manage
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2">
              <code className="font-mono text-xs text-text-main truncate select-all">
                {maskedKey}
              </code>
              <Button
                size="xs"
                variant="secondary"
                disabled={!activeKey}
                icon={copied === "api_key" ? "check" : "content_copy"}
                onClick={() => copy(activeKey, "api_key")}
                aria-label={copied === "api_key" ? "Copied API key" : "Copy API key"}
              >
                {copied === "api_key" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. 24-Hour KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Requests */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Requests (24h)
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-3 text-text-main">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">swap_horiz</span>
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {fmt(totalReq)}
            </span>
            <span className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
              <span className={failedReq > 0 ? "text-warning" : "text-success"}>
                {successRate}%
              </span>
              <span>success</span>
            </span>
          </div>
        </div>

        {/* Input Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Input Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">input</span>
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalPromptTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Prompt payload</span>
          </div>
        </div>

        {/* Output Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Output Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">output</span>
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalCompletionTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Completion payload</span>
          </div>
        </div>

        {/* Cached Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Cached Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">database</span>
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalCachedTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Prompt cache hits</span>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Estimated Cost
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">payments</span>
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {fmtCost(stats?.totalCost || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Rolling 24h usage</span>
          </div>
        </div>
      </div>

      {/* 3. Two-Column System Health: Providers & Tool Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Providers Health */}
        <Card
          title="Upstream Providers"
          subtitle={`${activeConnections.length} active connection(s) configured`}
          icon="dns"
          action={
            <Link
              href="/dashboard/providers"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              All Providers
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          }
        >
          {connectedProviderList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border rounded-lg bg-surface-2/40">
              <span className="material-symbols-outlined text-3xl text-text-muted mb-2">dns</span>
              <p className="text-xs font-medium text-text-main">No active providers configured</p>
              <p className="text-[11px] text-text-muted mt-1 mb-3 max-w-xs">
                Connect OpenAI, Claude, Kiro, Codex, or local models to start routing.
              </p>
              <Link href="/dashboard/providers">
                <Button size="sm" variant="primary" icon="add">Add Provider</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {connectedProviderList.map((prov) => (
                <Link
                  key={prov.id}
                  href={`/dashboard/providers/${prov.id}`}
                  className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors min-w-0"
                >
                  <div className="size-7 shrink-0 rounded flex items-center justify-center bg-surface-3">
                    <ProviderIcon providerId={prov.id} alt={prov.name} size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-main truncate">{prov.name}</p>
                    <div className="flex items-center gap-1 text-[10px] text-text-muted">
                      <span className={`size-1.5 rounded-full ${prov.hasError ? "bg-danger" : "bg-success"}`} />
                      <span>{prov.count} account{prov.count > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* CLI Tools & Agent Integration */}
        <Card
          title="CLI & Agent Integration"
          subtitle="One endpoint for Claude Code, Cursor, Codex, OpenClaw & Cline"
          icon="terminal"
          action={
            <Link
              href="/dashboard/cli-tools"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              Configure Tools
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Link
                href="/dashboard/cli-tools/claude"
                className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">code</span>
                <p className="text-xs font-medium text-text-main mt-1">Claude Code</p>
                <p className="text-[10px] text-text-muted">Anthropic Spec</p>
              </Link>
              <Link
                href="/dashboard/cli-tools/cursor"
                className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">laptop_chromebook</span>
                <p className="text-xs font-medium text-text-main mt-1">Cursor IDE</p>
                <p className="text-[10px] text-text-muted">OpenAI Spec</p>
              </Link>
              <Link
                href="/dashboard/cli-tools/codex"
                className="p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">smart_toy</span>
                <p className="text-xs font-medium text-text-main mt-1">Codex CLI</p>
                <p className="text-[10px] text-text-muted">Direct /v1</p>
              </Link>
            </div>

            <div className="rounded-md border border-border bg-bg p-2 flex items-center justify-between gap-2">
              <code className="font-mono text-[11px] text-text-muted truncate select-all">
                export OPENAI_BASE_URL=&quot;{baseUrl}&quot;
              </code>
              <Button
                size="xs"
                variant="secondary"
                icon={copied === "env_curl" ? "check" : "content_copy"}
                onClick={() => copy(`export OPENAI_BASE_URL="${baseUrl}"\nexport OPENAI_API_KEY="${activeKey}"`, "env_curl")}
                aria-label="Copy environment variable export"
              >
                {copied === "env_curl" ? "Copied" : "Copy Env"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. Recent Requests Stream */}
      <Card
        title="Recent Requests"
        subtitle="Live traffic routed through the 9Router gateway"
        icon="history"
        action={
          <Link
            href="/dashboard/usage"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            Analytics & Logs
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </Link>
        }
      >
        {recentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border rounded-lg bg-surface-2/30">
            <span className="material-symbols-outlined text-3xl text-text-muted mb-2">swap_calls</span>
            <p className="text-xs font-medium text-text-main">No recent requests recorded</p>
            <p className="text-[11px] text-text-muted mt-1 mb-3 max-w-sm">
              Send a request to {baseUrl} using your favorite coding tool or test with cURL below.
            </p>
            <Button
              size="xs"
              variant="secondary"
              icon={copied === "test_curl" ? "check" : "terminal"}
              onClick={() => copy(curlCommand, "test_curl")}
              aria-label="Copy test curl command"
            >
              {copied === "test_curl" ? "Copied test cURL!" : "Copy Test cURL"}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-muted text-[10px] uppercase font-mono tracking-wider">
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2.5">Model</th>
                  <th className="py-2 px-2.5">Provider</th>
                  <th className="py-2 px-2.5 text-right">Tokens</th>
                  <th className="py-2 px-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentRequests.map((req, idx) => {
                  const isOk = req.status === "ok";
                  const time = req.timestamp
                    ? new Date(req.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })
                    : "—";

                  const totalT = (req.promptTokens || 0) + (req.completionTokens || 0);

                  return (
                    <tr key={`${req.timestamp}-${idx}`} className="hover:bg-surface-2/60 transition-colors">
                      <td className="py-2 px-2.5 font-mono text-text-muted whitespace-nowrap text-[11px]">
                        {time}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-text-main truncate max-w-[180px]">
                        {req.model || "unknown"}
                      </td>
                      <td className="py-2 px-2.5 text-text-muted truncate max-w-[120px]">
                        {req.provider || "—"}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums text-text-main">
                        {formatTokens(totalT)}
                      </td>
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <Badge variant={isOk ? "success" : "error"} size="sm" dot>
                          {isOk ? "200 OK" : "Failed"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

AppPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
