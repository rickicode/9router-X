"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { ModelSelectModal, CapacityBadges } from "@/shared/components";

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
    placeholder: "e.g. oc/mimo-v2.5-free, deepseek-flash",
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
    placeholder: "e.g. cline-free/z-ai/glm-5.3-flash",
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
    placeholder: "e.g. claude-latest, gpt-latest",
  },
];

const POLICY_DESCRIPTIONS = {
  balanced: "Judges task complexity and routes according to Morph confidence matrix. Balances cost, latency, and quality.",
  cost_efficient: "Aggressively routes toward Easy and Medium tiers. Only escalates to Hard when strictly required.",
  capability_heavy: "Biases toward Frontier / Hard models for tasks requiring maximum intelligence and reasoning depth.",
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
  const [tierEditor, setTierEditor] = useState(null); // "easy" | "medium" | "hard" | null
  const [quickInputs, setQuickInputs] = useState({ easy: "", medium: "", hard: "" });

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

  const handleUpdateTierList = (tierKey, nextList) => {
    const patch = { [`${tierKey}Models`]: nextList };
    onSetStrategy(patch);

    const nextEasy = tierKey === "easy" ? nextList : easyModels;
    const nextMed = tierKey === "medium" ? nextList : mediumModels;
    const nextHard = tierKey === "hard" ? nextList : hardModels;
    syncComboModels(nextEasy, nextMed, nextHard);
  };

  const handleMoveUp = (tierKey, index) => {
    if (index === 0) return;
    const current = [...getTierModels(tierKey)];
    [current[index - 1], current[index]] = [current[index], current[index - 1]];
    handleUpdateTierList(tierKey, current);
  };

  const handleMoveDown = (tierKey, index) => {
    const current = [...getTierModels(tierKey)];
    if (index >= current.length - 1) return;
    [current[index], current[index + 1]] = [current[index + 1], current[index]];
    handleUpdateTierList(tierKey, current);
  };

  const handleRemoveModel = (tierKey, index) => {
    const current = [...getTierModels(tierKey)];
    current.splice(index, 1);
    handleUpdateTierList(tierKey, current);
  };

  const handleMoveToTier = (fromTier, toTier, modelValue) => {
    if (fromTier === toTier || !modelValue) return;
    const source = getTierModels(fromTier).filter((m) => m !== modelValue);
    const dest = [...getTierModels(toTier)];
    if (!dest.includes(modelValue)) {
      dest.push(modelValue);
    }

    const patch = {
      [`${fromTier}Models`]: source,
      [`${toTier}Models`]: dest,
    };
    onSetStrategy(patch);

    const nextEasy = fromTier === "easy" ? source : toTier === "easy" ? dest : easyModels;
    const nextMed = fromTier === "medium" ? source : toTier === "medium" ? dest : mediumModels;
    const nextHard = fromTier === "hard" ? source : toTier === "hard" ? dest : hardModels;
    syncComboModels(nextEasy, nextMed, nextHard);
  };

  const handleAddQuickInput = (tierKey) => {
    const raw = quickInputs[tierKey] || "";
    const items = raw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (items.length === 0) return;

    const current = [...getTierModels(tierKey)];
    for (const item of items) {
      if (!current.includes(item)) {
        current.push(item);
      }
    }

    handleUpdateTierList(tierKey, current);
    setQuickInputs((prev) => ({ ...prev, [tierKey]: "" }));
  };

  const handleAddFromModal = (tierKey, modelValue) => {
    if (!modelValue) return;
    const current = [...getTierModels(tierKey)];
    if (current.includes(modelValue)) return;
    current.push(modelValue);
    handleUpdateTierList(tierKey, current);
  };

  const handleRemoveFromModal = (tierKey, modelValue) => {
    if (!modelValue) return;
    const current = getTierModels(tierKey).filter((m) => m !== modelValue);
    handleUpdateTierList(tierKey, current);
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
              <span className="text-[10px] text-text-muted hidden sm:inline">— Classifies prompt difficulty on ambiguous turns</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowJudgeSelect(true)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-xs font-medium text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                title="Select judge model"
              >
                <span className="material-symbols-outlined text-[13px]">gavel</span>
                <span className="truncate">{judge || "Auto — First Available Model"}</span>
                {judge ? <CapacityBadges caps={getCaps?.(judge)} /> : null}
              </button>
              {judge ? (
                <button
                  type="button"
                  onClick={() => onSetStrategy({ judgeModel: "" })}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title="Reset to Auto"
                >
                  <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                  <span>Auto</span>
                </button>
              ) : (
                <span className="text-[11px] text-text-muted italic">(Uses 1st model in combo)</span>
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
            <option value="cost_efficient">Cost Efficient (Cheaper)</option>
            <option value="capability_heavy">Capability Heavy (Frontier)</option>
          </select>
          <p className="text-[10px] text-text-muted leading-tight line-clamp-1" title={POLICY_DESCRIPTIONS[policy]}>
            {POLICY_DESCRIPTIONS[policy]}
          </p>
        </div>
      </div>

      {/* Auto-distribute Banner when tiers are empty but combo has models */}
      {allTiersEmpty && combo?.models && combo.models.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">auto_fix_high</span>
            <div>
              <p className="font-semibold text-text-main">Populate tiers from existing models</p>
              <p className="text-[11px] text-text-muted">
                This combo has {combo.models.length} models ready. Auto-distribute them across Easy, Medium, and Hard tiers?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoDistribute}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Auto-Distribute
          </button>
        </div>
      )}

      {/* 3-Tier Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-start">
        {TIER_CONFIG.map((tier) => {
          const tierModels = getTierModels(tier.key);
          const otherTiers = TIER_CONFIG.filter((t) => t.key !== tier.key);

          return (
            <div
              key={tier.key}
              className={`flex flex-col gap-2.5 rounded-xl border ${tier.cardBorder} ${tier.cardBg} p-3 shadow-2xs transition-all`}
            >
              {/* Tier Header */}
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${tier.headerBg}`}>
                    <span className="material-symbols-outlined text-[16px]">{tier.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-text-main truncate">{tier.label}</span>
                      <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-text-muted">
                        {tierModels.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-muted truncate leading-tight" title={tier.subtitle}>
                      {tier.title}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTierEditor(tier.key)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-dashed border-primary/40 bg-surface px-2 py-0.5 text-[11px] font-medium text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                  title={`Browse available models for ${tier.label}`}
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  <span>Browse</span>
                </button>
              </div>

              {/* Models List in Tier */}
              {tierModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-surface/50 p-4 text-center">
                  <span className="material-symbols-outlined text-text-muted/40 text-[24px] mb-1">
                    {tier.icon}
                  </span>
                  <p className="text-xs font-medium text-text-muted">No models in {tier.shortLabel}</p>
                  <p className="text-[10px] text-text-muted/70 mt-0.5 mb-2.5">
                    Add models to run when task is classified as {tier.shortLabel.toLowerCase()}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTierEditor(tier.key)}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    Select Models
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-0.5">
                  {tierModels.map((model, index) => (
                    <div
                      key={`${model}-${index}`}
                      className="group flex flex-col gap-1.5 rounded-lg border border-border/70 bg-surface p-2 shadow-2xs transition-all hover:border-border hover:shadow-xs"
                    >
                      {/* Top Row: Priority rank + Model Name + Remove */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span
                            className="flex size-4.5 shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/10 font-mono text-[10px] font-bold text-text-muted"
                            title={`Priority #${index + 1}: Tries first, escalates to next on fail`}
                          >
                            #{index + 1}
                          </span>
                          <code className="truncate font-mono text-xs font-medium text-text-main" title={model}>
                            {model}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveModel(tier.key, index)}
                          className="shrink-0 p-0.5 rounded text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Remove model from tier"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>

                      {/* Bottom Row: Capabilities + Reorder & Move Controls */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40 text-[11px]">
                        <div className="flex items-center gap-1 min-w-0">
                          <CapacityBadges caps={getCaps?.(model)} />
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* Up */}
                          <button
                            type="button"
                            onClick={() => handleMoveUp(tier.key, index)}
                            disabled={index === 0}
                            className={`p-0.5 rounded transition-colors ${
                              index === 0
                                ? "text-text-muted/20 cursor-not-allowed"
                                : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                            title="Move up in priority"
                          >
                            <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
                          </button>
                          {/* Down */}
                          <button
                            type="button"
                            onClick={() => handleMoveDown(tier.key, index)}
                            disabled={index === tierModels.length - 1}
                            className={`p-0.5 rounded transition-colors ${
                              index === tierModels.length - 1
                                ? "text-text-muted/20 cursor-not-allowed"
                                : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                            title="Move down in priority"
                          >
                            <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                          </button>

                          {/* Move to another tier */}
                          {otherTiers.map((other) => {
                            const isLeft = (tier.key === "medium" && other.key === "easy") || (tier.key === "hard");
                            const label = other.key === "easy" ? "← Easy" : other.key === "medium" ? (tier.key === "easy" ? "Med →" : "← Med") : "Hard →";
                            return (
                              <button
                                key={other.key}
                                type="button"
                                onClick={() => handleMoveToTier(tier.key, other.key, model)}
                                className="inline-flex items-center rounded px-1 py-0.2 text-[10px] font-medium text-text-muted hover:text-primary hover:bg-primary/5 transition-colors border border-transparent hover:border-border"
                                title={`Move to ${other.label}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Input Bar */}
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={quickInputs[tier.key] || ""}
                  onChange={(e) => setQuickInputs({ ...quickInputs, [tier.key]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddQuickInput(tier.key);
                    }
                  }}
                  placeholder="Type model or paste comma-separated..."
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-mono text-text-main placeholder:text-text-muted/50 placeholder:font-sans focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => handleAddQuickInput(tier.key)}
                  disabled={!quickInputs[tier.key]?.trim()}
                  className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  title="Add entered model(s) to this tier"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
          title="Select Judge Model (Smart Routing)"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}

      {/* Tier Model Select Modal */}
      {tierEditor && (
        <ModelSelectModal
          isOpen={!!tierEditor}
          onClose={() => setTierEditor(null)}
          onSelect={(m) => handleAddFromModal(tierEditor, m?.value)}
          onDeselect={(m) => handleRemoveFromModal(tierEditor, m?.value)}
          activeProviders={activeProviders}
          title={`Select Models for ${tierEditor.toUpperCase()} Tier`}
          addedModelValues={getTierModels(tierEditor)}
          closeOnSelect={false}
        />
      )}
    </div>
  );
}

SmartRoutingSection.propTypes = {
  combo: PropTypes.object.isRequired,
  strategy: PropTypes.object,
  onSetStrategy: PropTypes.func.isRequired,
  onUpdateComboModels: PropTypes.func,
  activeProviders: PropTypes.array,
  getCaps: PropTypes.func,
};