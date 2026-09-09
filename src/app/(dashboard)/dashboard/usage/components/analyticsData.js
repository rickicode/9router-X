export const MIN_SAMPLES = 30;
const metric = (v) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? null
    : Number(v);
export function normalizeAnalytics(payload) {
  if (
    !payload ||
    !Array.isArray(payload.byModel) ||
    !Array.isArray(payload.timeline)
  )
    throw new Error("Invalid analytics response");
  const normalize = (row) => ({
    ...row,
    requests: Number(row.count),
    successes: Number(row.success_count),
    failures: Number(row.failure_count),
    successRate: Number(row.count)
      ? Number(row.success_count) / Number(row.count)
      : null,
    latencyMs: metric(row.p50_latency_ms),
    latencySamples: Number(row.latency_samples ?? 0),
    p95: metric(row.p95_latency_ms),
    inputTokens: metric(row.total_input_tokens),
    outputTokens: metric(row.total_output_tokens),
    timestamp: row.bucket ? new Date(row.bucket).toLocaleString() : undefined,
  });
  return {
    summary: payload.summary,
    minSamples: payload.meta?.minSampleThreshold ?? MIN_SAMPLES,
    models: payload.byModel.map(normalize),
    series: payload.timeline.map(normalize),
    errors: payload.errorDistribution || [],
  };
}
export function rankModels(models, mode, minSamples = MIN_SAMPLES) {
  const key =
    mode === "fastest"
      ? "latencyMs"
      : mode === "reliable"
        ? "successRate"
        : "requests";
  return models
    .filter(
      (r) =>
        (mode === "used" || r.requests >= minSamples) &&
        r[key] != null &&
        (mode !== "fastest" || r.latencySamples >= minSamples),
    )
    .slice()
    .sort(
      (a, b) =>
        (mode === "fastest" ? a[key] - b[key] : b[key] - a[key]) ||
        `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`),
    );
}
export function analyticsUrl(
  { period, provider = "", model = "", errorCategory = "" },
  now = new Date(),
) {
  const end = new Date(now);
  let start = new Date(end);
  if (period === "today") start.setHours(0, 0, 0, 0);
  else
    start = new Date(
      end.getTime() -
        ({ "24h": 1, "7d": 7, "30d": 30, "60d": 60 }[period] ?? 7) * 86400000,
    );
  const params = new URLSearchParams({
    timeFrom: start.toISOString(),
    timeTo: end.toISOString(),
    timeBucket: end - start > 7 * 86400000 ? "1 day" : "1 hour",
  });
  if (provider && provider.trim()) params.set("provider", provider.trim());
  if (model && model.trim()) params.set("model", model.trim());
  if (errorCategory && errorCategory.trim())
    params.set("errorCategory", errorCategory.trim());
  return `/api/usage/analytics?${params}`;
}
export async function fetchAnalytics(filters, signal, fetcher = fetch) {
  const response = await fetcher(analyticsUrl(filters), {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Analytics request failed (${response.status})`);
  return normalizeAnalytics(await response.json());
}
export function formatMetric(value, kind) {
  if (value == null) return "No data";
  if (kind === "successRate") return `${(value * 100).toFixed(1)}%`;
  if (kind === "latencyMs") return `${Number(value).toFixed(0)} ms`;
  return Number(value).toLocaleString();
}

export const fmtNumber = (n) => new Intl.NumberFormat().format(Number(n) || 0);

export const fmtTokens = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
};
