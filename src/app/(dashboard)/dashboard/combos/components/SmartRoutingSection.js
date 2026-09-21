"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { ModelSelectModal, CapacityBadges, Button, Input } from "@/shared/components";

const TIER_CONFIG = [
  {
    key: "easy",
    label: "Easy Tier",
    shortLabel: "Easy",
    icon: "bolt",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    headerBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    cardBorder: "border-emerald-500/25 dark:border-emerald-500/30",
    cardBg: "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.03]",
    title: "Fast & Economical",
    subtitle: "Short prompts, simple edits, quick Q&A, low token cost",
  },
  {
    key: "medium",
    label: "Medium Tier",
    shortLabel: "Medium",
    icon: "psychology",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    headerBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    cardBorder: "border-amber-500/25 dark:border-amber-500/30",
    cardBg: "bg-amber-500/[0.02] dark:bg-amber-500/[0.03]",
    title: "Standard Reasoning",
    subtitle: "Agent tasks, typical coding, multi-turn chat, refactoring",
  },
  {
    key: "hard",
    label: "Hard Tier",
    shortLabel: "Hard",
    icon: "diamond",
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    headerBg: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    cardBorder: "border-rose-500/25 dark:border-rose-500/30",
    cardBg: "bg-rose-500/[0.02] dark:bg-rose-500/[0.03]",
    title: "Frontier Capability",
    subtitle: "Complex architecture, tool calling, large context, hard questions",
  },
];

const POLICY_DESCRIPTIONS = {
  balanced: "Judges task complexity and routes according to Morph confidence matrix. Balances cost, latency, and quality.",
  cost_efficient: "Aggressively routes toward Easy and Medium tiers. Only escalates to Hard when strictly required.",
  capability_heavy: "Biases toward Frontier / Hard models for tasks requiring maximum intelligence and reasoning depth.",
};

// Sortable item component with drag handle for reordering inside tier modal
function SortableTierModelRow({ id, model, index, onRemove, getCaps }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-2.5 rounded-xl border border-border bg-white dark:bg-[#242424] p-3 shadow-2xs transition-all ${
        isDragging ? "shadow-lg ring-2 ring-primary/40 border-primary" : "hover:border-border"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none p-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-3 active:cursor-grabbing shrink-0 transition-colors"
          title="Tarik untuk memindahkan urutan prioritas"
        >
          <span className="material-symbols-outlined text-lg leading-none">drag_indicator</span>
        </button>

        {/* Priority Rank */}
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold bg-surface-3 text-text-muted"
          title={`Prioritas #${index + 1}: Dicoba pertama, fallback ke nomor berikutnya jika gagal`}
        >
          #{index + 1}
        </span>

        {/* Model ID & Badges */}
        <div className="truncate min-w-0 flex-1">
          <code className="truncate font-mono text-xs font-semibold text-text-main block" title={model}>
            {model}
          </code>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CapacityBadges caps={getCaps?.(model)} />
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
          title="Hapus model dari tier ini"
        >
          <span className="material-symbols-outlined text-base leading-none">delete</span>
        </button>
      </div>
    </div>
  );
}

SortableTierModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  model: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  onRemove: PropTypes.func.isRequired,
  getCaps: PropTypes.func,
};

