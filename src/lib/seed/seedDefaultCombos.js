// Seed default combos into the DB on first boot.
//
// The "built-in" combos (core model families + general -latest + frontier
// open-weight) live as a SEED SOURCE ONLY. On startup we insert any combo
// whose name is not already present. The user can then edit/delete/rename
// them freely in /dashboard/combos — the seed never overwrites or resurrects
// a combo once it exists (deletion is respected permanently).
//
// smart-model (difficulty/smart-routing) additionally seeds its tier
// configuration into settings.comboStrategies — judge + easy/medium/hard
// lists. The settings entry is created only if the user hasn't defined one.
import { getComboByName, createCombo } from "@/lib/db/repos/combosRepo.js";
import { getSettings, updateSettings } from "@/lib/localDb.js";
import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

// Default smart-routing combo: judge classifies the prompt difficulty and
// only the chosen tier runs (one model at a time, escalate easy→medium→hard).
// Seeded only if "smart-model" doesn't exist yet; afterwards it's ordinary
// user-owned (editable lists / judge in /dashboard/combos).
const SMART_MODEL = {
  name: "smart-model",
  models: [
    "oc/mimo-v2.5-free",
    "openrouter/deepseek/deepseek-v4-flash-0731:free",
    "cline-free/z-ai/glm-5.3-flash",
    "cline-free/deepseek/deepseek-v4.1-flash",
    "oc/muse-spark-1.3-contributor-free",
    "claude-latest",
    "gpt-latest",
    "gemini-flash-latest",
  ],
  strategy: {
    fallbackStrategy: "difficulty",
    difficultyPolicy: "balanced",
    judgeModel: "cline-free/z-ai/glm-4.5",
    easyModels: [
      "oc/mimo-v2.5-free",
      "openrouter/deepseek/deepseek-v4-flash-0731:free",
    ],
    mediumModels: [
      "cline-free/z-ai/glm-5.3-flash",
      "cline-free/deepseek/deepseek-v4.1-flash",
      "oc/muse-spark-1.3-contributor-free",
    ],
    hardModels: [
      "claude-latest",
      "gpt-latest",
      "gemini-flash-latest",
    ],
  },
};

let seeded = false;

export async function seedDefaultCombos() {
  if (seeded) return;
  seeded = true;
  const results = [];
  try {
    const seeds = [
      ...Object.entries(CORE_MODEL_COMBOS),
      ...Object.entries(GENERAL_LATEST_COMBOS),
      [SMART_MODEL.name, SMART_MODEL.models],
    ];
    for (const [name, models] of seeds) {
      try {
        const existing = await getComboByName(name);
        if (existing) {
          results.push(`${name}:exists`);
          continue;
        }
        await createCombo({ name, kind: "llm", models });
        results.push(`${name}:created`);
      } catch (err) {
        console.error(`[Seed] combo "${name}" failed:`, err?.message || err);
        results.push(`${name}:error`);
      }
    }

    // smart-model tier config -> settings.comboStrategies (only if absent).
    try {
      const settings = await getSettings();
      const strategies = { ...(settings.comboStrategies || {}) };
      if (!strategies[SMART_MODEL.name]) {
        strategies[SMART_MODEL.name] = SMART_MODEL.strategy;
        await updateSettings({ comboStrategies: strategies });
        results.push("smart-model:strategy");
      } else {
        results.push("smart-model:strategy-exists");
      }
    } catch (err) {
      console.error("[Seed] smart-model strategy failed:", err?.message || err);
    }

    console.error(`[Seed] done: ${results.join(", ")}`);
  } catch (error) {
    console.error("[Seed] default combos failed:", error.message);
    seeded = false; // retry next boot
  }
}

export { SMART_MODEL };