"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  UsageStats,
  RequestLogger,
  CardSkeleton,
  SegmentedControl,
} from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";
import AnalyticsTab from "./components/AnalyticsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

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
    tabFromUrl &&
    ["overview", "logs", "details", "analytics"].includes(tabFromUrl)
      ? tabFromUrl
      : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + period selector on same row */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
          <SegmentedControl
            options={[
              { value: "overview", label: "Overview" },
              { value: "logs", label: "Logs" },
              { value: "details", label: "Details" },
              { value: "analytics", label: "Analytics" },
            ]}
            value={activeTab}
            onChange={handleTabChange}
            className="w-full sm:w-auto min-w-max"
          />
        </div>
        {(activeTab === "overview" || activeTab === "analytics") && (
          <div className="overflow-x-auto no-scrollbar pb-0.5 sm:pb-0 self-start sm:self-auto">
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="sm"
              className="w-full sm:w-auto min-w-max"
            />
          </div>
        )}
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
