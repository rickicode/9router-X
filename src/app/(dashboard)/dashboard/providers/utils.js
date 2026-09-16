export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "none", label: "No connection" },
];

// Header search input debounce — providers grid filters on the debounced
// value so every keystroke doesn't re-run all section filters/sorts.
export const SEARCH_DEBOUNCE_MS = 200;

// Case-insensitive substring match used by the providers grid. Pure helper
// so the debounce + filter contract is unit-testable without rendering.
export function matchesSearchQuery(name, query) {
  if (!query || !query.trim()) return true;
  if (!name) return false;
  return name.toLowerCase().includes(query.trim().toLowerCase());
}

// Stats badges render counts + short codes; upstream error strings can be
// arbitrarily long, so truncate display text (full text stays in `title`).
export function truncateErrorText(text, maxLength = 32) {
  if (text === null || text === undefined) return text;
  const s = String(text);
  if (s.length <= maxLength) return s;
  if (maxLength <= 1) return s.slice(0, maxLength);
  return `${s.slice(0, maxLength - 1)}…`;
}

// noAuth providers (e.g. free proxies) are always usable even though they
// never have a stored connection record, so they never fall into "none".
export function getConnectionStatus(stats, isNoAuth = false) {
  if (isNoAuth) return "active";
  if (!stats || stats.total === 0) return "none";
  return stats.allDisabled ? "inactive" : "active";
}

export function matchesStatusFilter(statusFilter, stats, isNoAuth = false) {
  if (statusFilter === "all") return true;
  return getConnectionStatus(stats, isNoAuth) === statusFilter;
}
