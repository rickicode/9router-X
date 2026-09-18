"use client";

import { useState, useEffect } from "react";
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
  const membersByCombo = {};
  for (const m of members) {
    (membersByCombo[m.comboName] ||= []).push(m);
  }
  const difficultyByCombo = {};
  for (const d of difficulty) {
    (difficultyByCombo[d.comboName] ||= []).push(d);
  }

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
                      <p className="text-[11px] font-medium text-text-muted mb-1.5">Smart routing (difficulty)</p>
                      <div className="flex flex-col gap-1">
                        {(difficultyByCombo[c.comboName] || []).map((d) => (
                          <div key={d.tier} className="flex items-center justify-between gap-2 text-xs">
                            <span className={`font-medium capitalize ${d.tier === "easy" ? "text-emerald-600" : d.tier === "medium" ? "text-yellow-600" : d.tier === "hard" ? "text-red-500" : "text-text-muted"}`}>
                              {d.tier}
                            </span>
                            <span className="text-text-muted">
                              {d.total}× · {pct(d.success, d.total)}
                              {d.judgeUsed > 0 && (
                                <span title="decided by the judge model"> · ⚖️{d.judgeUsed}</span>
                              )}
                            </span>
                          </div>
                        ))}
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
