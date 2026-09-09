"use client";
import { useEffect, useState } from "react";
import AnalyticsTrendChart from "./AnalyticsTrendChart";
import Card from "@/shared/components/Card";
import Input from "@/shared/components/Input";
import Button from "@/shared/components/Button";
import { fetchAnalytics, rankModels, formatMetric } from "./analyticsData";
export default function AnalyticsTab({ period }) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetchAnalytics({ period, provider, model }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, provider, model, refresh]);
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">Model Analytics</h2>
        <p className="text-sm text-text-muted">
          New routed LLM attempts only. Retries count separately. Reliability
          and speed measure service performance, not answer quality. In-memory
          telemetry is best-effort; crashes or overload can drop events.
        </p>
      </div>
      <Card padding="sm" className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Provider filter"
          placeholder="Provider (exact ID)"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Input
          aria-label="Model filter"
          placeholder="Model (exact ID)"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Button
          variant="secondary"
          className="rounded border border-border p-2"
          onClick={() => setRefresh((x) => x + 1)}
        >
          Refresh
        </Button>
      </Card>
      {loading && <p role="status">Loading analytics…</p>}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.summary.totalEvents} attempts · {data.summary.successCount}{" "}
            successful · {data.summary.failureCount} failed · Minimum{" "}
            {data.minSamples} successful latency samples for fastest ranking.
          </p>
          {!data.models.length ? (
            <p>
              No events recorded in this period. New requests will appear after
              recording starts.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["fastest", "Fastest (successful P50)"],
                  ["reliable", "Most reliable"],
                  ["used", "Most used"],
                ].map(([mode, title]) => (
                  <Card key={mode} padding="sm">
                    <h3 className="font-semibold">{title}</h3>
                    <ol>
                      {rankModels(data.models, mode, data.minSamples)
                        .slice(0, 5)
                        .map((row) => (
                          <li
                            key={`${row.provider}/${row.model}`}
                            className="my-2 break-words"
                          >
                            {row.provider}/{row.model}
                            <br />
                            <span className="text-sm text-text-muted">
                              {formatMetric(
                                row[
                                  mode === "fastest"
                                    ? "latencyMs"
                                    : mode === "reliable"
                                      ? "successRate"
                                      : "requests"
                                ],
                                mode === "fastest"
                                  ? "latencyMs"
                                  : mode === "reliable"
                                    ? "successRate"
                                    : "count",
                              )}
                            </span>
                          </li>
                        ))}
                    </ol>
                    {!rankModels(data.models, mode, data.minSamples).length && (
                      <p>Insufficient samples</p>
                    )}
                  </Card>
                ))}
              </div>
              <div className="flex min-w-0 flex-col gap-6">
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
              <Card padding="sm" className="min-w-0 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Provider / model",
                        "Requests",
                        "Success",
                        "Failed",
                        "Success rate",
                        "P50",
                        "P95",
                        "Input tokens",
                        "Output tokens",
                      ].map((v) => (
                        <th className="p-3" key={v}>
                          {v}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.models.map((row) => (
                      <tr
                        className="border-t border-border"
                        key={`${row.provider}/${row.model}`}
                      >
                        <td className="p-3">
                          {row.provider}/{row.model}
                          {row.requests < data.minSamples && (
                            <div className="text-text-muted">
                              Insufficient samples
                            </div>
                          )}
                        </td>
                        {[
                          row.requests,
                          row.successes,
                          row.failures,
                          formatMetric(row.successRate, "successRate"),
                          formatMetric(row.latencyMs, "latencyMs"),
                          formatMetric(row.p95, "latencyMs"),
                          row.inputTokens ?? "No data",
                          row.outputTokens ?? "No data",
                        ].map((v, i) => (
                          <td className="p-3" key={i}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div>
                <h3 className="font-semibold">Errors</h3>
                {data.errors.length ? (
                  data.errors.map((row) => (
                    <p key={row.error_category}>
                      {row.error_category}: {row.count}
                    </p>
                  ))
                ) : (
                  <p>No failures recorded</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
