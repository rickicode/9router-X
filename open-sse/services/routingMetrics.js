/**
 * In-process routing counters — the four numbers that prove routing health:
 * upstream attempts per client request, capability auto-switch overrides,
 * rotation-budget exhaustions, and fusion panel orphans (aborted stragglers).
 * No behavior change: pure observation. Process-local (gauges reset on
 * restart); for fleet-wide views scrape /api/health per instance.
 */
const counters = {
  upstreamAttempts: 0,
  comboRequests: 0,
  autoSwitchOverrides: 0,
  rotationBudgetExhaustions: 0,
  failoverDemotions: 0,
  stillbornStreams: 0,
  panelOrphansAborted: 0,
  qualityGateTrips: 0,
};

export function bumpRoutingMetric(name, by = 1) {
  if (counters[name] === undefined) return;
  counters[name] += by;
}

export function getRoutingMetrics() {
  return {
    ...counters,
    avgUpstreamAttemptsPerCombo: counters.comboRequests > 0
      ? +(counters.upstreamAttempts / counters.comboRequests).toFixed(2)
      : 0,
  };
}
