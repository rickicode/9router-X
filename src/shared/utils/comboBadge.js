import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

export const BUILTIN_COMBO_NAMES = new Set([
  ...Object.keys(CORE_MODEL_COMBOS || {}),
  ...Object.keys(GENERAL_LATEST_COMBOS || {}),
  "smart-model",
]);

export function isBuiltinCombo(combo) {
  const name = (typeof combo === "string" ? combo : combo?.name || "").trim().toLowerCase();
  if (!name) return false;
  if (BUILTIN_COMBO_NAMES.has(name)) return true;
  if (name.endsWith("-latest")) return true;
  if (name === "gemini-flash" || name === "gemini-pro" || name === "claude" || name === "gpt") return true;
  return false;
}

export function getComboBadge(combo, strategy = null) {
  const name = typeof combo === "string" ? combo : combo?.name || "";
  const kind = typeof combo === "object" ? combo?.kind : null;
  const strat = strategy || (typeof combo === "object" ? combo?.strategy : null);

  const isDifficulty = strat?.fallbackStrategy === "difficulty" || name === "smart-model";
  const isFusion = strat?.fallbackStrategy === "fusion";
  const isWebSearch = kind === "webSearch";
  const isWebFetch = kind === "webFetch";
  const isBuiltin = isBuiltinCombo(combo);

  if (isDifficulty) {
    return {
      icon: "auto_awesome",
      label: "Smart Routing",
      type: "difficulty",
      bg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-500/20",
      title: "Smart Routing Combo",
    };
  }

  if (isFusion) {
    return {
      icon: "hub",
      label: "Fusion",
      type: "fusion",
      bg: "bg-purple-500/10",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-500/20",
      title: "Fusion Combo",
    };
  }

  if (isWebSearch) {
    return {
      icon: "travel_explore",
      label: "Web Search",
      type: "webSearch",
      bg: "bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/20",
      title: "Web Search Combo",
    };
  }

  if (isWebFetch) {
    return {
      icon: "public",
      label: "Web Fetch",
      type: "webFetch",
      bg: "bg-cyan-500/10",
      text: "text-cyan-600 dark:text-cyan-400",
      border: "border-cyan-500/20",
      title: "Web Fetch Combo",
    };
  }

  if (isBuiltin) {
    return {
      icon: "verified",
      label: "Preset",
      type: "preset",
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
      title: "Built-in Preset Combo",
    };
  }

  return {
    icon: "person",
    label: "Custom",
    type: "custom",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/20",
    title: "Custom Combo",
  };
}
