// Seed default combos into the DB on first boot.
//
// The "built-in" combos (core model families + general -latest + frontier
// open-weight) live as a SEED SOURCE ONLY. On startup we insert any combo
// whose name is not already present. The user can then edit/delete/rename
// them freely in /dashboard/combos — the seed never overwrites or resurrects
// a combo once it exists (deletion is respected permanently).
import { getComboByName, createCombo } from "@/lib/db/repos/combosRepo.js";
import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

let seeded = false;

export async function seedDefaultCombos() {
  if (seeded) return;
  seeded = true;
  const results = [];
  try {
    const seeds = [
      ...Object.entries(CORE_MODEL_COMBOS),
      ...Object.entries(GENERAL_LATEST_COMBOS),
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
    console.error(`[Seed] done: ${results.join(", ")}`);
  } catch (error) {
    console.error("[Seed] default combos failed:", error.message);
    seeded = false; // retry next boot
  }
}