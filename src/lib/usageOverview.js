/**
 * Overview sub-tab definitions and resolver for /dashboard/usage
 */

export const OVERVIEW_SUBTABS = [
  { value: "breakdown", label: "Breakdown", icon: "table_chart" },
  { value: "trends", label: "Trends", icon: "show_chart" },
  { value: "topology", label: "Topology", icon: "hub" },
  { value: "activity", label: "Live Activity", icon: "sensors" },
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
