import AnalyticsTrendChart from "./AnalyticsTrendChart";

export default function AnalyticsDrilldowns({ data }) {
 return (
 <div className="flex flex-col gap-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h3 className="text-sm font-semibold text-text-main">
 Metric Drilldowns
 </h3>
 <span className="text-xs text-text-muted">
 Individual component charts
 </span>
 </div>
 <div className="flex min-w-0 flex-col gap-3">
 <AnalyticsTrendChart
 title="Request volume"
 data={data.series}
 metricKey="requests"
 color="#60a5fa"
 unit="count"
 chartType="area"
 />
 <AnalyticsTrendChart
 title="Success rate"
 data={data.series}
 metricKey="successRate"
 color="#34d399"
 unit="successRate"
 />
 <AnalyticsTrendChart
 title="Successful latency P50"
 data={data.series}
 metricKey="latencyMs"
 color="#fbbf24"
 unit="latencyMs"
 />
 </div>
 </div>
 );
}
