"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Card, Button, Modal, Input, CardSkeleton, ModelSelectModal, ConfirmModal, CapacityBadges, Select, Toggle, SegmentedControl } from "@/shared/components";

const ComboAnalyticsTab = dynamic(() => import("./components/ComboAnalyticsTab"), {
 ssr: false,
 loading: () => <CardSkeleton />,
});
import SmartRoutingSection from "./components/SmartRoutingSection";
import { useNotificationStore } from "@/store/notificationStore";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { getComboBadge, isBuiltinCombo, BUILTIN_COMBO_NAMES } from "@/shared/utils/comboBadge";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-/]+$/;

// Capacity adapter: global fallback pools of models per input-modality capability.
// A request needing a capability the target model/combo lacks switches straight
// to the first enabled model here instead of erroring or dropping the data.
const CAPACITY_ADAPTER_CAPS = [
 { key: "vision", label: "Vision", icon: "visibility", desc: "Images" },
 // pdf, videoInput temporarily hidden — no translator support yet for those blocks.
 { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "Audio input" },
];
const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.5-free";
const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
const EMPTY_CAPACITY_ADAPTER = {
 vision: { ...EMPTY_CAP_ENTRY },
 pdf: { ...EMPTY_CAP_ENTRY },
 audioInput: { ...EMPTY_CAP_ENTRY },
 videoInput: { ...EMPTY_CAP_ENTRY },
};
// Backward-compat: legacy stored form was an array of {model, enabled}.
function normalizeCapEntry(entry) {
 if (Array.isArray(entry)) {
 return { enabled: true, roundRobin: false, models: entry.map((e) => e?.model || e).filter(Boolean) };
 }
 if (entry && typeof entry === "object") {
 return {
 enabled: entry.enabled !== false,
 roundRobin: !!entry.roundRobin,
 models: Array.isArray(entry.models) ? entry.models.filter(Boolean) : [],
 };
 }
 return { ...EMPTY_CAP_ENTRY };
}

export default function CombosPage() {
 return (
 <Suspense fallback={<CardSkeleton />}>
 <CombosPageContent />
 </Suspense>
 );
}

function CombosPageContent() {
 const searchParams = useSearchParams();
 const router = useRouter();
 const tabFromUrl = searchParams.get("tab");
 const activeTab = tabFromUrl === "analytics" ? "analytics" : "combos";

 const handleTabChange = (value) => {
 if (value === activeTab) return;
 const params = new URLSearchParams(searchParams);
 params.set("tab", value);
 router.push(`/dashboard/combos?${params.toString()}`, { scroll: false });
 };

 return (
 <div className="flex min-w-0 flex-col gap-3">
 <div className="w-full max-w-full min-w-0 overflow-x-auto no-scrollbar tab-scroll-fade pb-0.5 sm:pb-0">
 <SegmentedControl
 options={[
 { value: "combos", label: "Combos" },
 { value: "analytics", label: "Analytics" },
 ]}
 value={activeTab}
 onChange={handleTabChange}
 className="w-full sm:w-auto min-w-max"
 />
 </div>
 {activeTab === "analytics" ? (
 <ComboAnalyticsTab />
 ) : (
 <CombosContent />
 )}
 </div>
 );
}

