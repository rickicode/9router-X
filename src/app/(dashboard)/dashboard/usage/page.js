"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
 CardSkeleton,
 SegmentedControl,
} from "@/shared/components";

// Dynamic imports for heavy tabs to optimize LCP and initial bundle size
const UsageStats = dynamic(
 () => import("@/shared/components/UsageStats"),
 {
 ssr: false,
 loading: () => <CardSkeleton />,
 }
);

const RequestLogger = dynamic(
 () => import("@/shared/components/RequestLogger"),
 {
 ssr: false,
 loading: () => <CardSkeleton />,
 }
);

const RequestDetailsTab = dynamic(
 () => import("./components/RequestDetailsTab"),
 {
 ssr: false,
 loading: () => <CardSkeleton />,
 }
);

const AnalyticsTab = dynamic(
 () => import("./components/AnalyticsTab"),
 {
 ssr: false,
 loading: () => <CardSkeleton />,
 }
);

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
 <div className="flex min-w-0 flex-col gap-3">
 {/* Tabs pinned left · period selector pinned right (same row on desktop) */}
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0 max-w-full">
 <div className="w-full max-w-full min-w-0 overflow-x-auto no-scrollbar tab-scroll-fade pb-0.5 sm:pb-0 sm:shrink-0">
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
 <div className="flex w-full max-w-full min-w-0 overflow-x-auto no-scrollbar tab-scroll-fade pb-0.5 sm:pb-0 sm:ml-auto sm:justify-end">
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
