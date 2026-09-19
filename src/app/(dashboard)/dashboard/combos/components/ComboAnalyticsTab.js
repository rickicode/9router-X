"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardSkeleton, SegmentedControl } from "@/shared/components";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

function pct(success, total) {
  if (!total) return "—";
  return `${Math.round((success / total) * 100)}%`;
}

function HealthDot({ success, total }) {
  if (!total) return null;
  const rate = success / total;
  const color = rate >= 0.9 ? "bg-green-500" : rate >= 0.6 ? "bg-yellow-500" : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />;
}

export default function ComboAnalyticsTab() {
  const [period, setPeriod] = useState("today");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/combos/analytics?period=${period}`)
      .then((r) => (r.ok ? r.json() : { combos: [], members: [] }))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ combos: [], members: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const combos = data?.combos || [];
  const members = data?.members || [];
  const difficulty = data?.difficulty || [];
  const difficultyModels = data?.difficultyModels || [];
  const membersByCombo = {};
  for (const m of members) {
    (membersByCombo[m.comboName] ||= []).push(m);
  }
  const difficultyByCombo = {};
  for (const d of difficulty) {
    (difficultyByCombo[d.comboName] ||= []).push(d);
  }
  const difficultyModelsByCombo = {};
  for (const dm of difficultyModels) {
    (difficultyModelsByCombo[dm.comboName] ||= []).push(dm);
  }

  // Aggregate model usage across all smart combos
  const smartModelStats = useMemo(() => {
    if (!difficultyModels.length) return null;
    const modelMap = {};
    const comboMap = {};
    let totalSmartRequests = 0;

    for (const dm of difficultyModels) {
      totalSmartRequests += dm.total;

      if (!modelMap[dm.model]) {
        modelMap[dm.model] = {
          model: dm.model,
          total: 0,
          success: 0,
          errors: 0,
          combos: new Set(),
          tiers: new Set(),
        };
      }
      modelMap[dm.model].total += dm.total;
      modelMap[dm.model].success += dm.success;
      modelMap[dm.model].errors += dm.errors;
      if (dm.comboName) modelMap[dm.model].combos.add(dm.comboName);
      if (dm.tier) modelMap[dm.model].tiers.add(dm.tier);

      if (!comboMap[dm.comboName]) {
        comboMap[dm.comboName] = { total: 0, models: {} };
      }
      comboMap[dm.comboName].total += dm.total;
      comboMap[dm.comboName].models[dm.model] = (comboMap[dm.comboName].models[dm.model] || 0) + dm.total;
    }

    const sortedModels = Object.values(modelMap).sort((a, b) => b.total - a.total);
    const topModel = sortedModels[0] || null;

    // Find top model per tier
    const tierTop = { easy: null, medium: null, hard: null };
    for (const tierKey of ["easy", "medium", "hard"]) {
      const tierRows = difficultyModels.filter((dm) => dm.tier === tierKey);
      if (tierRows.length > 0) {
        const tierModels = {};
        for (const r of tierRows) {
          tierModels[r.model] = (tierModels[r.model] || 0) + r.total;
        }
        const topInTier = Object.entries(tierModels).sort((a, b) => b[1] - a[1])[0];
        if (topInTier) {
          tierTop[tierKey] = { model: topInTier[0], count: topInTier[1] };
        }
      }
    }

    return {
      total: totalSmartRequests,
      topModel,
      sortedModels,
      tierTop,
      comboMap,
    };
  }, [difficultyModels]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Period selector pinned right */}
      <div className="flex w-full items-center justify-end">
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} size="sm" className="min-w-max" />
      </div>

      {combos.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">monitoring</span>
            </div>
            <p className="text-text-main font-medium mb-1">No combo traffic yet</p>
            <p className="text-sm text-text-muted">Combo member attempts will appear here once requests flow through combos.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Smart Routing Model Insights Banner */}
          {smartModelStats && smartModelStats.total > 0 && (
            <Card padding="sm" className="border-emerald-500/25 bg-emerald-500/[0.02]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-text-main">Smart Combo Model Usage</h3>
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {smartModelStats.total} calls
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted">
                        Breakdown of models selected & executed across prompt difficulty tiers
                      </p>
                    </div>
                  </div>
                  {smartModelStats.topModel && (
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-text-muted block">Most Used Overall</span>
                      <code className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        {smartModelStats.topModel.model} ({smartModelStats.topModel.total}× · {pct(smartModelStats.topModel.total, smartModelStats.total)})
                      </code>
                    </div>
                  )}
                </div>

                {/* Metric Highlights: Leader per Tier */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-emerald-500/20 bg-surface p-2.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Easy Tier Leader</span>
                      <span className="material-symbols-outlined text-[14px] text-emerald-500">bolt</span>
                    </div>
                    {smartModelStats.tierTop.easy ? (
                      <div>
                        <code className="block text-xs font-mono font-medium text-text-main truncate" title={smartModelStats.tierTop.easy.model}>
                          {smartModelStats.tierTop.easy.model}
                        </code>
                        <span className="text-[10px] text-text-muted">{smartModelStats.tierTop.easy.count} requests</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic">No traffic yet</span>
                    )}
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-surface p-2.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">Medium Tier Leader</span>
                      <span className="material-symbols-outlined text-[14px] text-amber-500">psychology</span>
                    </div>
                    {smartModelStats.tierTop.medium ? (
                      <div>
                        <code className="block text-xs font-mono font-medium text-text-main truncate" title={smartModelStats.tierTop.medium.model}>
                          {smartModelStats.tierTop.medium.model}
                        </code>
                        <span className="text-[10px] text-text-muted">{smartModelStats.tierTop.medium.count} requests</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic">No traffic yet</span>
                    )}
                  </div>

                  <div className="rounded-lg border border-rose-500/20 bg-surface p-2.5">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-rose-600 dark:text-rose-400">Hard Tier Leader</span>
                      <span className="material-symbols-outlined text-[14px] text-rose-500">diamond</span>
                    </div>
                    {smartModelStats.tierTop.hard ? (
                      <div>
                        <code className="block text-xs font-mono font-medium text-text-main truncate" title={smartModelStats.tierTop.hard.model}>
                          {smartModelStats.tierTop.hard.model}
                        </code>
                        <span className="text-[10px] text-text-muted">{smartModelStats.tierTop.hard.count} requests</span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic">No traffic yet</span>
                    )}
                  </div>
                </div>

                {/* Leaderboard Table of Models in Smart Routing */}
                {smartModelStats.sortedModels.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border/50 bg-surface">
                    <table className="data-table w-full text-xs" aria-label="Smart Combo Model Leaderboard">
                      <thead>
                        <tr className="border-b border-border/50 text-[11px] text-text-muted">
                          <th className="text-left py-1.5 px-2.5">Model</th>
                          <th className="text-left py-1.5 px-2">Combos Used</th>
                          <th className="text-left py-1.5 px-2">Tiers</th>
                          <th className="text-right py-1.5 px-2">Requests</th>
                          <th className="text-right py-1.5 px-2">Share</th>
                          <th className="text-right py-1.5 px-2.5">Success Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smartModelStats.sortedModels.map((sm, idx) => (
                          <tr key={sm.model} className="border-b border-border/30 last:border-0 hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
                            <td className="py-1.5 px-2.5 font-mono font-medium text-text-main">
                              <span className="text-[10px] text-text-muted mr-1.5">#{idx + 1}</span>
                              {sm.model}
                            </td>
                            <td className="py-1.5 px-2 text-text-muted">
                              {[...sm.combos].join(", ") || "—"}
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-1">
                                {[...sm.tiers].map((t) => (
                                  <span
                                    key={t}
                                    className={`px-1 py-0.2 rounded font-mono text-[9px] font-semibold uppercase ${
                                      t === "easy"
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : t === "medium"
                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    }`}
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-right font-medium text-text-main">
                              {sm.total}×
                            </td>
                            <td className="py-1.5 px-2 text-right text-text-muted font-mono text-[11px]">
                              {pct(sm.total, smartModelStats.total)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-medium">
                              <span className={sm.errors > 0 ? "text-amber-600" : "text-emerald-600"}>
                                {pct(sm.success, sm.total)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}
          {/* Per-combo cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {combos.map((c) => {
              const mems = (membersByCombo[c.comboName] || []).slice(0, 8);
              const worst = [...mems].sort((a, b) => (b.errors - b.success) - (a.errors - a.success)).find((m) => m.errors > 0);
              return (
                <Card key={c.comboName} padding="sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <HealthDot success={c.success} total={c.total} />
                        <p className="font-medium text-text-main truncate">{c.comboName}</p>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {c.total} attempts · {pct(c.success, c.total)} success · avg {c.avgLatencyS}s
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-text-main">{c.success}<span className="text-text-muted">/{c.total}</span></p>
                      <p className="text-xs text-red-500">{c.errors} errors</p>
                    </div>
                  </div>
                  {mems.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                      {mems.map((m) => (
                        <div key={`${m.model}|${m.provider}`} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
                            <span className="font-medium text-text-main truncate">{m.model}</span>
                            <span className="text-text-muted truncate">{m.provider}</span>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className="text-text-muted">{m.total}×</span>
                            {m.errors > 0 ? (
                              <span className="text-red-500" title={m.sampleError || ""}>{m.errors} err</span>
                            ) : (
                              <span className="text-green-600">ok</span>
                            )}
                            <span className="text-text-muted w-12 text-right">{m.avgLatencyS ? `${m.avgLatencyS}s` : "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {worst && (
                    <p className="text-[11px] text-red-500/90 mt-2 truncate" title={worst.sampleError || ""}>
                      Weakest member: {worst.model} ({worst.errors} errors{worst.sampleError ? ` — ${String(worst.sampleError).slice(0, 60)}` : ""})
                    </p>
                  )}
                  {(difficultyByCombo[c.comboName] || []).length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-medium text-text-muted">Smart routing (difficulty)</p>
                        {(() => {
                          const comboDiffs = [...(difficultyModelsByCombo[c.comboName] || [])].sort((a, b) => b.total - a.total);
                          const topInThisCombo = comboDiffs[0];
                          return topInThisCombo ? (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                              Top model: <code className="font-mono font-semibold">{topInThisCombo.model}</code> ({topInThisCombo.total}×)
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {(difficultyByCombo[c.comboName] || []).map((d) => {
                          const tierModels = (difficultyModelsByCombo[c.comboName] || []).filter((m) => m.tier === d.tier);
                          return (
                            <div key={`${d.tier}|${d.domain || ""}|${d.policy || ""}`} className="flex flex-col gap-1 rounded bg-black/[0.015] dark:bg-white/[0.015] p-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  <span className={`font-medium capitalize ${d.tier === "easy" ? "text-emerald-600" : d.tier === "medium" ? "text-yellow-600" : d.tier === "hard" ? "text-red-500" : "text-text-muted"}`}>
                                    {d.tier}
                                  </span>
                                  {d.domain && (
                                    <span className="text-[10px] text-text-muted ml-1">· {d.domain}</span>
                                  )}
                                  {d.policy && (
                                    <span className="text-[10px] text-text-muted ml-1">· {d.policy}</span>
                                  )}
                                  {d.avgConfidence != null && (
                                    <span className="text-[10px] text-text-muted ml-1" title="average judge/heuristic confidence">
                                      · conf {Number(d.avgConfidence).toFixed(2)}
                                    </span>
                                  )}
                                </span>
                                <span className="text-text-muted font-medium">
                                  {d.total}× · {pct(d.success, d.total)}
                                  {d.judgeUsed > 0 && (
                                    <span title="decided by the judge model"> · ⚖️{d.judgeUsed}</span>
                                  )}
                                </span>
                              </div>
                              {tierModels.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 text-[11px] pt-0.5">
                                  <span className="text-[10px] text-text-muted">Routed to:</span>
                                  {tierModels.map((tm) => (
                                    <span key={tm.model} className="inline-flex items-center gap-1 rounded bg-surface border border-border/60 px-1.5 py-0.2 font-mono text-[10px] text-text-main shadow-2xs">
                                      <span>{tm.model}</span>
                                      <span className="text-text-muted font-sans font-medium">({tm.total}×)</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(() => {
                        const rows = difficultyByCombo[c.comboName] || [];
                        const tot = rows.reduce((s, r) => s + r.total, 0);
                        const judged = rows.reduce((s, r) => s + r.judgeUsed, 0);
                        return tot > 0 ? (
                          <p className="text-[11px] text-text-muted mt-1.5">
                            Judge used {judged}/{tot} ({Math.round((judged / tot) * 100)}%) — rest decided by rules, no judge call.
                          </p>
                        ) : null;
                      })()}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Most-failing members across all combos */}
          {members.some((m) => m.errors > 0) && (
            <Card padding="sm">
              <p className="font-medium text-text-main mb-2">Most failing members (all combos)</p>
              <div className="overflow-x-auto">
                <table className="data-table w-full text-xs" aria-label="Most failing combo members">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-3">Member</th>
                      <th className="text-left py-1.5 pr-3">Provider</th>
                      <th className="text-left py-1.5 pr-3">Combo</th>
                      <th className="text-right py-1.5 pr-3">Errors</th>
                      <th className="text-right py-1.5 pr-3">Total</th>
                      <th className="text-right py-1.5 pr-3">Success rate</th>
                      <th className="text-left py-1.5">Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members
                      .filter((m) => m.errors > 0)
                      .sort((a, b) => b.errors - a.errors)
                      .slice(0, 10)
                      .map((m) => (
                        <tr key={`${m.comboName}|${m.model}|${m.provider}`}>
                          <td className="py-1.5 pr-3 font-medium text-text-main">{m.model}</td>
                          <td className="py-1.5 pr-3 text-text-muted">{m.provider}</td>
                          <td className="py-1.5 pr-3 text-text-muted">{m.comboName}</td>
                          <td className="py-1.5 pr-3 text-right text-red-500 font-semibold">{m.errors}</td>
                          <td className="py-1.5 pr-3 text-right text-text-muted">{m.total}</td>
                          <td className="py-1.5 pr-3 text-right">{pct(m.success, m.total)}</td>
                          <td className="py-1.5 text-text-muted truncate max-w-[280px]" title={m.sampleError || ""}>
                            {m.sampleError ? String(m.sampleError).slice(0, 70) : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