function CombosContent() {
 const [combos, setCombos] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showCreateModal, setShowCreateModal] = useState(false);
 const [editingCombo, setEditingCombo] = useState(null);
 const [activeProviders, setActiveProviders] = useState([]);
 const [comboStrategies, setComboStrategies] = useState({});
 const [capacityAdapter, setCapacityAdapter] = useState(EMPTY_CAPACITY_ADAPTER);
 const { getCaps } = useModelCaps();
 const [confirmState, setConfirmState] = useState(null);
  const { copied, copy } = useCopyToClipboard();
  const notify = useNotificationStore();
 const [comboCategory, setComboCategory] = useState("all"); // "all" | "custom" | "builtin"
  const [searchQuery, setSearchQuery] = useState("");
  const fetchData = async () => {
  try {
 const [combosRes, providersRes, settingsRes] = await Promise.all([
 fetch("/api/combos"),
 fetch("/api/providers?isActive=true&fields=summary"),
 fetch("/api/settings"),
 ]);
 const combosData = await combosRes.json();
 const providersData = await providersRes.json();
 const settingsData = settingsRes.ok ? await settingsRes.json() : {};
 
 // Only LLM combos here - webSearch/webFetch combos belong to media-providers/web
 if (combosRes.ok) setCombos((combosData.combos || []).filter(c => !c.kind || c.kind === "llm"));
 if (providersRes.ok) {
 setActiveProviders(providersData.connections || []);
 }
 setComboStrategies(settingsData.comboStrategies || {});
 const rawAdapter = settingsData.capacityAdapter || {};
 const normalized = {};
 for (const cap of CAPACITY_ADAPTER_CAPS) {
 normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
 }
 setCapacityAdapter(normalized);
 } catch (error) {

  } finally {
  setLoading(false);
  }
  };

 useEffect(() => {
 queueMicrotask(() => fetchData());
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetCapacityAdapter = async (next) => {
 setCapacityAdapter(next);
 try {
 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ capacityAdapter: next }),
 });
 } catch (error) {

 }
 };

 const handleCreate = async (data) => {
 try {
 const res = await fetch("/api/combos", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(data),
 });
 if (res.ok) {
 await fetchData();
 setShowCreateModal(false);
 } else {
 const err = await res.json();
 notify.error(err.error || "Failed to create combo");
 }
 } catch (error) {

 }
 };

 const handleUpdate = async (id, data, silent = false) => {
 try {
 const res = await fetch(`/api/combos/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(data),
 });
 if (res.ok) {
 const updated = await res.json();
 setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
 if (!silent) {
 setEditingCombo(null);
 }
 } else {
 const err = await res.json();
 if (!silent) {
 notify.error(err.error || "Failed to update combo");
 }
 }
 } catch (error) {
 if (!silent) {
 notify.error("Failed to update combo");
 }
 }
 };
 const handleDelete = async (id) => {
 setConfirmState({
 title: "Delete Combo",
 message: "Delete this combo?",
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
 if (res.ok) {
 setCombos(combos.filter(c => c.id !== id));
 }
 } catch (error) {

 }
 }
 });
 };

 // Merge a per-combo strategy patch into settings.comboStrategies. Passing an empty
 // patch (strategy back to default "fallback") drops the entry entirely.
 // stickyLimit: null clears the per-combo window (back to global).
 const handleSetComboStrategy = async (comboName, patch) => {
 try {
 const updated = { ...comboStrategies };
 const next = { ...(updated[comboName] || {}), ...patch };
 if (patch.stickyLimit === null) delete next.stickyLimit;
 // Prune to keep settings clean: default fallback with no extras = no entry.
 if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
 delete updated[comboName];
 } else {
 updated[comboName] = next;
 }

 await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ comboStrategies: updated }),
 });

 setComboStrategies(updated);
 } catch (error) {

 }
 };

 const { customCombos, builtinCombos } = useMemo(() => {
 const custom = [];
 const builtin = [];
 for (const c of combos) {
 if (isBuiltinCombo(c)) {
 builtin.push(c);
 } else {
 custom.push(c);
 }
 }
 return { customCombos: custom, builtinCombos: builtin };
 }, [combos]);

 const filterBySearch = useCallback((list) => {
 if (!searchQuery.trim()) return list;
 const q = searchQuery.trim().toLowerCase();
 return list.filter((c) => {
 if (c.name.toLowerCase().includes(q)) return true;
 if (Array.isArray(c.models) && c.models.some((m) => m.toLowerCase().includes(q))) return true;
 const strat = comboStrategies[c.name] || {};
 if (strat.easyModels?.some((m) => m.toLowerCase().includes(q))) return true;
 if (strat.mediumModels?.some((m) => m.toLowerCase().includes(q))) return true;
 if (strat.hardModels?.some((m) => m.toLowerCase().includes(q))) return true;
 return false;
 });
 }, [searchQuery, comboStrategies]);

 const filteredCustom = useMemo(() => filterBySearch(customCombos), [filterBySearch, customCombos]);
 const filteredBuiltin = useMemo(() => filterBySearch(builtinCombos), [filterBySearch, builtinCombos]);

 if (loading) {
 return (
 <div className="flex flex-col gap-3">
 <CardSkeleton />
 <CardSkeleton />
 </div>
 );
 }

 return (
 <div className="flex min-w-0 flex-col gap-3">
 {/* Header */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0">
 <p className="text-sm text-text-muted mt-1">
 Group models under one name, then pick a strategy per combo:
 </p>
 <ul className="text-sm text-text-muted mt-2 flex flex-col gap-1">
 <li><span className="font-medium text-text-main">Fallback</span> — tries models in order (next on failure)</li>
 <li><span className="font-medium text-text-main">Round Robin</span> — rotates models across requests to spread load</li>
 <li><span className="font-medium text-text-main">Smart Routing</span> — classifies prompt difficulty into Easy, Medium, or Hard tiers for cost & speed</li>
 <li><span className="font-medium text-text-main">Fusion</span> — queries all models in parallel, then a judge synthesizes one answer. Best quality, but costs the most: every request bills all panel models + the judge (N+1 calls)</li>
 </ul>
 </div>
 <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto whitespace-nowrap">
 Create Combo
 </Button>
 </div>

 {/* Category Tabs (Custom vs Built-in) + Search Bar */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
 <SegmentedControl
 options={[
 { value: "all", label: `All (${combos.length})` },
 { value: "custom", label: `Custom Combos (${customCombos.length})` },
 { value: "builtin", label: `Built-in Presets (${builtinCombos.length})` },
 ]}
 value={comboCategory}
 onChange={setComboCategory}
 className="w-full sm:w-auto min-w-max"
 />
 </div>
 <div className="relative w-full sm:w-64">
 <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">
 search
 </span>
 <input
 type="text"
 placeholder="Search combos or models..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full rounded-sm border border-border bg-surface pl-8 pr-7 py-1 text-xs text-text-main placeholder:text-text-muted/60 focus:border-primary focus:outline-none"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery("")}
 className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
 title="Clear search"
 >
 <span className="material-symbols-outlined text-[18px]">close</span>
 </button>
 )}
 </div>
 </div>

 {/* Combos List */}
 {combos.length === 0 ? (
 <Card>
 <div className="flex flex-col gap-2 py-2">
 <p className="text-sm font-medium text-text-main">No combos yet</p>
 <p className="text-sm text-text-muted">Create model combos with fallback support</p>
 <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
 Create Combo
 </Button>
 </div>
 </Card>
 ) : comboCategory === "custom" ? (
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-semibold text-text-main">Custom Combos</h3>
 <p className="text-xs text-text-muted">User-created model combinations and fallbacks</p>
 </div>
 <span className="rounded-sm bg-primary/10 px-2 py-1 text-xs font-medium text-primary border border-primary/30">
 {filteredCustom.length} Custom
 </span>
 </div>
 {filteredCustom.length === 0 ? (
 <Card>
 <div className="text-center py-3">
 <span className="material-symbols-outlined text-text-muted text-[18px] mb-2 block">
 {searchQuery ? "search_off" : "person"}
 </span>
 <p className="text-text-main font-medium mb-1">
 {searchQuery ? "No matching custom combos" : "No custom combos yet"}
 </p>
 <p className="text-xs text-text-muted mb-3">
 {searchQuery ? "Try a different search query" : "Create a custom combo to group models with fallback or round-robin"}
 </p>
 {!searchQuery && (
 <Button icon="add" size="sm" onClick={() => setShowCreateModal(true)}>
 Create Custom Combo
 </Button>
 )}
 </div>
 </Card>
 ) : (
 filteredCustom.map((combo) => (
 <ComboCard
 key={combo.id}
 combo={combo}
 isBuiltin={false}
 getCaps={getCaps}
 activeProviders={activeProviders}
 copied={copied}
 onCopy={copy}
 onEdit={() => setEditingCombo(combo)}
 onDelete={() => handleDelete(combo.id)}
 strategy={comboStrategies[combo.name] || {}}
 onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
 onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
 />
 ))
 )}
 </div>
 ) : comboCategory === "builtin" ? (
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-semibold text-text-main">Built-in Presets & Smart Routing</h3>
 <p className="text-xs text-text-muted">System seed combos with auto-failover across healthy providers</p>
 </div>
 <span className="rounded-sm bg-primary/10 px-2 py-1 text-xs font-medium text-primary border border-primary/30">
 {filteredBuiltin.length} Presets
 </span>
 </div>
 {filteredBuiltin.length === 0 ? (
 <Card>
 <div className="text-center py-3">
 <span className="material-symbols-outlined text-text-muted text-[18px] mb-2 block">
 search_off
 </span>
 <p className="text-text-main font-medium mb-1">No matching built-in presets</p>
 <p className="text-xs text-text-muted">Try a different search query</p>
 </div>
 </Card>
 ) : (
 filteredBuiltin.map((combo) => (
 <ComboCard
 key={combo.id}
 combo={combo}
 isBuiltin={true}
 getCaps={getCaps}
 activeProviders={activeProviders}
 copied={copied}
 onCopy={copy}
 onEdit={() => setEditingCombo(combo)}
 onDelete={() => handleDelete(combo.id)}
 strategy={comboStrategies[combo.name] || {}}
 onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
 onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
 />
 ))
 )}
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 {/* Custom Combos Section */}
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between border-b border-border pb-2 h-8">
 <div className="flex items-center gap-2">
 <div className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
 <span className="material-symbols-outlined text-[18px]">person</span>
 </div>
 <div>
 <div className="flex items-center gap-1.5">
 <h3 className="text-sm font-semibold text-text-main">Custom Combos</h3>
 <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/30">
 {filteredCustom.length}
 </span>
 </div>
 <p className="text-[11px] text-text-muted">Your custom-defined model groups</p>
 </div>
 </div>
 </div>

 {filteredCustom.length === 0 ? (
 <div className="rounded-sm border border-dashed border-border bg-surface/50 p-3 text-center">
 <p className="text-xs font-medium text-text-muted">No custom combos</p>
 <p className="text-[11px] text-text-muted/70 mt-0.5 mb-2.5">
 Create your own model groups with custom fallback or round-robin strategies.
 </p>
 <Button icon="add" size="sm" variant="ghost" onClick={() => setShowCreateModal(true)}>
 Create Custom Combo
 </Button>
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 {filteredCustom.map((combo) => (
 <ComboCard
 key={combo.id}
 combo={combo}
 isBuiltin={false}
 getCaps={getCaps}
 activeProviders={activeProviders}
 copied={copied}
 onCopy={copy}
 onEdit={() => setEditingCombo(combo)}
 onDelete={() => handleDelete(combo.id)}
 strategy={comboStrategies[combo.name] || {}}
 onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
 onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
 />
 ))}
 </div>
 )}
 </div>

 {/* Built-in Presets Section */}
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between border-b border-border pb-2 h-8">
 <div className="flex items-center gap-2">
 <div className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
 <span className="material-symbols-outlined text-[18px]">verified</span>
 </div>
 <div>
 <div className="flex items-center gap-1.5">
 <h3 className="text-sm font-semibold text-text-main">Built-in Presets & Smart Routing</h3>
 <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary border border-primary/30">
 {filteredBuiltin.length}
 </span>
 </div>
 <p className="text-[11px] text-text-muted">
 Pre-configured family fallbacks and intelligent difficulty routing
 </p>
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-3">
 {filteredBuiltin.map((combo) => (
 <ComboCard
 key={combo.id}
 combo={combo}
 isBuiltin={true}
 getCaps={getCaps}
 activeProviders={activeProviders}
 copied={copied}
 onCopy={copy}
 onEdit={() => setEditingCombo(combo)}
 onDelete={() => handleDelete(combo.id)}
 strategy={comboStrategies[combo.name] || {}}
 onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
 onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
 />
 ))}
 </div>
 </div>
 </div>
 )}

 {/* Capacity Adapter */}
 <CapacityAdapterSection
 capacityAdapter={capacityAdapter}
 onChange={handleSetCapacityAdapter}
 activeProviders={activeProviders}
 getCaps={getCaps}
 />

 {/* Create Modal - Use key to force remount and reset state */}
 {showCreateModal && (
 <ComboFormModal
 key="create"
 isOpen={showCreateModal}
 onClose={() => setShowCreateModal(false)}
 onSave={handleCreate}
 activeProviders={activeProviders}
 />
 )}

 {editingCombo && (
 <ComboFormModal
 key={editingCombo.id}
 isOpen={!!editingCombo}
 combo={editingCombo}
 isBuiltin={isBuiltinCombo(editingCombo)}
 strategy={editingCombo ? (comboStrategies[editingCombo.name] || {}) : null}
 onClose={() => setEditingCombo(null)}
 onSave={(data) => handleUpdate(editingCombo.id, data)}
 activeProviders={activeProviders}
 />
 )}

 {/* Confirm Delete Modal */}
 <ConfirmModal
 isOpen={!!confirmState}
 onClose={() => setConfirmState(null)}
 onConfirm={confirmState?.onConfirm}
 title={confirmState?.title || "Confirm"}
 message={confirmState?.message}
 variant="danger"
 />
 </div>
 );
}

const STRATEGY_OPTIONS = [
 { value: "fallback", label: "Fallback — try in order" },
 { value: "round-robin", label: "Round Robin — rotate" },
 { value: "round-robin-sticky", label: "Round Robin Sticky — N per model" },
 { value: "random", label: "Random — shuffle each request" },
 { value: "difficulty", label: "Smart Routing — difficulty judge (easy/med/hard)" },
 { value: "fusion", label: "Fusion — panel + judge" },
];

function ComboCard({
 combo,
 getCaps,
 activeProviders = [],
 copied,
 onCopy,
 onEdit,
 onDelete,
 strategy = {},
 onSetStrategy,
 onUpdateCombo,
 isBuiltin = false,
}) {
 const [showJudgeSelect, setShowJudgeSelect] = useState(false);
 const [stickyDraft, setStickyDraft] = useState(null);
 const current = strategy.fallbackStrategy || "fallback";
 const judge = strategy.judgeModel || "";
 const isFusion = current === "fusion";
 const isDifficulty = current === "difficulty";
 const isRR = current === "round-robin" || current === "round-robin-sticky";
 const stickyValue = stickyDraft ?? strategy.stickyLimit ?? "";

 const easyCount = Array.isArray(strategy.easyModels) ? strategy.easyModels.length : 0;
 const mediumCount = Array.isArray(strategy.mediumModels) ? strategy.mediumModels.length : 0;
 const hardCount = Array.isArray(strategy.hardModels) ? strategy.hardModels.length : 0;
 const totalTierModels = useMemo(() => {
 const set = new Set([
 ...(Array.isArray(strategy.easyModels) ? strategy.easyModels : []),
 ...(Array.isArray(strategy.mediumModels) ? strategy.mediumModels : []),
 ...(Array.isArray(strategy.hardModels) ? strategy.hardModels : []),
 ]);
 return set.size;
 }, [strategy.easyModels, strategy.mediumModels, strategy.hardModels]);

 return (
 <Card padding="sm" className="group">
 <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
 {(() => {
 const badge = getComboBadge(combo, strategy);
 return (
 <div
 className={`size-8 rounded-sm flex items-center justify-center shrink-0 border ${badge.border} ${badge.bg} ${badge.text}`}
 title={badge.title}
 >
 <span className="material-symbols-outlined text-[18px]">
 {badge.icon}
 </span>
 </div>
 );
 })()}
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-1.5">
 <code className="block truncate font-mono text-sm font-semibold">{combo.name}</code>
 {isDifficulty && (
 <span className="inline-flex items-center gap-0.5 rounded-sm bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success border border-success/30">
 <span className="material-symbols-outlined text-[11px]">auto_awesome</span>
 Smart Routing
 </span>
 )}
 </div>

 {/* If difficulty: tier summary; otherwise: normal model chips */}
 {isDifficulty ? (
 <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
 <span>{totalTierModels || combo.models.length} models in 3 tiers</span>
 <span className="text-text-muted/40">•</span>
 <span className="inline-flex items-center gap-1 font-medium text-success">
 <span className="size-1.5 rounded-full bg-success"></span>
 Easy: {easyCount}
 </span>
 <span className="inline-flex items-center gap-1 font-medium text-warning">
 <span className="size-1.5 rounded-full bg-warning"></span>
 Medium: {mediumCount}
 </span>
 <span className="inline-flex items-center gap-1 font-medium text-danger">
 <span className="size-1.5 rounded-full bg-danger"></span>
 Hard: {hardCount}
 </span>
 </div>
 ) : (
 <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
 {combo.models.length === 0 ? (
 <span className="text-xs text-text-muted italic">No models</span>
 ) : (
 combo.models.map((model, index) => (
 <code
 key={`${model}-${index}`}
 className="inline-flex items-center gap-1 rounded-sm bg-surface-2 px-1.5 py-1 font-mono text-xs text-text-muted"
 >
 <span>{model}</span>
 <CapacityBadges caps={getCaps?.(model)} />
 </code>
 ))
 )}
 </div>
 )}

 {/* Round-robin sticky window */}
 {isRR && (
 <div className="mt-2 flex items-center gap-2">
 <span className="text-[11px] font-medium text-text-muted" title="Requests per model before rotating to the next (blank = use the global setting)">
 Sticky calls/model
 </span>
 <Input
 type="number"
 min="1"
 max="100"
 placeholder="global"
 value={stickyValue}
 onChange={(e) => setStickyDraft(e.target.value)}
 onBlur={() => {
 if (stickyDraft === null) return;
 const num = parseInt(stickyDraft, 10);
 onSetStrategy({ stickyLimit: Number.isFinite(num) && num > 0 ? num : null });
 setStickyDraft(null);
 }}
 className="w-20 py-1 text-center text-xs"
 />
 </div>
 )}

 {/* Fusion: judge picker */}
 {isFusion && (
 <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
 <span className="text-[11px] font-medium text-text-muted">Judge</span>
 <button
 onClick={() => setShowJudgeSelect(true)}
 className="inline-flex max-w-full items-center gap-1 rounded-sm border border-dashed border-primary/30 px-1.5 py-1 font-mono text-[11px] text-primary hover:border-primary hover:bg-primary/10"
 title="Pick the model that fuses panel answers"
 >
 <span className="material-symbols-outlined text-[18px]">gavel</span>
 <span className="truncate">{judge || `Auto — ${combo.models[0] || "first model"}`}</span>
 </button>
 {judge && (
 <button
 onClick={() => onSetStrategy({ judgeModel: "" })}
 className="size-8 rounded-sm text-text-muted hover:text-danger hover:bg-danger/10"
 title="Reset judge to Auto"
 >
 <span className="material-symbols-outlined text-[18px]">close</span>
 </button>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Actions */}
 <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
 {/* Strategy selector — always visible */}
 <div className="w-full sm:w-[220px]">
 <Select
 options={STRATEGY_OPTIONS}
 value={current}
 onChange={(e) => onSetStrategy({ fallbackStrategy: e.target.value })}
 selectClassName="py-2 text-xs"
 />
 </div>

 <div className={isBuiltin ? "grid grid-cols-2 gap-1 sm:flex" : "grid grid-cols-3 gap-1 sm:flex"}>
 <button
 onClick={(e) => { e.stopPropagation(); onCopy(combo.name, `combo-${combo.id}`); }}
 className="flex flex-col items-center rounded-sm px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-primary"
 title="Copy combo name"
 >
 <span className="material-symbols-outlined text-[18px]">
 {copied === `combo-${combo.id}` ? "check" : "content_copy"}
 </span>
 <span className="text-[11px]">Copy</span>
 </button>
 <button
 onClick={onEdit}
 className="flex flex-col items-center rounded-sm px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-primary"
 title="Edit"
 >
 <span className="material-symbols-outlined text-[18px]">edit</span>
 <span className="text-[11px]">Edit</span>
 </button>
 {!isBuiltin && (
 <button
 onClick={onDelete}
 className="flex flex-col items-center rounded-sm px-2 py-1 text-danger hover:bg-danger/10"
 title="Delete"
 >
 <span className="material-symbols-outlined text-[18px]">delete</span>
 <span className="text-[11px]">Delete</span>
 </button>
 )}
 </div>
 </div>
 </div>

 {/* Smart Routing 3-Tier Section (Full width below header) */}
 {isDifficulty && (
 <SmartRoutingSection
 combo={combo}
 strategy={strategy}
 onSetStrategy={onSetStrategy}
 onUpdateComboModels={(newModels) => onUpdateCombo?.(combo.id, { models: newModels })}
 activeProviders={activeProviders}
 getCaps={getCaps}
 />
 )}

 {/* Fusion Judge model picker */}
 {isFusion && showJudgeSelect && (
 <ModelSelectModal
 isOpen={showJudgeSelect}
 onClose={() => setShowJudgeSelect(false)}
 onSelect={(m) => { onSetStrategy({ judgeModel: m?.value || "" }); setShowJudgeSelect(false); }}
 activeProviders={activeProviders}
 title="Select Fusion Judge Model"
 addedModelValues={judge ? [judge] : []}
 closeOnSelect={true}
 />
 )}
 </Card>
 );
}

function CapacityAdapterSection({ capacityAdapter, onChange, activeProviders, getCaps }) {
 return (
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0">
 <p className="text-sm font-medium">Vision Adapter</p>
 <p className="text-xs text-text-muted mt-0.5">
 Your model can&apos;t read image/audio? Auto-switches to a model in the pool below.
 </p>
 <ul className="mt-1.5 text-[11px] text-text-muted flex flex-col gap-0.5">
 <li><span className="font-medium text-text-main">Vision</span> — images (png, jpg, webp, …)</li>
 <li><span className="font-medium text-text-main">Audio</span> — audio input</li>
 </ul>
 </div>
 </div>
 <div className="flex flex-col gap-3">
 {CAPACITY_ADAPTER_CAPS.map((cap) => (
 <CapacityAdapterCap
 key={cap.key}
 cap={cap}
 entry={capacityAdapter[cap.key] || EMPTY_CAP_ENTRY}
 onChange={(entry) => onChange({ ...capacityAdapter, [cap.key]: entry })}
 activeProviders={activeProviders}
 getCaps={getCaps}
 />
 ))}
 </div>
 </div>
 );
}

function CapacityAdapterCap({ cap, entry, onChange, activeProviders, getCaps }) {
 const [showModelSelect, setShowModelSelect] = useState(false);
 const { enabled, roundRobin, models } = entry;

 const patch = (p) => onChange({ ...entry, ...p });

 const handleAdd = (model) => {
 if (models.includes(model.value)) return;
 patch({ models: [...models, model.value] });
 };

 const handleRemove = (index) => {
 const next = models.filter((_, i) => i !== index);
 patch({ models: next.length === 0 ? [DEFAULT_FALLBACK_MODEL] : next });
 };

 const handleMove = (index, delta) => {
 const target = index + delta;
 if (target < 0 || target >= models.length) return;
 const next = [...models];
 [next[index], next[target]] = [next[target], next[index]];
 patch({ models: next });
 };

 return (
 <Card padding="sm" className={`group ${!enabled ? "opacity-50" : ""}`}>
 <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 {/* Master toggle + icon + label + chips */}
 <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
 <Toggle
 checked={enabled}
 onChange={(v) => patch({ enabled: v })}
 aria-label={`Enable ${cap.label} adapter`}
 />
 <div className="size-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0">
 <span className="material-symbols-outlined text-primary text-[18px]">{cap.icon}</span>
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <code className="font-mono text-sm font-medium">{cap.label}</code>
 <span className="text-[11px] text-text-muted">— {cap.desc}</span>
 </div>
 <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
 {models.length === 0 ? (
 <span className="text-xs text-text-muted italic">No models</span>
 ) : (
 models.map((model, index) => (
 <code
 key={`${model}-${index}`}
 className="group/chip inline-flex items-center gap-1 rounded-sm bg-surface-2 px-1.5 py-1 font-mono text-xs text-text-muted"
 >
 <span>{model}</span>
 <CapacityBadges caps={getCaps?.(model)} />
 <button onClick={() => handleMove(index, -1)} disabled={index === 0} className={` opacity-0 group-hover/chip:opacity-100 ${index === 0 ? "text-text-muted/20" : "text-text-muted hover:text-primary"}`}>
 <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
 </button>
 <button onClick={() => handleMove(index, 1)} disabled={index === models.length - 1} className={` opacity-0 group-hover/chip:opacity-100 ${index === models.length - 1 ? "text-text-muted/20" : "text-text-muted hover:text-primary"}`}>
 <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
 </button>
 <button onClick={() => handleRemove(index)} className="opacity-0 group-hover/chip:opacity-100 text-text-muted hover:text-danger">
 <span className="material-symbols-outlined text-[18px]">close</span>
 </button>
 </code>
 ))
 )}
 </div>
 </div>
 </div>

 {/* Actions: Round-robin toggle + Add Model */}
 <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
 <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none font-medium">
 <Toggle
 checked={roundRobin}
 onChange={(v) => patch({ roundRobin: v })}
 disabled={!enabled}
 aria-label={`Round-robin ${cap.label} adapter`}
 />
 <span>Round</span>
 </label>
 <Button
 icon="add"
 variant="ghost"
 size="sm"
 onClick={() => setShowModelSelect(true)}
 disabled={!enabled}
 title={`Add ${cap.label} model`}
 >
 Add Model
 </Button>
 </div>
 </div>

 {showModelSelect && (
 <ModelSelectModal
 isOpen={showModelSelect}
 onClose={() => setShowModelSelect(false)}
 onSelect={handleAdd}
 activeProviders={activeProviders}
 title={`Add ${cap.label} Model`}
 addedModelValues={models}
 capFilter={cap.key}
 closeOnSelect={false}
 />
 )}
 </Card>
 );
}

function ModelItem({ id, index, model, isFirst, isLast, onEdit, onMoveUp, onMoveDown, onRemove }) {
 const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
 const style = {
 transform: CSS.Transform.toString(transform),
 // no transition — prevents the CSS settle animation fighting React's re-render on drop
 opacity: isDragging ? 0.4 : 1,
 zIndex: isDragging ? 999 : undefined,
 };
 const [editing, setEditing] = useState(false);
 const [draft, setDraft] = useState(model);
 const commit = () => {
 const trimmed = draft.trim();
 if (trimmed && trimmed !== model) onEdit(trimmed);
 else setDraft(model);
 setEditing(false);
 };

 const handleKeyDown = (e) => {
 if (e.key === "Enter") commit();
 if (e.key === "Escape") { setDraft(model); setEditing(false); }
 };

 return (
 <div
 ref={setNodeRef}
 style={style}
 className={`group flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-1 bg-surface hover:bg-surface-2 ${isDragging ? " border-primary" : ""}`}
 >
 {/* Drag handle */}
 <button
 {...attributes}
 {...listeners}
 type="button"
 className="cursor-grab touch-none size-8 rounded-sm text-text-muted hover:text-primary active:cursor-grabbing shrink-0"
 title="Drag to reorder"
 >
 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
 <circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/>
 <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
 <circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/>
 </svg>
 </button>

 {/* Index badge */}
 <span className="text-[11px] font-medium text-text-muted w-3 text-center shrink-0">{index + 1}</span>

 {/* Inline editable model value */}
 {editing ? (
 <input
 autoFocus
 value={draft}
 onChange={(e) => setDraft(e.target.value)}
 onBlur={commit}
 onKeyDown={handleKeyDown}
 className="min-w-0 flex-1 rounded-sm border border-primary/30 bg-surface px-1.5 py-1 font-mono text-xs text-text-main outline-none"
 />
 ) : (
 <div
 className="min-w-0 flex-1 cursor-text truncate rounded-sm px-1.5 py-1 font-mono text-xs text-text-main hover:bg-surface-2"
 onClick={() => setEditing(true)}
 title="Click to edit"
 >
 {model}
 </div>
 )}

 {/* Priority arrows */}
 <div className="flex shrink-0 items-center gap-0.5">
 <button
 onClick={onMoveUp}
 disabled={isFirst}
 className={`size-8 rounded-sm ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-surface-2"}`}
 title="Move up"
 >
 <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
 </button>
 <button
 onClick={onMoveDown}
 disabled={isLast}
 className={`size-8 rounded-sm ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-surface-2"}`}
 title="Move down"
 >
 <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
 </button>
 </div>

 {/* Remove */}
 <button
 onClick={onRemove}
 className="size-8 hover:bg-danger/10 rounded-sm text-text-muted hover:text-danger"
 title="Remove"
 >
 <span className="material-symbols-outlined text-[18px]">close</span>
 </button>
 </div>
 );
}

function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null, strategy = null, isBuiltin = false }) {
 // Initialize state with combo values - key prop on parent handles reset on remount
 const [name, setName] = useState(combo?.name || "");
 const [models, setModels] = useState(combo?.models || []);
 const [showModelSelect, setShowModelSelect] = useState(false);
 const [saving, setSaving] = useState(false);
 const [nameError, setNameError] = useState("");
 const [modelAliases, setModelAliases] = useState({});

 const sensors = useSensors(
 useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
 useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
 );

 // Use stable index-based IDs so duplicates and similar names are handled correctly
 const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

 const handleDragEnd = (event) => {
 const { active, over } = event;
 if (over && active.id !== over.id) {
 const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
 const newIndex = modelItems.findIndex((m) => m.uid === over.id);
 if (oldIndex !== -1 && newIndex !== -1) {
 setModels((prev) => arrayMove(prev, oldIndex, newIndex));
 }
 }
 };

 const fetchModalData = async () => {
 try {
 const aliasesRes = await fetch("/api/models/alias");
 if (!aliasesRes.ok) return;
 const aliasesData = await aliasesRes.json();
 setModelAliases(aliasesData.aliases || {});
 } catch (error) {
 console.error("Error fetching modal data:", error);
 }
 };

 useEffect(() => {
  if (isOpen) queueMicrotask(() => fetchModalData());
  }, [isOpen]);

 const validateName = (value) => {
 if (!value.trim()) {
 setNameError("Name is required");
 return false;
 }
 if (!VALID_NAME_REGEX.test(value)) {
 setNameError("Only letters, numbers, -, _, . and / allowed");
 return false;
 }
 setNameError("");
 return true;
 };

 const handleNameChange = (e) => {
 const value = e.target.value;
 setName(value);
 if (value) validateName(value);
 else setNameError("");
 };

 const handleAddModel = (model) => {
 if (!models.includes(model.value)) {
 setModels([...models, model.value]);
 }
 };

 const handleDeselectModel = (model) => {
 setModels(models.filter((m) => m !== model.value));
 };

 const handleRemoveModel = (index) => {
 setModels(models.filter((_, i) => i !== index));
 };

 const handleMoveUp = (index) => {
 if (index === 0) return;
 const newModels = [...models];
 [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
 setModels(newModels);
 };

 const handleMoveDown = (index) => {
 if (index === models.length - 1) return;
 const newModels = [...models];
 [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
 setModels(newModels);
 };

 const handleSave = async () => {
 if (!validateName(name)) return;
 setSaving(true);
 await onSave({ name: name.trim(), models });
 setSaving(false);
 };

 const isEdit = !!combo;

 return (
 <>
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title={isEdit ? "Edit Combo" : "Create Combo"}
 >
 <div className="flex flex-col gap-3">
 {/* Name */}
 <div>
 <Input
 label="Combo Name"
 value={name}
 onChange={handleNameChange}
 placeholder="my-combo"
 disabled={isBuiltin}
 error={nameError}
 />
 <p className="text-[11px] text-text-muted mt-0.5">
 {isBuiltin
 ? "Built-in preset name is fixed and cannot be changed"
 : "Only letters, numbers, -, _, . and / allowed"}
 </p>
 </div>
 {/* Smart Routing Notice */}
 {strategy?.fallbackStrategy === "difficulty" && (
 <div className="rounded-sm border border-success/30 bg-success/10 p-3 text-xs text-text-muted">
 <div className="flex items-center gap-1.5 font-medium text-success">
 <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
 <span>Smart Routing Combo</span>
 </div>
 <p className="mt-1 text-[11px] text-text-muted">
 This combo routes requests through <strong>Easy</strong>, <strong>Medium</strong>, and <strong>Hard</strong> tiers.
 You can manage tier assignments, priority order, and the judge model directly on the combo card.
 </p>
 </div>
 )}

 {/* Models */}
 <div>
 <label className="font-medium mb-1.5 block text-xs text-text-muted">Models</label>

 {models.length === 0 ? (
 <div className="text-center py-3 border border-dashed border-border rounded-sm bg-surface">
 <span className="material-symbols-outlined text-text-muted text-[18px] mb-1">
 {combo ? getComboBadge(combo, strategy).icon : "person"}
 </span>
 <p className="text-xs text-text-muted">No models added yet</p>
 </div>
 ) : (
 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
 <SortableContext items={modelItems.map((m) => m.uid)} strategy={verticalListSortingStrategy}>
 <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[350px]">
 {modelItems.map(({ uid, model }, index) => (
 <ModelItem
 key={uid}
 id={uid}
 index={index}
 model={model}
 isFirst={index === 0}
 isLast={index === modelItems.length - 1}
 onEdit={(newVal) => {
 const updated = [...models];
 updated[index] = newVal;
 setModels(updated);
 }}
 onMoveUp={() => handleMoveUp(index)}
 onMoveDown={() => handleMoveDown(index)}
 onRemove={() => handleRemoveModel(index)}
 />
 ))}
 </div>
 </SortableContext>
 </DndContext>
 )}

 {/* Add Model button */}
 <button
 onClick={() => setShowModelSelect(true)}
 className="w-full mt-2 h-8 border border-dashed border-border rounded-sm text-xs text-primary font-medium hover:text-primary hover:border-primary/30 flex items-center justify-center gap-1"
 >
 <span className="material-symbols-outlined text-[18px]">add</span>
 Add Model
 </button>
 </div>

 {/* Actions */}
 <div className="flex flex-col gap-2 pt-1 sm:flex-row">
 <Button onClick={onClose} variant="ghost" fullWidth size="sm">
 Cancel
 </Button>
 <Button
 onClick={handleSave}
 fullWidth
 size="sm"
 disabled={!name.trim() || !!nameError || saving}
 >
 {saving ? "Saving..." : isEdit ? "Save" : "Create"}
 </Button>
 </div>
 </div>
 </Modal>

 {/* Model Select Modal */}
 {showModelSelect && (
 <ModelSelectModal
 isOpen={showModelSelect}
 onClose={() => setShowModelSelect(false)}
 onSelect={handleAddModel}
 onDeselect={handleDeselectModel}
 activeProviders={activeProviders}
 modelAliases={modelAliases}
 title="Add Model to Combo"
 kindFilter={kindFilter}
 addedModelValues={models}
 closeOnSelect={false}
 />
 )}
 </>
 );
}
