import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { cn } from "@/shared/utils/cn";
import { fmtNumber } from "./analyticsData";
import { ERROR_METADATA } from "./analyticsConstants";

export default function AnalyticsErrorDistribution({
  data,
  errorCategory,
  setErrorCategory,
}) {
  return (
    <Card
      title="Error Distribution & Root Causes"
      subtitle="Click any error category below to filter all metrics and models to that specific issue"
      icon="report_problem"
      padding="md"
    >
      {!data.errors.length ? (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400">
          <span className="material-symbols-outlined text-2xl">
            check_circle
          </span>
          <div>
            <h4 className="font-semibold text-sm">
              Zero Failures Recorded
            </h4>
            <p className="text-xs text-text-muted">
              All model requests in this period completed successfully.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted uppercase font-semibold">
                Total Failures:
              </span>
              <span className="text-sm font-bold text-danger font-mono">
                {fmtNumber(data.summary.failureCount)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                Failure rate:
              </span>
              <Badge variant="error" size="sm">
                {data.summary.totalEvents
                  ? `${(
                      (data.summary.failureCount /
                        data.summary.totalEvents) *
                      100
                    ).toFixed(1)}%`
                  : "0%"}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.errors.map((row) => {
              const meta =
                ERROR_METADATA[row.error_category] || ERROR_METADATA.unknown;
              const totalFailures = data.summary.failureCount || 1;
              const pct = (row.count / totalFailures) * 100;
              const isSelected = errorCategory === row.error_category;

              return (
                <button
                  type="button"
                  key={row.error_category}
                  onClick={() =>
                    setErrorCategory((prev) =>
                      prev === row.error_category
                        ? ""
                        : row.error_category,
                    )
                  }
                  className={cn(
                    "flex min-w-0 flex-col justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer group",
                    isSelected
                      ? "border-brand-500 bg-brand-500/10 shadow-sm ring-2 ring-brand-500/40"
                      : "border-border-subtle bg-surface-2/40 hover:bg-surface-2/80 hover:border-brand-500/30",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "material-symbols-outlined text-[18px] leading-none shrink-0 inline-flex items-center justify-center",
                            meta.color,
                          )}
                        >
                          {meta.icon}
                        </span>
                        <span className="font-semibold text-sm text-text-main break-words">
                          {meta.label}
                        </span>
                      </div>
                      <Badge
                        variant={isSelected ? "primary" : meta.variant}
                        size="sm"
                      >
                        {isSelected ? "Filtered" : row.error_category}
                      </Badge>
                    </div>

                    <div className="flex items-baseline justify-between gap-2 mt-2">
                      <span className="text-2xl font-bold font-mono text-text-main">
                        {fmtNumber(row.count)}
                      </span>
                      <span className="text-xs font-semibold text-text-muted">
                        {pct.toFixed(1)}%
                      </span>
                    </div>

                    <div className="w-full bg-border-subtle h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          meta.barColor,
                        )}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[11px] text-text-muted line-clamp-1">
                      {meta.description}
                    </p>
                    <span className="text-[11px] text-brand-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                      {isSelected ? "Remove filter" : "Filter"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
