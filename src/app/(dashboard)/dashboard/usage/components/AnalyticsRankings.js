import Card from "@/shared/components/Card";
import { rankModels, formatMetric } from "./analyticsData";

export default function AnalyticsRankings({ data, handleSelectModel }) {
  const modes = [
    [
      "fastest",
      "Fastest Models",
      "speed",
      `P50 latency (min. ${data.minSamples} samples)`,
    ],
    [
      "reliable",
      "Most Reliable",
      "verified",
      `Highest success rate (min. ${data.minSamples} samples)`,
    ],
    [
      "used",
      "Most Used",
      "trending_up",
      "Highest total routed requests",
    ],
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      {modes.map(([mode, title, icon, subtitle]) => {
        const ranked = rankModels(data.models, mode, data.minSamples);
        return (
          <Card
            key={mode}
            padding="sm"
            title={title}
            subtitle={subtitle}
            icon={icon}
            className="flex min-w-0 flex-col justify-between"
          >
            {!ranked.length ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border text-xs text-text-muted my-2">
                <span className="material-symbols-outlined text-sm">
                  info
                </span>
                <span>
                  Insufficient samples (min. {data.minSamples})
                </span>
              </div>
            ) : (
              <ol className="divide-y divide-border-subtle my-1">
                {ranked.slice(0, 5).map((row, idx) => (
                  <li
                    key={`${row.provider}/${row.model}`}
                    onClick={() =>
                      handleSelectModel(row.provider, row.model)
                    }
                    className="flex items-center justify-between py-2 gap-2 text-xs cursor-pointer hover:bg-surface-2/60 rounded px-1 -mx-1 transition-colors"
                    title="Click to zoom into this model"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-5 rounded-full bg-surface-2 flex items-center justify-center font-mono font-bold text-[10px] text-text-muted shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-text-main truncate hover:text-brand-500">
                          {row.model}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">
                          {row.provider}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-text-main shrink-0">
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
            )}
          </Card>
        );
      })}
    </div>
  );
}
