"use client";

import { useMemo, useState } from "react";
import { Card } from "@/shared/components";

const STATUS_CONFIG = {
  passed: { label: "Lolos", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Gagal", color: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
  rate_limited: { label: "Rate Limit (429)", color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  skipped: { label: "Dilewati", color: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  cancelled: { label: "Dibatalkan", color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
};

const FILTERS = [
  { id: "all", label: "Semua" },
  { id: "passed", label: "Lolos" },
  { id: "failed", label: "Gagal" },
  { id: "rate_limited", label: "429 Rate Limit" },
  { id: "skipped", label: "Dilewati" },
];

export default function BenchmarkResults({ attempts, isJobRunning, onInspect }) {
  // State: Table filters & sorting
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTableQuery, setSearchTableQuery] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("asc");

  // Filter and sort attempts for table
  const displayedAttempts = useMemo(() => {
    return attempts
      .filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (searchTableQuery) {
          const q = searchTableQuery.toLowerCase();
          return (
            row.model?.toLowerCase().includes(q) ||
            row.account_name?.toLowerCase().includes(q) ||
            row.provider?.toLowerCase().includes(q) ||
            row.suite?.toLowerCase().includes(q) ||
            String(row.http_status || "").includes(q) ||
            String(row.error || "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "score") {
          valA = a.score ?? -1;
          valB = b.score ?? -1;
        } else if (sortField === "ttft") {
          valA = a.ttft_ms ?? 999999;
          valB = b.ttft_ms ?? 999999;
        } else if (sortField === "total") {
          valA = a.total_ms ?? 999999;
          valB = b.total_ms ?? 999999;
        } else if (sortField === "tps") {
          valA = a.tps ?? 0;
          valB = b.tps ?? 0;
        } else if (sortField === "status") {
          valA = a.http_status ?? 0;
          valB = b.http_status ?? 0;
        }
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [attempts, statusFilter, searchTableQuery, sortField, sortOrder]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "score" || field === "tps" ? "desc" : "asc");
    }
  }

  return (
    <Card
      title="3. Hasil Pengujian Terkini"
      subtitle="Menampilkan HTTP statuscode & respon per percobaan. Klik baris mana saja untuk melihat detail lengkap."
      icon="table_chart"
      action={
        <div className="text-xs text-text-muted">
          {displayedAttempts.length} dari {attempts.length} data ditampilkan
        </div>
      }
    >
      <div className="space-y-3">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-text-muted mr-1 font-medium">Filter:</span>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === f.id
                    ? "bg-brand-500 text-white shadow-xs"
                    : "bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text-main"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="w-48">
            <input
              type="text"
              placeholder="Cari di tabel..."
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-main focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface z-10 text-xs text-text-muted border-b border-border-subtle select-none">
              <tr>
                <th className="py-2.5 px-3">Akun</th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("model")}
                >
                  <div className="flex items-center gap-1">
                    <span>Model</span>
                    {sortField === "model" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th className="py-2.5 px-2">Suite</th>
                <th
                  className="py-2.5 px-2 cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    <span>Status / Code</span>
                    {sortField === "status" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th className="py-2.5 px-3 max-w-[220px]">Pesan Respon / Error</th>
                <th
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("score")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Kualitas</span>
                    {sortField === "score" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("ttft")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>TTFT</span>
                    {sortField === "ttft" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("total")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total</span>
                    {sortField === "total" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th
                  className="py-2.5 px-2 text-right cursor-pointer hover:text-text-main"
                  onClick={() => handleSort("tps")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>tok/s</span>
                    {sortField === "tps" ? (
                      <span className="material-symbols-outlined text-xs">
                        {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <th className="py-2.5 px-2 text-center">Format</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-xs">
              {displayedAttempts.map((row) => {
                const cfg = STATUS_CONFIG[row.status] || {
                  label: row.status,
                  color: "bg-surface-3 text-text-muted",
                };
                const isFailedOrLimited = row.status === "failed" || row.status === "rate_limited";
                const displayMessage = row.error || row.excerpt || row.response_body || "-";

                return (
                  <tr
                    key={`${row.id || row.account_name}-${row.model}-${row.suite}-${row.status}-${row.rep}`}
                    onClick={() => onInspect(row)}
                    className="hover:bg-surface-2 transition-colors cursor-pointer group"
                  >
                    <td className="py-2 px-3 font-mono text-[11px] max-w-[100px] truncate" title={row.account_name}>
                      {row.account_name || "-"}
                    </td>
                    <td className="py-2 px-3 font-medium max-w-[140px] truncate" title={row.model}>
                      {row.model}
                    </td>
                    <td className="py-2 px-2 uppercase font-semibold text-[10px] tracking-wider text-text-muted">
                      {row.suite}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {row.http_status ? (
                          <span
                            className={`font-mono text-[10px] font-bold ${
                              row.http_status === 200
                                ? "text-emerald-400"
                                : row.http_status === 429
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {row.http_status}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`py-2 px-3 max-w-[240px] truncate font-mono text-[11px] ${
                        isFailedOrLimited ? "text-rose-400 font-medium" : "text-text-muted"
                      }`}
                      title={displayMessage}
                    >
                      {displayMessage}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold">
                      {row.score !== null && row.score !== undefined ? (
                        <span
                          className={
                            row.score >= 80
                              ? "text-emerald-400"
                              : row.score >= 50
                              ? "text-amber-400"
                              : "text-rose-400"
                          }
                        >
                          {row.score}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-text-muted">
                      {row.ttft_ms ? `${row.ttft_ms}ms` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-text-muted">
                      {row.total_ms ? `${row.total_ms}ms` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium">
                      {row.tps ? `${row.tps}` : "-"}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-[10px] text-text-muted uppercase">
                      {row.format || "-"}
                    </td>
                  </tr>
                );
              })}

              {displayedAttempts.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-3xl opacity-40">
                        {isJobRunning ? "hourglass_top" : "science"}
                      </span>
                      <span>
                        {isJobRunning
                          ? "Menjalankan benchmark... data percobaan akan muncul secara langsung."
                          : attempts.length > 0
                          ? "Tidak ada baris yang sesuai dengan filter atau pencarian."
                          : "Belum ada data hasil pengujian aktif. Pilih model dan klik Jalankan Benchmark."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}