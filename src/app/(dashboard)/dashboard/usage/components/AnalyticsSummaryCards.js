import Card from "@/shared/components/Card";
import { cn } from "@/shared/utils/cn";
import { fmtNumber, formatMetric, fmtTokens } from "./analyticsData";
import DeltaBadge from "./DeltaBadge";

function SummaryCard({
 label,
 icon,
 iconColor,
 value,
 valueColor,
 subtext,
 comparison,
 comparisonField,
 comparisonType,
 invertComparison,
 baselineLabel,
}) {
 return (
 <Card className="flex min-w-0 flex-col gap-1" padding="sm">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <span className="text-text-muted text-xs font-medium">
 {label}
 </span>
 <span
 className={cn(
 "material-symbols-outlined text-[18px] shrink-0 inline-flex items-center justify-center",
 iconColor,
 )}
 >
 {icon}
 </span>
 </div>
 <span
 className={cn(
 "truncate text-2xl font-semibold font-mono",
 valueColor,
 )}
 >
 {value}
 </span>
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <span className="text-[11px] text-text-muted truncate">
 {subtext}
 </span>
 {comparison && (
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className="text-[11px] text-text-muted">
 Yesterday:{" "}
 <span className="font-mono font-medium text-text-main">
 {comparison.yesterdayFormatted}
 </span>
 </span>
 <DeltaBadge
 diff={comparison.diff}
 pct={comparison.pct}
 unit={comparisonType === "latency" ? "ms" : comparisonType === "rate" ? "%" : ""}
 invert={invertComparison}
 label={baselineLabel}
 />
 </div>
 )}
 </div>
 </Card>
 );
}

export default function AnalyticsSummaryCards({ data }) {
 const { summary, comparison, models } = data;
 const baselineLabel = comparison?.baselineLabel || "vs yesterday";

 return (
 <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-3">
 <SummaryCard
 label="Total Attempts"
 icon="swap_calls"
 iconColor="text-text-muted"
 value={fmtNumber(summary.totalEvents)}
 valueColor="text-text-main"
 subtext={`${models.length} active models tracked`}
 comparison={comparison?.totalEvents}
 baselineLabel={baselineLabel}
 />

 <SummaryCard
 label="Success Rate"
 icon="verified"
 iconColor="text-success"
 value={`${summary.successRate}%`}
 valueColor="text-success"
 subtext={`${fmtNumber(summary.successCount)} successful attempts`}
 comparison={comparison?.successRate}
 comparisonType="rate"
 baselineLabel={baselineLabel}
 />

 <SummaryCard
 label="Failed Attempts"
 icon="error"
 iconColor="text-danger"
 value={fmtNumber(summary.failureCount)}
 valueColor={summary.failureCount > 0 ? "text-danger" : "text-text-muted"}
 subtext={
 summary.totalEvents
 ? `${((summary.failureCount / summary.totalEvents) * 100).toFixed(1)}% failure rate`
 : "0% failure rate"
 }
 comparison={comparison?.failureCount}
 invertComparison
 baselineLabel={baselineLabel}
 />

 <SummaryCard
 label="Median Latency"
 icon="speed"
 iconColor="text-warning"
 value={formatMetric(summary.p50LatencyMs, "latencyMs")}
 valueColor="text-warning"
 subtext={`P95: ${formatMetric(summary.p95LatencyMs, "latencyMs")}`}
 comparison={comparison?.p50LatencyMs}
 comparisonType="latency"
 invertComparison
 baselineLabel={baselineLabel}
 />

 <SummaryCard
 label="Total Tokens"
 icon="data_usage"
 iconColor="text-info"
 value={fmtTokens(summary.totalInputTokens + summary.totalOutputTokens)}
 valueColor="text-info"
 subtext={`In: ${fmtTokens(summary.totalInputTokens)} · Out: ${fmtTokens(summary.totalOutputTokens)}`}
 comparison={comparison?.totalTokens}
 baselineLabel={baselineLabel}
 />
 </div>
 );
}
