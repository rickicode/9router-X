"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CardSkeleton, SegmentedControl } from "@/shared/components";

const UsageStats = dynamic(() => import("@/shared/components/UsageStats"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const RequestLogger = dynamic(() => import("@/shared/components/RequestLogger"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const RequestDetailsTab = dynamic(() => import("./components/RequestDetailsTab"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const AnalyticsTab = dynamic(() => import("./components/AnalyticsTab"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "analytics", label: "Analytics" },
  { value: "details", label: "Request Details" },
  { value: "logs", label: "Request Logs" },
];

const TAB_COPY = {
  overview: {
    title: "Usage Overview",
    body: "Requests, token volume, and estimated cost across every routed model. Switch the period to compare today against the last 7, 30, or 60 days.",
  },
  analytics: {
    title: "Reliability & Speed",
    body: "New routed LLM attempts only. Retries count separately. Reliability and latency describe service performance, not answer quality.",
  },
  details: {
    title: "Request Details",
    body: "Inspect a single request: provider, model, tokens, latency, and the upstream error when one was returned.",
  },
  logs: {
    title: "Request Logs",
    body: "Live request stream captured by the gateway. Filter by status to find failures without leaving the dashboard.",
  },
};

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const activeTab =
    tabFromUrl && ["overview", "logs", "details", "analytics"].includes(tabFromUrl)
      ? tabFromUrl
      : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const copy = TAB_COPY[activeTab];
  const showPeriod = activeTab === "overview" || activeTab === "analytics";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-base font-semibold tracking-tight text-text-main">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        {showPeriod && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] font-medium uppercase tracking-wide text-text-muted sm:inline">
              Period
            </span>
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="sm"
              className="min-w-max"
            />
          </div>
        )}
      </div>

      <div className="w-full min-w-0 overflow-x-auto no-scrollbar">
        <SegmentedControl
          options={TABS}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full min-w-max sm:w-auto"
        />
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats
            period={period}
            setPeriod={setPeriod}
            hidePeriodSelector
            subtab={searchParams.get("subtab") || undefined}
          />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
      {activeTab === "analytics" && <AnalyticsTab period={period} />}
    </div>
  );
}
