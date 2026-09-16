"use client";

import Card from "@/shared/components/Card";
import GlobalAnalyticsChart from "./GlobalAnalyticsChart";
import TopProvidersCard from "./TopProvidersCard";
import { useAnalytics } from "./useAnalytics";
import AnalyticsFilterBar from "./AnalyticsFilterBar";
import AnalyticsSummaryCards from "./AnalyticsSummaryCards";
import AnalyticsErrorDistribution from "./AnalyticsErrorDistribution";
import AnalyticsRankings from "./AnalyticsRankings";
import AnalyticsModelTable from "./AnalyticsModelTable";
import AnalyticsDrilldowns from "./AnalyticsDrilldowns";

export default function AnalyticsTab({ period }) {
  const analytics = useAnalytics(period);

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-6">
      {/* Header & Subtitle */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-500 text-2xl leading-none shrink-0 inline-flex items-center justify-center">
              monitoring
            </span>
            <h2 className="text-xl font-semibold text-text-main">
              Model Analytics
            </h2>
          </div>
          {analytics.data?.summary && (
            <span className="text-xs text-text-muted font-mono">
              Last updated: {new Date().toLocaleTimeString("en-US")}
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">
          New routed LLM attempts only. Retries count separately. Reliability
          and speed measure service performance, not answer quality. In-memory
          telemetry is best-effort; crashes or overload can drop events.
        </p>
      </div>

      {/* Filter Bar */}
      <AnalyticsFilterBar analytics={analytics} period={period} />

      {/* Loading & Error States */}
      {analytics.loading && (
        <Card
          padding="lg"
          className="flex items-center justify-center p-12 text-text-muted text-sm"
        >
          <span className="material-symbols-outlined animate-spin mr-2">
            progress_activity
          </span>
          Loading analytics…
        </Card>
      )}

      {analytics.error && (
        <Card
          padding="md"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-red-500/30 bg-red-500/5 text-red-500"
        >
          <p role="alert" className="font-medium text-sm">
            {analytics.error}
          </p>
          <button
            type="button"
            onClick={() => analytics.setRefresh((x) => x + 1)}
            className="px-3 py-1 text-xs font-semibold rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors"
          >
            Retry
          </button>
        </Card>
      )}

      {analytics.data && (
        <>
          <AnalyticsSummaryCards data={analytics.data} />

          {!analytics.data.models.length ? (
            <Card padding="lg" className="text-center">
              <p className="text-text-muted">
                No events recorded in this period. New requests will appear
                after recording starts.
              </p>
            </Card>
          ) : (
            <>
              <GlobalAnalyticsChart
                data={analytics.data.series}
                summary={analytics.data.summary}
                yesterdaySummary={analytics.data.yesterdaySummary}
              />

              <TopProvidersCard
                byProvider={analytics.data.byProvider || []}
                onProviderClick={(p) => analytics.handleProviderChange(p)}
              />

              <AnalyticsErrorDistribution
                data={analytics.data}
                errorCategory={analytics.errorCategory}
                setErrorCategory={analytics.setErrorCategory}
              />

              <AnalyticsRankings
                data={analytics.data}
                handleSelectModel={analytics.handleSelectModel}
              />

              <AnalyticsModelTable
                data={analytics.data}
                handleSelectModel={analytics.handleSelectModel}
              />

              <AnalyticsDrilldowns data={analytics.data} />
            </>
          )}
        </>
      )}
    </section>
  );
}
