"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Combobox, Input } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

const SUITES = [
  { id: "pong", label: "PONG Gate", subtitle: "Liveness test (Wajib lulus PONG untuk membuka suite pengujian)", icon: "bolt" },
  { id: "coding", label: "Coding Benchmark", subtitle: "TokenBucketRateLimiter Python (Thread-safe Lock)", icon: "code" },
  { id: "logic", label: "Logic Deduction", subtitle: "Teka-teki deduksi 4 profesi & mobil", icon: "psychology" },
  { id: "tool", label: "Tool Calling", subtitle: "Native function calling (Panggilan cuaca Jakarta)", icon: "build" },
];

const STATUS_CONFIG = {
  passed: { label: "Lolos", color: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/30" },
  failed: { label: "Gagal", color: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/30" },
  rate_limited: { label: "Rate Limit (429)", color: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30" },
  skipped: { label: "Dilewati", color: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/30" },
  cancelled: { label: "Dibatalkan", color: "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/30" },
};

const REVIEWER_PRESETS = [
  { id: "judge-router", label: "judge-router" },
  { id: "ag/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4.1 Flash" },
  { id: "kcf/deepseek-v3", label: "Kilo DeepSeek V3" },
];

export default function BenchmarkPage() {
  // 1. Build catalog of providers with LLM models
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
            providerName: provider.name || provider.id,
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

  // State: Permanent active selection for benchmark execution
  const [selectedModelIds, setSelectedModelIds] = useState(() => {
    const initial = new Set();
    catalog.forEach((p) => {
      if (p.id === "antigravity" || p.id === "kilocode-free") {
        p.models.forEach((m) => initial.add(m.fullId));
      }
    });
    return initial;
  });

  // State: Modal Staging (buffer selection before user clicks OKE)
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [modalSelectedModelIds, setModalSelectedModelIds] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerExpandedProviders, setPickerExpandedProviders] = useState(() => new Set(["antigravity", "kilocode-free"]));

  // State: Reviewer Model Selector Modal
  const [isReviewerModalOpen, setIsReviewerModalOpen] = useState(false);
  const [reviewerPickerSearch, setReviewerPickerSearch] = useState("");
  const [expandedSelectedProviders, setExpandedSelectedProviders] = useState(() => new Set());
  const [suites, setSuites] = useState(["pong", "coding", "logic", "tool"]);
  const [reviewer, setReviewer] = useState("judge-router");

  // Reviewer options for Combobox & Modal
  const reviewerModelOptions = useMemo(() => {
    const list = [
      {
        value: "judge-router",
        label: "judge-router",
        subtitle: "Internal automated router judge",
        badge: "Default",
      },
    ];
    catalog.forEach((p) => {
      p.models.forEach((m) => {
        list.push({
          value: m.fullId,
          label: `${m.name} (${m.fullId})`,
          subtitle: p.name,
          badge: p.alias,
        });
      });
    });
    return list;
  }, [catalog]);

  // State: Table filters & sorting
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTableQuery, setSearchTableQuery] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("asc");

  // State: Detailed Inspector modal
  const [inspectAttempt, setInspectAttempt] = useState(null);

  // State: Job & Runtime Data
  const [jobs, setJobs] = useState([]);
  const [daily, setDaily] = useState([]);
  const [selectedHistoryJobs, setSelectedHistoryJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [savedRetentionToast, setSavedRetentionToast] = useState(false);

  const activeIdRef = useRef(null);
  activeIdRef.current = active?.id;

  // Active providers derived from selected models
  const activeProviders = useMemo(() => {
    const provs = new Set();
    catalog.forEach((p) => {
      if (p.models.some((m) => selectedModelIds.has(m.fullId))) {
        provs.add(p.id);
      }
    });
    return Array.from(provs);
  }, [catalog, selectedModelIds]);

  // Models grouped by Provider for displaying as tags on main page
  const selectedGroupedByProvider = useMemo(() => {
    const list = [];
    catalog.forEach((provider) => {
      const picked = provider.models.filter((m) => selectedModelIds.has(m.fullId));
      if (picked.length > 0) {
        list.push({
          provider,
          models: picked,
        });
      }
    });
    return list;
  }, [catalog, selectedModelIds]);

  // Filtered catalog for picker modal
  const pickerCatalog = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
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
  }, [catalog, pickerSearch]);

  // Refresh data from server
  // Refresh data from server with automatic background job adoption
  async function refresh(targetId = null) {
    let idToFetch = targetId !== null ? targetId : activeIdRef.current;
    try {
      const listRes = await fetch("/api/benchmark", { cache: "no-store" });
      if (listRes.ok) {
        const listData = await listRes.json();
        const serverJobs = listData.jobs || [];
        setJobs(serverJobs);
        setDaily(listData.daily || []);

        // Auto-adopt any currently running or queued job so page refresh preserves progress
        if (!idToFetch || idToFetch === "pending" || !activeIdRef.current) {
          const ongoing = serverJobs.find((j) => j.status === "running" || j.status === "queued");
          if (ongoing) {
            idToFetch = ongoing.id;
            activeIdRef.current = ongoing.id;
          }
        }
      }

      if (idToFetch && idToFetch !== "pending") {
        const jobRes = await fetch(`/api/benchmark?id=${idToFetch}`, { cache: "no-store" });
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setActive(jobData);
        }
      }
    } catch (err) {
      console.warn("[benchmark] refresh error:", err.message);
    }
  }

  // Check if any job is running in background
  const isAnyJobRunning = useMemo(() => {
    return (
      starting ||
      active?.status === "running" ||
      active?.status === "queued" ||
      active?.status === "starting" ||
      jobs.some((j) => j.status === "running" || j.status === "queued")
    );
  }, [starting, active?.status, jobs]);

  // Polling with fast tick (1s) when active job is running
  useEffect(() => {
    refresh();
    const intervalMs = isAnyJobRunning ? 1000 : 4000;
    const timer = setInterval(() => {
      refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isAnyJobRunning]);

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

  function toggleSuite(suiteId) {
    setSuites((prev) => (prev.includes(suiteId) ? prev.filter((s) => s !== suiteId) : [...prev, suiteId]));
  }

  // Direct tag removal on main screen
  function removeSingleModelTag(fullId) {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      next.delete(fullId);
      return next;
    });
  }

  function removeWholeProvider(providerId) {
    const p = catalog.find((item) => item.id === providerId);
    if (!p) return;
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      p.models.forEach((m) => next.delete(m.fullId));
      return next;
    });
  }
  function toggleSelectedProviderExpand(providerId) {
    setExpandedSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }


  // Modal Open Handler: sync current selection to staging buffer
  function openPickerModal() {
    setModalSelectedModelIds(new Set(selectedModelIds));
    setPickerSearch("");
    setIsPickerModalOpen(true);
  }

  // Modal Apply Handler: commit staging buffer when pressing OKE
  function applyPickerModal() {
    setSelectedModelIds(new Set(modalSelectedModelIds));
    setIsPickerModalOpen(false);
  }

  // Modal toggle model in staging buffer
  function toggleModalModel(fullId) {
    setModalSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(fullId)) next.delete(fullId);
      else next.add(fullId);
      return next;
    });
  }

  // Modal toggle all models of a provider in staging buffer
  function toggleModalProviderModels(provider) {
    const allSelected = provider.models.every((m) => modalSelectedModelIds.has(m.fullId));
    setModalSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        provider.models.forEach((m) => next.delete(m.fullId));
      } else {
        provider.models.forEach((m) => next.add(m.fullId));
      }
      return next;
    });
  }

  function togglePickerExpand(providerId) {
    setPickerExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  // Start benchmark execution
  async function handleStartBenchmark() {
    if (selectedModelIds.size === 0 || suites.length === 0) return;
    setError("");
    setStarting(true);

    const modelsList = Array.from(selectedModelIds);

    // Instant optimistic status display
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

  // Cancel running benchmark
  async function handleCancelBenchmark() {
    if (!active?.id || active.id === "pending") return;
    setCancelling(true);
    try {
      await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id: active.id }),
      });
      await refresh(active.id);
    } catch (err) {
      setError(err.message || "Gagal membatalkan benchmark");
    } finally {
      setCancelling(false);
    }
  }

  // Delete historical job
  async function handleDeleteJob(id, e) {
    e.stopPropagation();
    if (!confirm("Hapus riwayat benchmark ini beserta semua detail percobaannya?")) return;
    try {
      await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (active?.id === id) {
        setActive(null);
        activeIdRef.current = null;
      }
      await refresh();
    } catch (err) {
      setError(err.message || "Gagal menghapus riwayat");
    }
  }

  // Ask AI advice
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
    setSavedRetentionToast(true);
    setTimeout(() => setSavedRetentionToast(false), 2500);
  }

  // Active attempts & metrics
  const rawAttempts = active?.attempts || [];
  const counts = rawAttempts.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + Number(row.n || 1);
      return acc;
    },
    { passed: 0, failed: 0, rate_limited: 0, skipped: 0, cancelled: 0 }
  );

  // Filter and sort attempts for table
  const displayedAttempts = useMemo(() => {
    return rawAttempts
      .filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (searchTableQuery) {
          const q = searchTableQuery.toLowerCase();
          return (
            row.model?.toLowerCase().includes(q) ||
            row.account_name?.toLowerCase().includes(q) ||
            row.provider?.toLowerCase().includes(q) ||
            row.suite?.toLowerCase().includes(q) ||
            String(row.http_status || "").includes(q) ||
            String(row.error || "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "score") {
          valA = a.score ?? -1;
          valB = b.score ?? -1;
        } else if (sortField === "ttft") {
          valA = a.ttft_ms ?? 999999;
          valB = b.ttft_ms ?? 999999;
        } else if (sortField === "total") {
          valA = a.total_ms ?? 999999;
          valB = b.total_ms ?? 999999;
        } else if (sortField === "tps") {
          valA = a.tps ?? 0;
          valB = b.tps ?? 0;
        } else if (sortField === "status") {
          valA = a.http_status ?? 0;
          valB = b.http_status ?? 0;
        }
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [rawAttempts, statusFilter, searchTableQuery, sortField, sortOrder]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "score" || field === "tps" ? "desc" : "asc");
    }
  }

  const report = active?.reports?.[0];
  const isJobRunning = isAnyJobRunning;

  const progressTotal = active?.progress?.total || selectedModelIds.size || 1;
  const progressDone = active?.progress?.done || 0;
  const progressPct = Math.min(100, Math.round((progressDone / Math.max(progressTotal, 1)) * 100));

  const totalEstimatedCalls = useMemo(() => {
    const suitesCount = suites.includes("pong") ? suites.length + 1 : suites.length;
    return selectedModelIds.size * Math.max(1, suitesCount);
  }, [selectedModelIds.size, suites]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* ─── Page Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl text-brand-500">speed</span>
            <h1 className="text-2xl font-bold tracking-tight text-text-main">AI Model Benchmark</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Uji performa, latensi, liveness, dan kapabilitas model secara mandiri di server gateway 9router-X.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="md"
            variant="primary"
            icon="play_arrow"
            loading={starting || (isJobRunning && active?.id === "pending")}
            disabled={selectedModelIds.size === 0 || suites.length === 0 || isJobRunning}
            onClick={handleStartBenchmark}
            className="shadow-sm"
          >
            {isJobRunning ? "Benchmark Sedang Berjalan..." : `Jalankan Benchmark (${selectedModelIds.size} Model)`}
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

      {/* ─── 1. Suites & Reviewer Card ─── */}
      <Card
        title="1. Konfigurasi Pengujian & Reviewer"
        subtitle="Atur suite pengujian dan reviewer AI untuk merangkum hasil evaluasi"
        icon="tune"
      >
        <div className="space-y-5">
          {/* Suite Selection */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block mb-2">
              Pilih Test Suites
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SUITES.map((s) => {
                const checked = suites.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSuite(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") toggleSuite(s.id);
                    }}
                    className={`relative flex items-start gap-3 rounded-lg border p-3 text-left cursor-pointer transition-all ${
                      checked
                        ? "border-brand-500/50 bg-brand-500/5 shadow-sm"
                        : "border-border-subtle bg-surface hover:border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSuite(s.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Pilih ${s.label}`}
                      className="mt-1 rounded border-border text-brand-500 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium text-sm text-text-main">
                        <span className="material-symbols-outlined text-base text-brand-400">{s.icon}</span>
                        <span>{s.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted leading-relaxed line-clamp-2">{s.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviewer Configuration */}
          <div className="border-t border-border-subtle pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted block mb-2">
              Reviewer AI Model (Opsional)
            </span>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[260px] max-w-md">
                    <Combobox
                      id="reviewer-model-picker"
                      value={reviewer}
                      onChange={(val) => setReviewer(val)}
                      options={reviewerModelOptions}
                      placeholder="Pilih model reviewer atau ketik custom..."
                      allowCustom
                      clearable
                      icon="psychology"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="format_list_bulleted"
                    onClick={() => setIsReviewerModalOpen(true)}
                    title="Pilih model reviewer dari modal lengkap"
                  >
                    Pilih Model
                  </Button>
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
                <div className="text-xs">
                  Estimasi ~{totalEstimatedCalls} panggilan ke {activeProviders.length} provider
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 2. Selected Models Display: Grouped by Provider -> Tags Model ─── */}
      <Card
        title="2. Target Model yang Diuji"
        subtitle={`${selectedModelIds.size} model dari ${selectedGroupedByProvider.length} provider terpilih. Buka dropdown provider untuk melihat atau mengelola model spesifik.`}
        icon="checklist"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selectedGroupedByProvider.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                icon={expandedSelectedProviders.size === selectedGroupedByProvider.length ? "unfold_less" : "unfold_more"}
                onClick={() => {
                  if (expandedSelectedProviders.size === selectedGroupedByProvider.length) {
                    setExpandedSelectedProviders(new Set());
                  } else {
                    setExpandedSelectedProviders(new Set(selectedGroupedByProvider.map((item) => item.provider.id)));
                  }
                }}
              >
                {expandedSelectedProviders.size === selectedGroupedByProvider.length ? "Tutup Semua" : "Buka Semua"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              icon="tune"
              onClick={openPickerModal}
              className="shadow-xs"
            >
              Pilih Provider & Model ({selectedModelIds.size})
            </Button>
            {selectedModelIds.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSelectedModelIds(new Set())}>
                Kosongkan
              </Button>
            ) : null}
          </div>
        }
      >
        {selectedGroupedByProvider.length > 0 ? (
          <div className="space-y-2.5">
            {selectedGroupedByProvider.map(({ provider, models }) => {
              const isExpanded = expandedSelectedProviders.has(provider.id);
              return (
                <div
                  key={provider.id}
                  className="rounded-xl border border-border-subtle bg-surface-2 transition-all hover:border-border overflow-hidden"
                >
                  {/* Clickable Header Dropdown Bar */}
                  <div
                    className="flex items-center justify-between gap-3 p-3 cursor-pointer select-none bg-surface-2 hover:bg-surface-3/60 transition-colors"
                    onClick={() => toggleSelectedProviderExpand(provider.id)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="material-symbols-outlined text-lg text-text-muted transition-transform duration-200"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        expand_more
                      </span>
                      <span className="font-bold text-sm text-text-main truncate">{provider.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-3 text-brand-500 uppercase tracking-wider">
                        {provider.alias}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-500/10 text-brand-500">
                        {models.length} model
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-brand-500 font-medium hidden sm:inline">
                        {isExpanded ? "Tutup detail" : "Lihat detail model"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWholeProvider(provider.id);
                        }}
                        className="text-xs text-text-muted hover:text-rose-400 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-rose-500/10"
                        title={`Hapus semua model dari ${provider.name}`}
                      >
                        <span className="material-symbols-outlined text-sm leading-none">delete</span>
                        <span className="hidden sm:inline">Hapus</span>
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Content with Model Tags */}
                  {isExpanded ? (
                    <div className="p-3.5 pt-2 border-t border-border-subtle bg-surface">
                      <div className="flex flex-wrap gap-2">
                        {models.map((m) => (
                          <span
                            key={m.fullId}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/25 bg-surface-2 px-2.5 py-1 text-xs text-text-main font-medium shadow-2xs group"
                          >
                            <span className="text-text-main font-medium">{m.name}</span>
                            <span className="text-[10px] text-text-muted font-mono opacity-80">
                              ({m.id})
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSingleModelTag(m.fullId)}
                              className="text-text-muted hover:text-rose-400 transition-colors p-0.5 rounded-full hover:bg-surface-3 leading-none"
                              title={`Hapus model ${m.name}`}
                            >
                              <span className="material-symbols-outlined text-sm leading-none">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-text-muted">
            <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
              <span className="material-symbols-outlined text-4xl opacity-30 text-brand-400">add_chart</span>
              <span className="font-semibold text-text-main text-base">Belum Ada Model yang Dipilih</span>
              <p className="text-xs text-text-muted leading-relaxed">
                Klik tombol di bawah untuk membuka modal pemilihan provider dan centang model yang ingin Anda uji performanya.
              </p>
              <Button
                size="md"
                variant="primary"
                icon="tune"
                onClick={openPickerModal}
                className="mt-2 shadow-sm"
              >
                Buka Pemilih Provider & Model
              </Button>
            </div>
          </div>
        )}
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
              {isJobRunning && active.id !== "pending" ? (
                <Button
                  size="sm"
                  variant="danger"
                  icon="cancel"
                  loading={cancelling}
                  onClick={handleCancelBenchmark}
                >
                  Batalkan Pengujian
                </Button>
              ) : null}
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
              ) : active.status === "cancelled" ? (
                <Badge variant="warning">Dibatalkan</Badge>
              ) : active.status === "review_failed" ? (
                <Badge variant="warning">Selesai (Reviewer Gagal)</Badge>
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
                      : active.status === "cancelled"
                      ? "bg-orange-500"
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
                    <span className="text-amber-400 font-medium">
                      · {active.progress.retrying} dalam antrean retry 429
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border-subtle text-center">
              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2">
                <div className="text-xs text-text-muted">Lolos</div>
                <div className="text-lg font-bold text-emerald-500 dark:text-emerald-400">{counts.passed || 0}</div>
              </div>
              <div className="rounded-md bg-rose-500/5 border border-rose-500/20 p-2">
                <div className="text-xs text-text-muted">Gagal</div>
                <div className="text-lg font-bold text-rose-500 dark:text-rose-400">{counts.failed || 0}</div>
              </div>
              <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2">
                <div className="text-xs text-text-muted">Rate Limit (429)</div>
                <div className="text-lg font-bold text-amber-500 dark:text-amber-400">{counts.rate_limited || 0}</div>
              </div>
              <div className="rounded-md bg-slate-500/5 border border-slate-500/20 p-2">
                <div className="text-xs text-text-muted">Dilewati</div>
                <div className="text-lg font-bold text-slate-500 dark:text-slate-400">{counts.skipped || 0}</div>
              </div>
            </div>

            {/* Reviewer Output */}
            {report ? (
              <div className="mt-4 rounded-lg border border-border-subtle bg-surface-2 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-brand-500">
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

      {/* ─── 3. Live Test Results Table with Inline Statuscode, Response & Inspector ─── */}
      <Card
        title="3. Hasil Pengujian Terkini"
        subtitle="Menampilkan HTTP statuscode & respon per percobaan. Klik baris mana saja untuk melihat detail lengkap."
        icon="table_chart"
        action={
          <div className="text-xs text-text-muted">
            {displayedAttempts.length} dari {rawAttempts.length} data ditampilkan
          </div>
        }
      >
        <div className="space-y-3">
          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-text-muted mr-1 font-medium">Filter:</span>
              {[
                { id: "all", label: "Semua" },
                { id: "passed", label: "Lolos" },
                { id: "failed", label: "Gagal" },
                { id: "rate_limited", label: "429 Rate Limit" },
                { id: "skipped", label: "Dilewati" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    statusFilter === f.id
                      ? "bg-brand-500 text-white shadow-xs"
                      : "bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-main"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="w-48">
              <input
                type="text"
                placeholder="Cari di tabel..."
                value={searchTableQuery}
                onChange={(e) => setSearchTableQuery(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-main focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface z-10 text-xs text-text-muted border-b border-border-subtle select-none">
                <tr>
                  <th className="py-2.5 px-3">Akun</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("model")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Model</span>
                      {sortField === "model" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th className="py-2.5 px-2">Suite</th>
                  <th
                    className="py-2.5 px-2 cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status / Code</span>
                      {sortField === "status" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 max-w-[220px]">Pesan Respon / Error</th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("score")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Kualitas</span>
                      {sortField === "score" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("ttft")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>TTFT</span>
                      {sortField === "ttft" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("total")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total</span>
                      {sortField === "total" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                    onClick={() => handleSort("tps")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>tok/s</span>
                      {sortField === "tps" ? (
                        <span className="material-symbols-outlined text-xs">
                          {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                  <th className="py-2.5 px-2 text-center">Format</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-xs">
                {displayedAttempts.map((row) => {
                  const cfg = STATUS_CONFIG[row.status] || {
                    label: row.status,
                    color: "bg-surface-3 text-text-muted",
                  };
                  const isFailedOrLimited = row.status === "failed" || row.status === "rate_limited";
                  const displayMessage = row.error || row.excerpt || row.response_body || "-";

                  return (
                    <tr
                      key={`${row.id || row.account_name}-${row.model}-${row.suite}-${row.status}-${row.rep}`}
                      onClick={() => setInspectAttempt(row)}
                      className="hover:bg-surface-2 transition-colors cursor-pointer group"
                    >
                      <td className="py-2 px-3 font-mono text-[11px] max-w-[100px] truncate" title={row.account_name}>
                        {row.account_name || "-"}
                      </td>
                      <td className="py-2 px-3 font-medium max-w-[140px] truncate" title={row.model}>
                        {row.model}
                      </td>
                      <td className="py-2 px-2 uppercase font-semibold text-[10px] tracking-wider text-text-muted">
                        {row.suite}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          {row.http_status ? (
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                row.http_status === 200
                                  ? "text-emerald-500 dark:text-emerald-400"
                                  : row.http_status === 429
                                  ? "text-amber-500 dark:text-amber-400"
                                  : "text-rose-500 dark:text-rose-400"
                              }`}
                            >
                              {row.http_status}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`py-2 px-3 max-w-[240px] truncate font-mono text-[11px] ${
                          isFailedOrLimited ? "text-rose-500 dark:text-rose-400 font-medium" : "text-text-muted"
                        }`}
                        title={displayMessage}
                      >
                        {displayMessage}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">
                        {row.score !== null && row.score !== undefined ? (
                          <span
                            className={
                              row.score >= 80
                                ? "text-emerald-500 dark:text-emerald-400"
                                : row.score >= 50
                                ? "text-amber-500 dark:text-amber-400"
                                : "text-rose-500 dark:text-rose-400"
                            }
                          >
                            {row.score}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-text-muted">
                        {row.ttft_ms ? `${row.ttft_ms}ms` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-text-muted">
                        {row.total_ms ? `${row.total_ms}ms` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-medium">
                        {row.tps ? `${row.tps}` : "-"}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-[10px] text-text-muted uppercase">
                        {row.format || "-"}
                      </td>
                    </tr>
                  );
                })}

                {displayedAttempts.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-text-muted">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-3xl opacity-40">
                          {isJobRunning ? "hourglass_top" : "science"}
                        </span>
                        <span>
                          {isJobRunning
                            ? "Menjalankan benchmark... data percobaan akan muncul secara langsung."
                            : rawAttempts.length > 0
                            ? "Tidak ada baris yang sesuai dengan filter atau pencarian."
                            : "Belum ada data hasil pengujian aktif. Pilih model dan klik Jalankan Benchmark."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

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
                        <span className={row.pong_passed === row.pong_total ? "text-emerald-500 dark:text-emerald-400 font-semibold" : "text-amber-500 dark:text-amber-400"}>
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
                            ? "text-emerald-500 dark:text-emerald-400"
                            : row.median_score >= 50
                            ? "text-amber-500 dark:text-amber-400"
                            : "text-rose-500 dark:text-rose-400"
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
                className="w-16 rounded border border-border bg-surface px-2 py-1 text-center font-mono text-xs focus:ring-brand-500"
              />
              <span>hari.</span>
            </div>
            <div className="flex items-center gap-2">
              {savedRetentionToast ? (
                <span className="text-emerald-500 dark:text-emerald-400 font-medium animate-fade-in">Tersimpan!</span>
              ) : null}
              <Button size="xs" variant="secondary" onClick={handleSaveRetention}>
                Simpan Retensi
              </Button>
            </div>
          </div>

          {/* History List */}
          <div className="divide-y divide-border-subtle border border-border-subtle rounded-lg overflow-hidden">
            {jobs.map((job) => {
              const isSelected = selectedHistoryJobs.includes(job.id);
              const isCurrent = active?.id === job.id;
              return (
                <div
                  key={job.id}
                  className={`flex items-center justify-between gap-3 p-3 text-xs transition-colors ${
                    isCurrent ? "bg-brand-500/10" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
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
                      className="flex flex-1 items-center justify-between gap-3 text-left min-w-0"
                    >
                      <div className="truncate">
                        <div className="font-semibold text-text-main flex items-center gap-2 truncate">
                          <span>{new Date(job.created_at).toLocaleString()}</span>
                          {isCurrent ? (
                            <span className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-500 font-bold text-[10px]">
                              SEDANG DILIHAT
                            </span>
                          ) : null}
                        </div>
                        <div className="text-text-muted mt-0.5 truncate">
                          {(job.providers || []).length} Provider · Suites: {(job.suites || []).join(", ")}
                          {job.reviewer ? ` · Reviewer: ${job.reviewer}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                            job.status === "completed"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                              : job.status === "running"
                              ? "border-amber-500/20 bg-amber-500/10 text-amber-500 dark:text-amber-400 animate-pulse"
                              : job.status === "cancelled"
                              ? "border-orange-500/20 bg-orange-500/10 text-orange-500 dark:text-orange-400"
                              : "border-border bg-surface-3 text-text-muted"
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteJob(job.id, e)}
                    className="p-1.5 text-text-muted hover:text-rose-400 hover:bg-surface-3 rounded transition-colors shrink-0"
                    title="Hapus riwayat ini"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
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

      {/* ─── Modal 1: Dedicated Provider & Model Selector Modal (100% Solid, Non-Transparent) ─── */}
      {isPickerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setIsPickerModalOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <div>
                <h3 className="font-bold text-text-main text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-500">dns</span>
                  <span>Pilih Provider & Model Benchmark</span>
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Centang model yang ingin Anda uji, lalu klik tombol Oke di bawah untuk menerapkan.
                </p>
              </div>
              <button
                onClick={() => setIsPickerModalOpen(false)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
              >
                <span className="material-symbols-outlined text-xl leading-none">close</span>
              </button>
            </div>

            {/* Modal Search & Quick Selection Bar */}
            <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-3 bg-white dark:bg-[#202020]">
              <div className="flex-1 max-w-sm">
                <Input
                  placeholder="Cari provider atau nama model..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setModalSelectedModelIds((prev) => {
                      const next = new Set(prev);
                      pickerCatalog.forEach((p) => p.models.forEach((m) => next.add(m.fullId)));
                      return next;
                    });
                  }}
                >
                  Pilih Semua
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setModalSelectedModelIds(new Set())}>
                  Kosongkan
                </Button>
              </div>
            </div>

            {/* Modal Accordion Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-[#faf7f2] dark:bg-[#1a1a1a]">
              {pickerCatalog.map((provider) => {
                const totalInProv = provider.models.length;
                const selectedInProv = provider.models.filter((m) => modalSelectedModelIds.has(m.fullId)).length;
                const isAllSelected = totalInProv > 0 && selectedInProv === totalInProv;
                const isPartiallySelected = selectedInProv > 0 && selectedInProv < totalInProv;
                const isExpanded = pickerExpandedProviders.has(provider.id);

                return (
                  <div
                    key={provider.id}
                    className={`rounded-xl border transition-all overflow-hidden bg-white dark:bg-[#242424] ${
                      selectedInProv > 0
                        ? "border-brand-500/50 shadow-xs"
                        : "border-border shadow-2xs hover:border-border"
                    }`}
                  >
                    {/* Provider Row */}
                    <div className="flex items-center justify-between p-3.5 gap-3 bg-white dark:bg-[#242424]">
                      <div
                        className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
                        onClick={() => toggleModalProviderModels(provider)}
                      >
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isPartiallySelected;
                          }}
                          onChange={() => toggleModalProviderModels(provider)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Pilih semua model dari ${provider.name}`}
                          className="w-4 h-4 rounded border-border text-brand-500 focus:ring-brand-500"
                        />
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-bold text-sm text-text-main truncate block">
                            {provider.name}
                          </span>
                          <span className="text-xs text-text-muted font-mono">{provider.alias}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            selectedInProv > 0
                              ? "bg-brand-500/20 text-brand-500 dark:text-brand-400"
                              : "bg-surface-3 text-text-muted"
                          }`}
                        >
                          {selectedInProv} / {totalInProv}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePickerExpand(provider.id)}
                          className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-3 transition-colors"
                          title={isExpanded ? "Tutup daftar model" : "Buka daftar model"}
                        >
                          <span className="material-symbols-outlined text-xl leading-none">
                            {isExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Model Sub-list (Expanded) */}
                    {isExpanded ? (
                      <div className="border-t border-border bg-[#fdfcf9] dark:bg-[#1e1e1e] p-3 space-y-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-border-subtle text-[11px] text-text-muted">
                          <span>Daftar Model ({provider.name}):</span>
                          <div className="flex gap-2 font-medium">
                            <button
                              type="button"
                              onClick={() => {
                                setModalSelectedModelIds((prev) => {
                                  const next = new Set(prev);
                                  provider.models.forEach((m) => next.add(m.fullId));
                                  return next;
                                });
                              }}
                              className="text-brand-500 hover:underline"
                            >
                              Pilih Semua
                            </button>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={() => {
                                setModalSelectedModelIds((prev) => {
                                  const next = new Set(prev);
                                  provider.models.forEach((m) => next.delete(m.fullId));
                                  return next;
                                });
                              }}
                              className="text-rose-500 hover:underline"
                            >
                              Batal
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {provider.models.map((model) => {
                            const isModelChecked = modalSelectedModelIds.has(model.fullId);
                            return (
                              <div
                                key={model.fullId}
                                onClick={() => toggleModalModel(model.fullId)}
                                className={`flex items-center justify-between gap-2.5 p-2.5 rounded-lg text-xs cursor-pointer transition-all border ${
                                  isModelChecked
                                    ? "border-brand-500/60 bg-brand-500/10 text-text-main font-semibold shadow-2xs"
                                    : "border-border bg-white dark:bg-[#282828] text-text-muted hover:bg-surface-2 hover:text-text-main"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isModelChecked}
                                    onChange={() => toggleModalModel(model.fullId)}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Pilih model ${model.name}`}
                                    className="w-4 h-4 rounded border-border text-brand-500 focus:ring-brand-500"
                                  />
                                  <div className="truncate">
                                    <div className="truncate text-text-main">{model.name}</div>
                                    <div className="font-mono text-[10px] text-text-muted opacity-80 truncate">
                                      {model.fullId}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {pickerCatalog.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-muted">
                  Tidak ada provider atau model yang sesuai dengan kata kunci pencarian.
                </div>
              ) : null}
            </div>

            {/* Modal Footer with prominent OKE button */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <span className="text-xs text-text-muted">
                Terpilih di modal: <span className="font-bold text-text-main text-sm">{modalSelectedModelIds.size}</span> model
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setIsPickerModalOpen(false)}>
                  Batal
                </Button>
                <Button size="sm" variant="primary" icon="check" onClick={applyPickerModal} className="shadow-sm font-semibold">
                  Oke, Terapkan Pilihan
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Modal 2: Detail Attempt Inspector Modal (100% Solid, Non-Transparent) ─── */}
      {inspectAttempt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setInspectAttempt(null)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <div>
                <div className="flex items-center gap-2.5 font-bold text-text-main text-base">
                  <span>{inspectAttempt.model}</span>
                  <Badge variant={inspectAttempt.status === "passed" ? "success" : "error"}>
                    {inspectAttempt.status?.toUpperCase()}
                  </Badge>
                  {inspectAttempt.http_status ? (
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                        inspectAttempt.http_status === 200
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                          : inspectAttempt.http_status === 429
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400"
                      }`}
                    >
                      HTTP {inspectAttempt.http_status}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Suite: <span className="font-semibold uppercase">{inspectAttempt.suite}</span> (Rep {inspectAttempt.rep || 1}) · Akun:{" "}
                  <span className="font-mono">{inspectAttempt.account_name || inspectAttempt.connection_id || "-"}</span>
                  {inspectAttempt.format ? ` · Format: ${inspectAttempt.format.toUpperCase()}` : ""}
                </div>
              </div>
              <button
                onClick={() => setInspectAttempt(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
              >
                <span className="material-symbols-outlined text-xl leading-none">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs font-mono bg-white dark:bg-[#202020]">
              {/* Telemetry Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
                  <div className="text-text-muted text-[10px]">Skor Kualitas</div>
                  <div className="text-sm font-bold text-text-main">{inspectAttempt.score ?? "-"} / 100</div>
                </div>
                <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
                  <div className="text-text-muted text-[10px]">TTFT (Byte Pertama)</div>
                  <div className="text-sm font-bold text-text-main">
                    {inspectAttempt.ttft_ms ? `${inspectAttempt.ttft_ms}ms` : "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
                  <div className="text-text-muted text-[10px]">Total Waktu</div>
                  <div className="text-sm font-bold text-text-main">
                    {inspectAttempt.total_ms ? `${inspectAttempt.total_ms}ms` : "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-[#faf7f2] dark:bg-[#282828] p-2.5">
                  <div className="text-text-muted text-[10px]">Throughput (tok/s)</div>
                  <div className="text-sm font-bold text-text-main">
                    {inspectAttempt.tps ?? "-"} tok/s
                  </div>
                </div>
              </div>

              {/* Error Box if any */}
              {inspectAttempt.error ? (
                <div>
                  <div className="text-rose-500 dark:text-rose-400 font-bold mb-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span>Pesan Error / Upstream Diagnostic:</span>
                  </div>
                  <pre className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-rose-600 dark:text-rose-300 whitespace-pre-wrap break-all text-[11px]">
                    {inspectAttempt.error}
                  </pre>
                </div>
              ) : null}

              {/* Request Payload */}
              <div>
                <div className="text-text-muted font-bold mb-1 flex items-center justify-between">
                  <span>Request Payload:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(inspectAttempt.request_body || "")}
                    className="text-brand-500 hover:underline text-[10px]"
                  >
                    Salin Request
                  </button>
                </div>
                <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-3 text-text-main whitespace-pre-wrap break-all text-[11px] max-h-48 overflow-y-auto">
                  {inspectAttempt.request_body || "Tidak ada body request tersimpan."}
                </pre>
              </div>

              {/* Response Body */}
              <div>
                <div className="text-text-muted font-bold mb-1 flex items-center justify-between">
                  <span>Upstream Response Body:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(inspectAttempt.response_body || inspectAttempt.excerpt || "")}
                    className="text-brand-500 hover:underline text-[10px]"
                  >
                    Salin Respon
                  </button>
                </div>
                <pre className="rounded-lg bg-[#faf7f2] dark:bg-[#282828] border border-border p-3 text-text-main whitespace-pre-wrap break-all text-[11px] max-h-60 overflow-y-auto">
                  {inspectAttempt.response_body || inspectAttempt.excerpt || "Tidak ada respon body tersimpan."}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <span className="text-[11px] text-text-muted">
                Waktu eksekusi: {new Date(inspectAttempt.created_at).toLocaleString()}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setInspectAttempt(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Modal 3: Reviewer Model Selector Modal (100% Solid, Non-Transparent) ─── */}
      {isReviewerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setIsReviewerModalOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <div>
                <h3 className="font-bold text-text-main text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-500">psychology</span>
                  <span>Pilih Model Reviewer AI</span>
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Pilih 1 model yang akan membaca dan merangkum hasil benchmark setelah selesai.
                </p>
              </div>
              <button
                onClick={() => setIsReviewerModalOpen(false)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
              >
                <span className="material-symbols-outlined text-xl leading-none">close</span>
              </button>
            </div>

            <div className="px-6 py-3 border-b border-border bg-white dark:bg-[#202020]">
              <Input
                placeholder="Cari nama model reviewer..."
                value={reviewerPickerSearch}
                onChange={(e) => setReviewerPickerSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-[#faf7f2] dark:bg-[#1a1a1a]">
              <div
                onClick={() => {
                  setReviewer("judge-router");
                  setIsReviewerModalOpen(false);
                }}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all bg-white dark:bg-[#242424] ${
                  reviewer === "judge-router"
                    ? "border-brand-500 bg-brand-500/10 text-brand-500 dark:text-brand-400 font-bold"
                    : "border-border hover:border-border text-text-main"
                }`}
              >
                <div>
                  <div className="font-semibold text-sm">judge-router</div>
                  <div className="text-xs text-text-muted">Internal automated router judge</div>
                </div>
                <Badge variant="default">Default</Badge>
              </div>

              {reviewerModelOptions
                .filter((opt) => opt.value !== "judge-router")
                .filter((opt) => {
                  if (!reviewerPickerSearch) return true;
                  const q = reviewerPickerSearch.toLowerCase();
                  return opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q) || opt.subtitle?.toLowerCase().includes(q);
                })
                .map((opt) => {
                  const isSelected = reviewer === opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => {
                        setReviewer(opt.value);
                        setIsReviewerModalOpen(false);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all bg-white dark:bg-[#242424] ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/10 text-brand-500 dark:text-brand-400 font-semibold"
                          : "border-border hover:border-border text-text-main"
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-medium text-xs truncate text-text-main">{opt.label}</div>
                        <div className="text-[10px] text-text-muted font-mono">{opt.value}</div>
                      </div>
                      <Badge variant="secondary">{opt.badge}</Badge>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <span className="text-xs text-text-muted truncate max-w-sm">
                Terpilih: <span className="font-bold text-text-main">{reviewer || "Tanpa Reviewer"}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => setIsReviewerModalOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
