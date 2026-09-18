import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import { fmtNumber, formatMetric, fmtTokens } from "./analyticsData";

export default function AnalyticsModelTable({ data, handleSelectModel }) {
  return (
    <Card
      title="Model Performance Breakdown"
      subtitle="Click any row to filter timeline and metrics specifically for that model"
      icon="table_chart"
      padding="none"
      className="overflow-hidden"
    >
      <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
        <table className="data-table w-full min-w-[900px] text-left text-sm" aria-label="Model Performance Breakdown">
          <thead className="text-text-muted text-xs uppercase font-semibold">
            <tr>
              {[
                "Model & Provider",
                "Requests",
                "Success",
                "Failed",
                "Success Rate",
                "P50 Latency",
                "P95 Latency",
                "Input Tokens",
                "Output Tokens",
              ].map((v) => (
                <th scope="col" className="px-4 py-3" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.models.map((row) => (
              <tr
                key={`${row.provider}/${row.model}`}
                onClick={() =>
                  handleSelectModel(row.provider, row.model)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectModel(row.provider, row.model);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Filter by ${row.model} on ${row.provider}`}
                className="hover:bg-surface-2/60 transition-colors cursor-pointer group focus:outline-none focus:bg-surface-2/80"
                title="Click to zoom into this model"
              >
                <th scope="row" className="px-4 py-3 font-normal text-left">
                  <div className="font-semibold text-text-main group-hover:text-brand-500 transition-colors">
                    {row.model}
                  </div>
                  <div className="text-xs text-text-muted font-mono">
                    {row.provider}
                  </div>
                  {row.requests < data.minSamples && (
                    <span className="text-[10px] text-text-muted italic">
                      Insufficient samples
                    </span>
                  )}
                </th>
                <td className="px-4 py-3 font-mono">
                  {fmtNumber(row.requests)}
                </td>
                <td className="px-4 py-3 font-mono text-success">
                  {fmtNumber(row.successes)}
                </td>
                <td className="px-4 py-3 font-mono text-danger">
                  {fmtNumber(row.failures)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      row.successRate >= 0.98
                        ? "success"
                        : row.successRate >= 0.9
                          ? "warning"
                          : "error"
                    }
                    size="sm"
                  >
                    {formatMetric(row.successRate, "successRate")}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono">
                  {formatMetric(row.latencyMs, "latencyMs")}
                </td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {formatMetric(row.p95, "latencyMs")}
                </td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {row.inputTokens != null
                    ? fmtTokens(row.inputTokens)
                    : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-text-muted">
                  {row.outputTokens != null
                    ? fmtTokens(row.outputTokens)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
