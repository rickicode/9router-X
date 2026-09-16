import Card from "@/shared/components/Card";
import Combobox from "@/shared/components/Combobox";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import {
  TIME_BUCKETS,
  defaultTimeBucket,
} from "./analyticsData";
import { ERROR_METADATA } from "./analyticsConstants";

export default function AnalyticsFilterBar({ analytics, period }) {
  const {
    provider, setProvider,
    model, setModel,
    errorCategory, setErrorCategory,
    autoRefreshInterval, setAutoRefreshInterval,
    timeBucket, setTimeBucket,
    data, loading, loadingOptions,
    providerValidation, modelValidation,
    providerOptions, modelOptions,
    hasActiveFilters,
    handleProviderChange, handleModelChange,
    handleExportCsv, setRefresh,
  } = analytics;

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 w-full items-center gap-2 sm:flex-1 sm:min-w-[180px]">
          <Combobox
            id="analytics-provider-filter"
            aria-label="Provider filter"
            placeholder="All Providers"
            value={provider}
            onChange={handleProviderChange}
            options={providerOptions}
            icon="cloud"
            allowCustom
            clearable
            loading={loadingOptions}
            error={
              providerValidation.valid
                ? undefined
                : providerValidation.error
            }
            className="w-full"
          />
        </div>
        <div className="flex min-w-0 w-full items-center gap-2 sm:flex-1 sm:min-w-[180px]">
          <Combobox
            id="analytics-model-filter"
            aria-label="Model filter"
            placeholder="All Models"
            value={model}
            onChange={handleModelChange}
            options={modelOptions}
            icon="psychology"
            allowCustom
            clearable
            loading={loadingOptions}
            error={
              modelValidation.valid ? undefined : modelValidation.error
            }
            className="w-full"
          />
        </div>

        {/* Granularity */}
        <div className="flex items-center gap-1 bg-surface-2 rounded-[10px] p-1 border border-border-subtle">
          <span className="material-symbols-outlined text-[16px] text-text-muted ml-1.5">
            schedule
          </span>
          <select
            value={timeBucket}
            onChange={(e) => setTimeBucket(e.target.value)}
            className="bg-transparent text-xs text-text-main font-medium py-1 px-1.5 outline-none cursor-pointer"
            aria-label="Timeline granularity"
          >
            <option value="">
              Auto ({defaultTimeBucket(period)})
            </option>
            {TIME_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Refresh */}
        <div className="flex items-center gap-1 bg-surface-2 rounded-[10px] p-1 border border-border-subtle">
          <span className="material-symbols-outlined text-[16px] text-text-muted ml-1.5">
            timer
          </span>
          <select
            value={autoRefreshInterval}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className="bg-transparent text-xs text-text-main font-medium py-1 px-1.5 outline-none cursor-pointer"
            aria-label="Auto refresh interval"
          >
            <option value={0}>Auto: Off</option>
            <option value={15}>Auto: 15s</option>
            <option value={30}>Auto: 30s</option>
            <option value={60}>Auto: 60s</option>
          </select>
          {autoRefreshInterval > 0 && (
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
          )}
        </div>

        {/* Export CSV */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportCsv}
          disabled={!data?.models?.length}
          className="rounded-[10px] border border-border p-2 px-3 text-xs"
          title="Download CSV report"
        >
          <span className="material-symbols-outlined text-[16px] mr-1">
            download
          </span>
          CSV
        </Button>

        {/* Refresh */}
        <Button
          variant="secondary"
          className="rounded-[10px] border border-border p-2 px-4"
          onClick={() => setRefresh((x) => x + 1)}
        >
          <span
            className={cn(
              "material-symbols-outlined text-[18px] mr-1",
              loading && "animate-spin",
            )}
          >
            refresh
          </span>
          Refresh
        </Button>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle text-xs">
          <span className="text-text-muted font-medium">Active filters:</span>
          {provider && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 text-text-main border border-border [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
              Provider: <strong>{provider}</strong>
              <button
                type="button"
                onClick={() => setProvider("")}
                className="hover:text-danger ml-0.5"
                aria-label="Remove provider filter"
              >
                <span className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            </span>
          )}
          {model && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 text-text-main border border-border [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
              Model: <strong>{model}</strong>
              <button
                type="button"
                onClick={() => setModel("")}
                className="hover:text-danger ml-0.5"
                aria-label="Remove model filter"
              >
                <span className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            </span>
          )}
          {errorCategory && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 [&>strong]:min-w-0 [&>strong]:[overflow-wrap:anywhere] [&>button]:shrink-0">
              Error:{" "}
              <strong>
                {ERROR_METADATA[errorCategory]?.label || errorCategory}
              </strong>
              <button
                type="button"
                onClick={() => setErrorCategory("")}
                className="hover:text-danger ml-0.5"
                aria-label="Remove error category filter"
              >
                <span className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setProvider("");
              setModel("");
              setErrorCategory("");
            }}
            className="text-text-muted hover:text-danger underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </Card>
  );
}
