"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

const SUITES = [
  { id: "pong", label: "PONG Gate", subtitle: "Uji koneksi & respon singkat (Gerbang)", icon: "bolt" },
  { id: "coding", label: "Coding Test", subtitle: "TokenBucketRateLimiter Python (Thread-safe)", icon: "code" },
  { id: "logic", label: "Logic Puzzle", subtitle: "Teka-teki deduksi logika 4 profesi & mobil", icon: "psychology" },
  { id: "tool", label: "Tool Calling", subtitle: "Native function calling cuaca Jakarta", icon: "build" },
];

const STATUS_CONFIG = {
  passed: { label: "Lolos", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  failed: { label: "Gagal", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  rate_limited: { label: "Rate Limit (429)", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  skipped: { label: "Dilewati", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

const REVIEWER_PRESETS = [
  { id: "judge-router", label: "judge-router" },
  { id: "ag/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4.1 Flash" },
  { id: "kcf/deepseek-v3", label: "Kilo DeepSeek V3" },
];

export default function BenchmarkPage() {
  // 1. Build complete catalog of providers with their respective LLM models
  const catalog = useMemo(() => {
    return Object.values(AI_PROVIDERS)
      .filter((provider) => !provider.hidden)
      .map((provider) => {
        const alias = PROVIDER_ID_TO_ALIAS[provider.id] || provider.id;
        const rawModels = getModelsByProviderId(provider.id) || [];
        const models = rawModels
          .filter((model) => (model.kind || model.type || "llm") === "llm")
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            fullId: `${alias}/${m.id}`,
            alias,
            providerId: provider.id,
          }));
        return {
          id: provider.id,
          alias,
          name: provider.name || provider.id,
          models,
        };
      })
      .filter((p) => p.models.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // State: Selection
  const [selectedModelIds, setSelectedModelIds] = useState(() => {
    // Default select models for antigravity and kilocode-free
    const initial = new Set();
    catalog.forEach((p) => {
      if (p.id === "antigravity" || p.id === "kilocode-free") {
        p.models.forEach((m) => initial.add(m.fullId));
      }
    });
    return initial;
  });

  const [expandedProviders, setExpandedProviders] = useState(() => {
    const initial = new Set(["antigravity", "kilocode-free"]);
    return initial;
  });

  const [providerQuery, setProviderQuery] = useState("");
  const [suites, setSuites] = useState(["pong", "coding", "logic", "tool"]);
  const [reviewer, setReviewer] = useState("judge-router");

  // State: Job & Runtime Data
  const [jobs, setJobs] = useState([]);
  const [daily, setDaily] = useState([]);
  const [selectedHistoryJobs, setSelectedHistoryJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  const activeIdRef = useRef(null);
  activeIdRef.current = active?.id;

  // Derived: Filtered catalog based on search
  const filteredCatalog = useMemo(() => {
    const q = providerQuery.toLowerCase().trim();
    if (!q) return catalog;
    return catalog
      .map((provider) => {
        const providerMatch = provider.name.toLowerCase().includes(q) || provider.id.toLowerCase().includes(q);
        const matchingModels = provider.models.filter(
          (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.fullId.toLowerCase().includes(q)
        );
        if (providerMatch) return provider;
        if (matchingModels.length > 0) return { ...provider, models: matchingModels };
        return null;
      })
      .filter(Boolean);
  }, [catalog, providerQuery]);

  // Derived: active providers
  const activeProviders = useMemo(() => {
    const provs = new Set();
    catalog.forEach((p) => {
      if (p.models.some((m) => selectedModelIds.has(m.fullId))) {
        provs.add(p.id);
      }
    });
    return Array.from(provs);
  }, [catalog, selectedModelIds]);

  // Refresh data from server
  async function refresh(targetId = null) {
    const idToFetch = targetId !== null ? targetId : activeIdRef.current;
    try {
      const [listRes, jobRes] = await Promise.all([
        fetch("/api/benchmark", { cache: "no-store" }),
        idToFetch && idToFetch !== "pending" ? fetch(`/api/benchmark?id=${idToFetch}`, { cache: "no-store" }) : null,
      ]);
      if (listRes.ok) {
        const listData = await listRes.json();
        setJobs(listData.jobs || []);
        setDaily(listData.daily || []);
      }
      if (jobRes && jobRes.ok) {
        const jobData = await jobRes.json();
        setActive(jobData);
      }
    } catch (err) {
      console.warn("[benchmark] refresh error:", err.message);
    }
  }

  // Polling with fast tick (1s) when active job is running/queued
  useEffect(() => {
    refresh();
    const isRunning =
      starting ||
      active?.status === "running" ||
      active?.status === "queued" ||
      active?.status === "starting";
    const intervalMs = isRunning ? 1000 : 4000;
    const timer = setInterval(() => {
      refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active?.status, starting]);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const d = Number(data?.benchmarkRetentionDays);
        if (Number.isFinite(d)) setRetentionDays(d);
      })
      .catch(() => {});
  }, []);

  // Selection toggles
  function toggleSuite(suiteId) {
    setSuites((prev) => (prev.includes(suiteId) ? prev.filter((s) => s !== suiteId) : [...prev, suiteId]));
  }

  function toggleModel(fullId) {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(fullId)) next.delete(fullId);
      else next.add(fullId);
      return next;
    });
  }

  function toggleProviderModels(provider) {
    const allSelected = provider.models.every((m) => selectedModelIds.has(m.fullId));
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        provider.models.forEach((m) => next.delete(m.fullId));
      } else {
        provider.models.forEach((m) => next.add(m.fullId));
      }
      return next;
    });
  }

  function toggleExpandProvider(providerId) {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  function selectAllVisibleModels() {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      filteredCatalog.forEach((p) => p.models.forEach((m) => next.add(m.fullId)));
      return next;
    });
  }

  function clearAllModels() {
    setSelectedModelIds(new Set());
  }

  // Start benchmark execution with immediate UI feedback
  async function handleStartBenchmark() {
    if (selectedModelIds.size === 0 || suites.length === 0) return;
    setError("");
    setStarting(true);

    const modelsList = Array.from(selectedModelIds);

    // Instant local state update: zero lag visual transition
    setActive({
      id: "pending",
      status: "starting",
      providers: activeProviders,
      suites,
      reviewer: reviewer || null,
      progress: { done: 0, total: modelsList.length, phase: "Menginisialisasi tugas benchmark di server..." },
      attempts: [],
      reports: [],
      created_at: new Date().toISOString(),
    });

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: activeProviders,
          models: modelsList,
          suites,
          reviewer: reviewer ? reviewer.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memulai benchmark");
        setActive(null);
        return;
      }
      activeIdRef.current = data.id;
      await refresh(data.id);
    } catch (err) {
      setError(err.message || "Gagal menghubungi API benchmark");
      setActive(null);
    } finally {
      setStarting(false);
    }
  }

  // Ask AI reviewer advice from selected history
  async function handleAskAdvice() {
    if (selectedHistoryJobs.length === 0) return;
    setError("");
    setAdvising(true);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advice", reviewer, jobIds: selectedHistoryJobs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat saran");
        return;
      }
      activeIdRef.current = data.id;
      await refresh(data.id);
    } catch (err) {
      setError(err.message || "Gagal membuat saran");
    } finally {
      setAdvising(false);
    }
  }

  async function handleSaveRetention() {
    const days = Math.max(1, Math.min(365, Number(retentionDays) || 30));
    setRetentionDays(days);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benchmarkRetentionDays: days }),
    });
  }

  // Active attempts & metrics
  const attempts = active?.attempts || [];
  const counts = attempts.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + Number(row.n || 0);
      return acc;
    },
    { passed: 0, failed: 0, rate_limited: 0, skipped: 0 }
  );

  const report = active?.reports?.[0];
  const isJobRunning =
    starting ||
    active?.status === "running" ||
    active?.status === "queued" ||
    active?.status === "starting";

  const progressTotal = active?.progress?.total || selectedModelIds.size || 1;
  const progressDone = active?.progress?.done || 0;
  const progressPct = Math.min(100, Math.round((progressDone / Math.max(progressTotal, 1)) * 100));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ─── Page Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl text-brand-500">speed</span>
            <h1 className="text-2xl font-bold tracking-tight text-text-main">AI Model Benchmark</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Uji performa, latensi, liveness (PONG gate), dan kapabilitas model secara mandiri di server lokal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="md"
            variant="primary"
            icon="play_arrow"
            loading={starting || (isJobRunning && active?.id === "pending")}
            disabled={selectedModelIds.size === 0 || suites.length === 0}
            onClick={handleStartBenchmark}
            className="shadow-sm"
          >
            Jalankan Benchmark ({selectedModelIds.size} Model)
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-300">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ) : null}

      {/* ─── Top Configuration Card ─── */}
      <Card
        title="Konfigurasi Pengujian & Reviewer"
        subtitle="Atur suite pengujian, reviewer AI, dan target pengujian"
        icon="tune"
      >
        <div className="space-y-5">
          {/* Suite Selection */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block mb-2">
              1. Pilih Test Suites
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SUITES.map((s) => {
                const checked = suites.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSuite(s.id)}
                    className={`relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                      checked
                        ? "border-brand-500/50 bg-brand-500/5 shadow-sm"
                        : "border-border-subtle bg-surface-1 hover:border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-1 rounded border-border text-brand-500 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium text-sm text-text-main">
                        <span className="material-symbols-outlined text-base text-brand-400">{s.icon}</span>
                        <span>{s.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted leading-relaxed line-clamp-2">{s.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reviewer Configuration */}
          <div className="border-t border-border-subtle pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block mb-2">
              2. Reviewer AI (Opsional)
            </span>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 max-w-md">
                    <Input
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      placeholder="e.g. judge-router atau provider/model"
                    />
                  </div>
                  {reviewer ? (
                    <button
                      type="button"
                      onClick={() => setReviewer("")}
                      className="text-xs text-text-muted hover:text-text-main px-2 py-1"
                    >
                      Tanpa Reviewer
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span>Preset cepat:</span>
                  {REVIEWER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setReviewer(p.id)}
                      className={`px-2 py-0.5 rounded border transition-colors ${
                        reviewer === p.id
                          ? "border-brand-500 bg-brand-500/10 text-brand-400 font-medium"
                          : "border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-muted"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-right lg:border-l lg:border-border-subtle lg:pl-6 text-sm text-text-muted">
                <div className="text-text-main font-semibold text-base">{selectedModelIds.size} Model Terpilih</div>
                <div className="text-xs">Dari {activeProviders.length} provider aktif</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Active Job Live Progress Card ─── */}
      {active ? (
        <Card
          title="Status Benchmark Terkini"
          subtitle={`ID: ${active.id?.slice(0, 8) || "..."} · Dimulai: ${
            active.created_at ? new Date(active.created_at).toLocaleTimeString() : "-"
          }`}
          icon="monitoring"
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={() => refresh(active.id)}
                title="Refresh Status"
              >
                Refresh
              </Button>
              {isJobRunning ? (
                <Badge variant="warning" className="animate-pulse">
                  Sedang Berjalan
                </Badge>
              ) : active.status === "completed" ? (
                <Badge variant="success">Selesai</Badge>
              ) : active.status === "review_failed" ? (
                <Badge variant="warning">Selesai (Review Gagal)</Badge>
              ) : (
                <Badge variant="error">{active.status || "Gagal"}</Badge>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {/* Progress Bar & Phase Text */}
            <div>
              <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-text-main">
                  {isJobRunning ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  ) : null}
                  {active.progress?.phase ||
                    (active.progress?.currentModel
                      ? `Menguji ${active.progress.currentModel} · Suite ${active.progress.currentSuite?.toUpperCase()}`
                      : "Memproses pengujian...")}
                </span>
                <span className="font-semibold text-text-main">
                  {progressDone} / {progressTotal} model ({progressPct}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full transition-all duration-300 ${
                    active.status === "failed"
                      ? "bg-rose-500"
                      : isJobRunning
                      ? "bg-gradient-to-r from-brand-500 to-emerald-400"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {active.progress?.currentAccount ? (
                <div className="mt-1.5 text-xs text-text-muted flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">badge</span>
                  <span>Akun: {active.progress.currentAccount}</span>
                  {active.progress.retrying ? (
                    <span className="text-amber-400">· {active.progress.retrying} dalam antrean retry 429</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border-subtle text-center">
              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2">
                <div className="text-xs text-text-muted">Lolos</div>
                <div className="text-lg font-bold text-emerald-400">{counts.passed || 0}</div>
              </div>
              <div className="rounded-md bg-rose-500/5 border border-rose-500/20 p-2">
                <div className="text-xs text-text-muted">Gagal</div>
                <div className="text-lg font-bold text-rose-400">{counts.failed || 0}</div>
              </div>
              <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2">
                <div className="text-xs text-text-muted">Rate Limit (429)</div>
                <div className="text-lg font-bold text-amber-400">{counts.rate_limited || 0}</div>
              </div>
              <div className="rounded-md bg-slate-500/5 border border-slate-500/20 p-2">
                <div className="text-xs text-text-muted">Dilewati</div>
                <div className="text-lg font-bold text-slate-400">{counts.skipped || 0}</div>
              </div>
            </div>

            {/* Reviewer Output */}
            {report ? (
              <div className="mt-4 rounded-lg border border-border-subtle bg-surface-2 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <span className="material-symbols-outlined text-base">psychology</span>
                  <span>Kesimpulan Reviewer ({report.reviewer})</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-main font-sans">
                  {report.report}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* ─── Main Two-Column Work Area ─── */}
      <div className="grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* Left Column: Provider & Model Selection Accordion */}
        <Card
          title="Pilih Provider & Model"
          subtitle={`${selectedModelIds.size} model dari ${activeProviders.length} provider`}
          icon="dns"
          action={
            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost" onClick={selectAllVisibleModels}>
                Semua
              </Button>
              <Button size="xs" variant="ghost" onClick={clearAllModels}>
                Kosongkan
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Input
              placeholder="Cari provider atau model..."
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
            />

            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {filteredCatalog.map((provider) => {
                const totalInProv = provider.models.length;
                const selectedInProv = provider.models.filter((m) => selectedModelIds.has(m.fullId)).length;
                const isAllSelected = totalInProv > 0 && selectedInProv === totalInProv;
                const isPartiallySelected = selectedInProv > 0 && selectedInProv < totalInProv;
                const isExpanded = expandedProviders.has(provider.id);

                return (
                  <div
                    key={provider.id}
                    className={`rounded-lg border transition-all ${
                      selectedInProv > 0
                        ? "border-brand-500/30 bg-surface-2"
                        : "border-border-subtle bg-surface-1 hover:border-border"
                    }`}
                  >
                    {/* Provider Row */}
                    <div className="flex items-center justify-between p-2.5 gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isPartiallySelected;
                          }}
                          onChange={() => toggleProviderModels(provider)}
                          className="rounded border-border text-brand-500 focus:ring-brand-500"
                        />
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-semibold text-sm text-text-main truncate block">
                            {provider.name}
                          </span>
                          <span className="text-xs text-text-muted font-mono">{provider.alias}</span>
                        </div>
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            selectedInProv > 0
                              ? "bg-brand-500/20 text-brand-400 font-semibold"
                              : "bg-surface-3 text-text-muted"
                          }`}
                        >
                          {selectedInProv}/{totalInProv}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpandProvider(provider.id)}
                          className="p-1 rounded text-text-muted hover:text-text-main hover:bg-surface-3 transition-colors"
                          title={isExpanded ? "Tutup list model" : "Buka list model"}
                        >
                          <span className="material-symbols-outlined text-lg leading-none">
                            {isExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Model Sub-list (Accordion Content) */}
                    {isExpanded ? (
                      <div className="border-t border-border-subtle bg-surface-1/50 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between pb-1 border-b border-border-subtle text-[11px] text-text-muted">
                          <span>Daftar Model ({provider.name}):</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModelIds((prev) => {
                                  const next = new Set(prev);
                                  provider.models.forEach((m) => next.add(m.fullId));
                                  return next;
                                });
                              }}
                              className="hover:text-brand-400 underline"
                            >
                              Pilih semua
                            </button>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModelIds((prev) => {
                                  const next = new Set(prev);
                                  provider.models.forEach((m) => next.delete(m.fullId));
                                  return next;
                                });
                              }}
                              className="hover:text-rose-400 underline"
                            >
                              Batal
                            </button>
                          </div>
                        </div>

                        {provider.models.map((model) => {
                          const isModelChecked = selectedModelIds.has(model.fullId);
                          return (
                            <label
                              key={model.fullId}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                                isModelChecked
                                  ? "bg-brand-500/10 text-text-main"
                                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isModelChecked}
                                  onChange={() => toggleModel(model.fullId)}
                                  className="rounded border-border text-brand-500 focus:ring-brand-500"
                                />
                                <div className="truncate">
                                  <div className="font-medium truncate">{model.name}</div>
                                  <div className="font-mono text-[10px] text-text-muted opacity-80 truncate">
                                    {model.fullId}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {filteredCatalog.length === 0 ? (
                <div className="py-6 text-center text-sm text-text-muted">
                  Tidak ada provider atau model yang sesuai pencarian.
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Right Column: Live Test Results Table */}
        <Card
          title="Hasil Pengujian Terkini"
          subtitle="Satu baris per model, suite pengujian, dan status"
          icon="table_chart"
          action={
            <div className="text-xs text-text-muted">
              {attempts.length} data percobaan tercatat
            </div>
          }
        >
          <div className="overflow-x-auto max-h-[620px]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-1 z-10 text-xs text-text-muted border-b border-border-subtle">
                <tr>
                  <th className="py-2.5 px-3">Akun</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-2">Suite</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">Skor Kualitas</th>
                  <th className="py-2.5 px-2 text-right">TTFT</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">tok/s</th>
                  <th className="py-2.5 px-2 text-center">Format</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-xs">
                {attempts.map((row) => {
                  const cfg = STATUS_CONFIG[row.status] || {
                    label: row.status,
                    color: "bg-surface-3 text-text-muted",
                  };
                  return (
                    <tr
                      key={`${row.account_name}-${row.model}-${row.suite}-${row.status}-${row.format}`}
                      className="hover:bg-surface-2 transition-colors"
                    >
                      <td className="py-2 px-3 font-mono text-[11px] max-w-[120px] truncate" title={row.account_name}>
                        {row.account_name || "-"}
                      </td>
                      <td className="py-2 px-3 font-medium max-w-[160px] truncate" title={row.model}>
                        {row.model}
                      </td>
                      <td className="py-2 px-2 uppercase font-semibold text-[10px] tracking-wider text-text-muted">
                        {row.suite}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">
                        {row.median_score !== null && row.median_score !== undefined ? (
                          <span
                            className={
                              row.median_score >= 80
                                ? "text-emerald-400"
                                : row.median_score >= 50
                                ? "text-amber-400"
                                : "text-rose-400"
                            }
                          >
                            {row.median_score}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {row.median_ttft ? `${row.median_ttft}ms` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {row.median_ms ? `${row.median_ms}ms` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-medium">
                        {row.median_tps ? `${row.median_tps}` : "-"}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-[10px] text-text-muted uppercase">
                        {row.format || "-"}
                      </td>
                    </tr>
                  );
                })}

                {attempts.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-text-muted">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-3xl opacity-40">
                          {isJobRunning ? "hourglass_top" : "science"}
                        </span>
                        <span>
                          {isJobRunning
                            ? "Menjalankan benchmark... hasil percobaan akan muncul secara langsung."
                            : "Belum ada hasil pengujian aktif. Pilih model dan klik Jalankan Benchmark."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ─── Bottom Section 1: Daily Median Summary ─── */}
      <Card
        title="Ringkasan Harian (Median Kualitas & Kecepatan)"
        subtitle="Agregasi nilai tengah hasil pengujian hari ini (00:00 - sekarang)"
        icon="leaderboard"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-text-muted border-b border-border-subtle">
              <tr>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3">PONG Gate (Passed/Total)</th>
                <th className="py-2.5 px-3 text-right">Median Kualitas</th>
                <th className="py-2.5 px-3 text-right">Median TTFT (Byte Pertama)</th>
                <th className="py-2.5 px-3 text-right">Median Total Latensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-xs">
              {daily.map((row) => (
                <tr key={`${row.provider}-${row.model}`} className="hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3 font-medium text-text-main">{row.model}</td>
                  <td className="py-2 px-3">
                    {row.pong_total ? (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <span className={row.pong_passed === row.pong_total ? "text-emerald-400" : "text-amber-400"}>
                          {row.pong_passed}/{row.pong_total}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          ({Math.round((row.pong_passed / row.pong_total) * 100)}%)
                        </span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    {row.median_score !== null && row.median_score !== undefined ? (
                      <span
                        className={
                          row.median_score >= 80
                            ? "text-emerald-400"
                            : row.median_score >= 50
                            ? "text-amber-400"
                            : "text-rose-400"
                        }
                      >
                        {row.median_score}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-text-muted">
                    {row.median_ttft ? `${row.median_ttft}ms` : "-"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-text-muted">
                    {row.median_ms ? `${row.median_ms}ms` : "-"}
                  </td>
                </tr>
              ))}
              {daily.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-text-muted">
                    Belum ada riwayat data benchmark hari ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Bottom Section 2: Benchmark History & Retention ─── */}
      <Card
        title="Riwayat Benchmark & Evaluasi AI"
        subtitle="Simpan request/response historis untuk evaluasi komparatif atau permintaan saran"
        icon="history"
        action={
          <Button
            size="sm"
            icon="psychology"
            variant="secondary"
            loading={advising}
            disabled={selectedHistoryJobs.length === 0 || !reviewer}
            onClick={handleAskAdvice}
          >
            Minta Saran AI ({selectedHistoryJobs.length} Riwayat)
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Retention Setting Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border-subtle bg-surface-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-text-muted">auto_delete</span>
              <span>Retensi Riwayat: Hapus otomatis riwayat setelah</span>
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                className="w-16 rounded border border-border bg-surface-1 px-2 py-1 text-center font-mono text-xs focus:ring-brand-500"
              />
              <span>hari.</span>
            </div>
            <Button size="xs" variant="secondary" onClick={handleSaveRetention}>
              Simpan Retensi
            </Button>
          </div>

          {/* History List */}
          <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg overflow-hidden">
            {jobs.map((job) => {
              const isSelected = selectedHistoryJobs.includes(job.id);
              const isCurrent = active?.id === job.id;
              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-3 p-3 text-xs transition-colors ${
                    isCurrent ? "bg-brand-500/10" : "hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      setSelectedHistoryJobs((prev) =>
                        prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id]
                      );
                    }}
                    aria-label="Pilih riwayat untuk evaluasi saran"
                    className="rounded border-border text-brand-500 focus:ring-brand-500"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      activeIdRef.current = job.id;
                      refresh(job.id);
                    }}
                    className="flex flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="font-semibold text-text-main flex items-center gap-2">
                        <span>{new Date(job.created_at).toLocaleString()}</span>
                        {isCurrent ? (
                          <span className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-bold text-[10px]">
                            SEDANG DILIHAT
                          </span>
                        ) : null}
                      </div>
                      <div className="text-text-muted mt-0.5">
                        {(job.providers || []).length} Provider · Suites: {(job.suites || []).join(", ")}
                        {job.reviewer ? ` · Reviewer: ${job.reviewer}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                          job.status === "completed"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : job.status === "running"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-400 animate-pulse"
                            : "border-border bg-surface-3 text-text-muted"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}

            {jobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                Belum ada riwayat tugas benchmark yang tersimpan.
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