export default function SmartRoutingSection({
  combo,
  strategy = {},
  onSetStrategy,
  onUpdateComboModels,
  activeProviders = [],
  getCaps,
}) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);

  // Modal State for Tier Reorder & Management
  const [activeTierModal, setActiveTierModal] = useState(null); // "easy" | "medium" | "hard" | null
  const [modalTierModels, setModalTierModels] = useState([]);
  const [showModelPickerModal, setShowModelPickerModal] = useState(false);
  const [quickInputModel, setQuickInputModel] = useState("");

  const judge = strategy.judgeModel || "";
  const policy = strategy.difficultyPolicy || "balanced";

  const easyModels = useMemo(() => Array.isArray(strategy.easyModels) ? strategy.easyModels : [], [strategy.easyModels]);
  const mediumModels = useMemo(() => Array.isArray(strategy.mediumModels) ? strategy.mediumModels : [], [strategy.mediumModels]);
  const hardModels = useMemo(() => Array.isArray(strategy.hardModels) ? strategy.hardModels : [], [strategy.hardModels]);

  const allTiersEmpty = easyModels.length === 0 && mediumModels.length === 0 && hardModels.length === 0;

  const getTierModels = (key) => {
    if (key === "easy") return easyModels;
    if (key === "medium") return mediumModels;
    if (key === "hard") return hardModels;
    return [];
  };

  const syncComboModels = (newEasy, newMed, newHard) => {
    if (!onUpdateComboModels) return;
    const combined = Array.from(new Set([...newEasy, ...newMed, ...newHard].filter(Boolean)));
    onUpdateComboModels(combined);
  };

  // Open modal for a tier
  const handleOpenTierModal = (tierKey) => {
    setActiveTierModal(tierKey);
    setModalTierModels([...getTierModels(tierKey)]);
    setQuickInputModel("");
  };

  // Apply modal changes
  const handleSaveTierModal = () => {
    if (!activeTierModal) return;
    const patch = { [`${activeTierModal}Models`]: modalTierModels };
    onSetStrategy(patch);

    const nextEasy = activeTierModal === "easy" ? modalTierModels : easyModels;
    const nextMed = activeTierModal === "medium" ? modalTierModels : mediumModels;
    const nextHard = activeTierModal === "hard" ? modalTierModels : hardModels;
    syncComboModels(nextEasy, nextMed, nextHard);
    setActiveTierModal(null);
  };

  // Drag sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Drag and drop reorder handler
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modalTierModels.indexOf(active.id);
    const newIndex = modalTierModels.indexOf(over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setModalTierModels(arrayMove(modalTierModels, oldIndex, newIndex));
    }
  };

  const handleAddQuickInputToModal = () => {
    const val = quickInputModel.trim();
    if (!val) return;
    const parts = val.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    const next = [...modalTierModels];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    setModalTierModels(next);
    setQuickInputModel("");
  };

  const handleRemoveFromModal = (index) => {
    const next = [...modalTierModels];
    next.splice(index, 1);
    setModalTierModels(next);
  };

  const handleAddFromBrowserModal = (modelValue) => {
    if (!modelValue || modalTierModels.includes(modelValue)) return;
    setModalTierModels((prev) => [...prev, modelValue]);
  };

  const handleRemoveFromBrowserModal = (modelValue) => {
    if (!modelValue) return;
    setModalTierModels((prev) => prev.filter((m) => m !== modelValue));
  };

  const handleAutoDistribute = () => {
    const models = Array.isArray(combo?.models) ? combo.models : [];
    if (models.length === 0) return;

    const easy = [];
    const medium = [];
    const hard = [];

    if (models.length === 1) {
      easy.push(models[0]);
    } else if (models.length === 2) {
      easy.push(models[0]);
      hard.push(models[1]);
    } else {
      const sliceSize = Math.ceil(models.length / 3);
      easy.push(...models.slice(0, sliceSize));
      medium.push(...models.slice(sliceSize, sliceSize * 2));
      hard.push(...models.slice(sliceSize * 2));
    }

    onSetStrategy({
      easyModels: easy,
      mediumModels: medium,
      hardModels: hard,
    });
    syncComboModels(easy, medium, hard);
  };

  const activeTierConfig = TIER_CONFIG.find((t) => t.key === activeTierModal);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/80 bg-bg-subtle/70 p-3 sm:p-4">
      {/* Judge & Policy Configuration Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Judge Model Control */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-text-main">Judge Model</span>
              <span className="text-[10px] text-text-muted hidden sm:inline">— Mengklasifikasikan kompleksitas task</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowJudgeSelect(true)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-xs font-medium text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                title="Pilih model judge"
              >
                <span className="material-symbols-outlined text-[13px]">gavel</span>
                <span className="truncate">{judge || "Auto — Model Pertama Combo"}</span>
                {judge ? <CapacityBadges caps={getCaps?.(judge)} /> : null}
              </button>
              {judge ? (
                <button
                  type="button"
                  onClick={() => onSetStrategy({ judgeModel: "" })}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title="Reset ke Auto"
                >
                  <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                  <span>Auto</span>
                </button>
              ) : (
                <span className="text-[11px] text-text-muted italic">(Pakai model ke-1 di combo)</span>
              )}
            </div>
          </div>
        </div>

        {/* Policy Selector */}
        <div className="flex flex-col gap-1 sm:border-l sm:border-border/60 sm:pl-4 sm:min-w-[220px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-text-main">Routing Policy</span>
            <span className="text-[10px] text-text-muted capitalize">{policy.replace("_", " ")}</span>
          </div>
          <select
            value={policy}
            onChange={(e) => onSetStrategy({ difficultyPolicy: e.target.value })}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            <option value="balanced">Balanced (Morph Matrix)</option>
            <option value="cost_efficient">Cost Efficient (Prioritas Murah/Cepat)</option>
            <option value="capability_heavy">Capability Heavy (Frontier/Penalaran Tinggi)</option>
          </select>
          <p className="text-[10px] text-text-muted leading-tight line-clamp-1" title={POLICY_DESCRIPTIONS[policy]}>
            {POLICY_DESCRIPTIONS[policy]}
          </p>
        </div>
      </div>

      {/* Auto-distribute Banner when tiers are empty */}
      {allTiersEmpty && combo?.models && combo.models.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">auto_fix_high</span>
            <div>
              <p className="font-semibold text-text-main">Distribusikan model yang sudah ada ke Tier</p>
              <p className="text-[11px] text-text-muted">
                Combo ini memiliki {combo.models.length} model. Bagi otomatis ke tier Easy, Medium, dan Hard?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoDistribute}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Auto-Distribute
          </button>
        </div>
      )}

      {/* 3-Tier Grid Overview Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-stretch">
        {TIER_CONFIG.map((tier) => {
          const tierModels = getTierModels(tier.key);

          return (
            <div
              key={tier.key}
              onClick={() => handleOpenTierModal(tier.key)}
              className={`group flex flex-col justify-between gap-3 rounded-xl border ${tier.cardBorder} ${tier.cardBg} p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tier.headerBg}`}>
                    <span className="material-symbols-outlined text-[18px]">{tier.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-text-main truncate">{tier.label}</span>
                      <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-text-muted">
                        {tierModels.length} model
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-text-muted truncate mt-0.5" title={tier.title}>
                      {tier.title}
                    </p>
                  </div>
                </div>

                <Button
                  size="xs"
                  variant="secondary"
                  icon="tune"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenTierModal(tier.key);
                  }}
                  className="shadow-2xs shrink-0"
                >
                  Pilih & Urutkan
                </Button>
              </div>

              <p className="text-[11px] text-text-muted/80 line-clamp-2 leading-relaxed">
                {tier.subtitle}
              </p>
            </div>
          );
        })}
      </div>

      {/* ─── DEDICATED MODAL: Pilih & Urutkan Model Tier (Drag & Drop System) ─── */}
      {activeTierModal && activeTierConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setActiveTierModal(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-white dark:bg-[#202020] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <div className="flex items-center gap-2.5">
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${activeTierConfig.headerBg}`}>
                  <span className="material-symbols-outlined text-[18px]">{activeTierConfig.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold text-text-main text-base flex items-center gap-2">
                    <span>Atur Model: {activeTierConfig.label}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-surface-3 text-text-muted">
                      {modalTierModels.length} model
                    </span>
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Tarik icon grip di samping nomor untuk memindahkan urutan prioritas. Nomor #1 dicoba pertama.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTierModal(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
              >
                <span className="material-symbols-outlined text-xl leading-none">close</span>
              </button>
            </div>

            {/* Quick Add Model Bar */}
            <div className="px-6 py-3 border-b border-border bg-white dark:bg-[#202020] flex items-center justify-between gap-3">
              <div className="flex-1 flex items-center gap-2">
                <Input
                  placeholder="Ketik nama model manual atau paste koma..."
                  value={quickInputModel}
                  onChange={(e) => setQuickInputModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddQuickInputToModal();
                    }
                  }}
                  className="text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon="add"
                  disabled={!quickInputModel.trim()}
                  onClick={handleAddQuickInputToModal}
                >
                  Tambah
                </Button>
              </div>

              <Button
                size="sm"
                variant="primary"
                icon="list"
                onClick={() => setShowModelPickerModal(true)}
                className="shadow-2xs shrink-0"
              >
                Pilih Dari Katalog
              </Button>
            </div>

            {/* Sortable List (Drag & Drop) */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-[#faf7f2] dark:bg-[#1a1a1a]">
              {modalTierModels.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-muted">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <span className="material-symbols-outlined text-4xl opacity-30 text-primary">drag_indicator</span>
                    <span className="font-semibold text-text-main">Belum Ada Model di Tier Ini</span>
                    <p className="text-xs text-text-muted">
                      Klik tombol &ldquo;Pilih Dari Katalog&rdquo; di atas untuk memasukkan model ke tier {activeTierConfig.shortLabel}.
                    </p>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                  <SortableContext items={modalTierModels} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {modalTierModels.map((model, index) => (
                        <SortableTierModelRow
                          key={model}
                          id={model}
                          model={model}
                          index={index}
                          onRemove={() => handleRemoveFromModal(index)}
                          getCaps={getCaps}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Modal Footer with OKE button */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-[#fbf9f6] dark:bg-[#282828]">
              <span className="text-xs text-text-muted">
                Total di tier: <span className="font-bold text-text-main text-sm">{modalTierModels.length}</span> model
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setActiveTierModal(null)}>
                  Batal
                </Button>
                <Button size="sm" variant="primary" icon="check" onClick={handleSaveTierModal} className="font-semibold shadow-sm">
                  Oke, Terapkan Urutan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Catalog Selector Modal */}
      {showModelPickerModal && activeTierModal && (
        <ModelSelectModal
          isOpen={showModelPickerModal}
          onClose={() => setShowModelPickerModal(false)}
          onSelect={(m) => handleAddFromBrowserModal(m?.value)}
          onDeselect={(m) => handleRemoveFromBrowserModal(m?.value)}
          activeProviders={activeProviders}
          title={`Pilih Model untuk ${activeTierConfig?.label}`}
          addedModelValues={modalTierModels}
          closeOnSelect={false}
        />
      )}

      {/* Judge Model Select Modal */}
      {showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m) => {
            onSetStrategy({ judgeModel: m?.value || "" });
            setShowJudgeSelect(false);
          }}
          activeProviders={activeProviders}
          title="Pilih Model Judge (Smart Routing)"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </div>
  );
}

SmartRoutingSection.propTypes = {
  combo: PropTypes.object,
  strategy: PropTypes.object,
  onSetStrategy: PropTypes.func.isRequired,
  onUpdateComboModels: PropTypes.func,
  activeProviders: PropTypes.array,
  getCaps: PropTypes.func,
};
