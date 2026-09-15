/**
 * Overview sub-tab definitions and resolver for /dashboard/usage
 * Only breakdown is a separate tab; everything else is unified under "overview" (topology + trends + live activity).
 */

export const OVERVIEW_SUBTABS = [
  { value: "breakdown", label: "Breakdown", icon: "table_chart" },
  { value: "overview", label: "Overview", icon: "dashboard" },
];

export const VALID_OVERVIEW_SUBTABS = OVERVIEW_SUBTABS.map((t) => t.value);

/**
 * Validates and resolves the active sub-tab for Usage Overview.
 * Falls back to 'breakdown' if invalid or undefined.
 *
 * @param {string|null|undefined} subtab
 * @param {string} [fallback="breakdown"]
 * @returns {string}
 */
export function resolveActiveSubTab(subtab, fallback = "breakdown") {
  if (typeof subtab === "string" && VALID_OVERVIEW_SUBTABS.includes(subtab.trim())) {
    return subtab.trim();
  }
  return fallback;
}
