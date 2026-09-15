/**
 * Overview sub-tab definitions and resolver for /dashboard/usage
 * Only breakdown is a separate tab; everything else is unified under "overview" (topology + trends + live activity).
 */

export const OVERVIEW_SUBTABS = [
  { value: "breakdown", label: "Breakdown", icon: "table_chart" },
  { value: "overview", label: "Overview", icon: "dashboard" },
];

export const VALID_OVERVIEW_SUBTABS = OVERVIEW_SUBTABS.map((t) => t.value);

// Legacy subtab values (from previous 4-tab layout) — mapped to unified overview
const LEGACY_SUBTAB_MAP = {
  trends: "overview",
  topology: "overview",
  activity: "overview",
};

/**
 * Validates and resolves the active sub-tab for Usage Overview.
 * Falls back to 'breakdown' if invalid or undefined; legacy values map to 'overview'.
 *
 * @param {string|null|undefined} subtab
 * @param {string} [fallback="breakdown"]
 * @returns {string}
 */
export function resolveActiveSubTab(subtab, fallback = "breakdown") {
  if (typeof subtab === "string") {
    const v = subtab.trim();
    if (VALID_OVERVIEW_SUBTABS.includes(v)) return v;
    if (LEGACY_SUBTAB_MAP[v]) return LEGACY_SUBTAB_MAP[v];
  }
  return fallback;
}
