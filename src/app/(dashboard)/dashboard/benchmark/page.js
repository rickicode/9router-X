"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";

const SUITES = [
  ["pong", "PONG", "Balasan hidup"],
  ["coding", "Coding", "Kode rate limiter"],
  ["logic", "Logika", "Teka-teki empat orang"],
  ["tool", "Tool call", "Panggilan cuaca"],
];

const STATUS_LABEL = {
  passed: "Lolos",
  failed: "Gagal",
  rate_limited: "Rate limit",
  skipped: "Dilewati",
};

function chatModelCount(providerId) {
  return getModelsByProviderId(providerId).filter((model) => getModelKind(model, "llm") === "llm").length;
}

export default function BenchmarkPage() {
  const catalog = useMemo(() => Object.values(AI_PROVIDERS)
    .filter((provider) => !provider.hidden && chatModelCount(provider.id) > 0)
    .map((provider) => ({
      id: provider.id,
      name: provider.name || provider.id,
      models: chatModelCount(provider.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)), []);
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState(["antigravity", "kilocode-free"]);
  const [suites, setSuites] = useState(["pong"]);
  const [reviewer, setReviewer] = useState("judge-router");
  const [jobs, setJobs] = useState([]);
  const [daily, setDaily] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  const visible = catalog.filter((provider) => provider.name.toLowerCase().includes(query.toLowerCase()) || provider.id.includes(query.toLowerCase()));
  const selectedModels = catalog.filter((provider) => providers.includes(provider.id)).reduce((sum, provider) => sum + provider.models, 0);

  async function refresh(id = active?.id) {
    const [listResponse, jobResponse] = await Promise.all([
      fetch("/api/benchmark", { cache: "no-store" }),
      id ? fetch(`/api/benchmark?id=${id}`, { cache: "no-store" }) : null,
    ]);
    const list = await listResponse.json();
    setJobs(list.jobs || []);
    setDaily(list.daily || []);
    if (jobResponse) setActive(await jobResponse.json());
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(), 3000);
    return () => clearInterval(timer);
  }, [active?.id]);
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((settings) => {
        const days = Number(settings.benchmarkRetentionDays);
        if (Number.isFinite(days)) setRetentionDays(days);
      })
      .catch(() => {});
  }, []);


  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function start() {
    setError("");
    setStarting(true);
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers, suites, reviewer }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Benchmark gagal dimulai");
        return;
      }
      await refresh(data.id);
    } finally {
      setStarting(false);
    }
  }
  async function askAdvice() {
    setError("");
    setAdvising(true);
    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advice", reviewer, jobIds: selectedJobs }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Saran gagal dibuat");
        return;
      }
      await refresh(data.id);
    } finally {
      setAdvising(false);
    }
  }

  async function saveRetention() {
    const days = Math.max(1, Math.min(365, Number(retentionDays) || 30));
    setRetentionDays(days);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benchmarkRetentionDays: days }),
    });
  }


  const attempts = active?.attempts || [];
  const counts = attempts.reduce((sum, row) => ({ ...sum, [row.status]: (sum[row.status] || 0) + Number(row.n || 0) }), {});
  const report = active?.reports?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">Benchmark</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">Pilih satu atau banyak provider. PONG jalan dulu. Coding, logika, dan tool call hanya jalan setelah PONG lolos.</p>
        </div>
        <Button icon="play_arrow" loading={starting} disabled={providers.length === 0} onClick={start}>
          Jalankan {providers.length} provider
        </Button>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card title="Provider" subtitle={`${providers.length} dipilih · ${selectedModels} model chat`} icon="dns">
          <Input placeholder="Cari provider" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setProviders(visible.map((provider) => provider.id))}>Pilih yang tampil</Button>
            <Button size="sm" variant="ghost" onClick={() => setProviders([])}>Kosongkan</Button>
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto">
            {visible.map((provider) => (
              <label key={provider.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={providers.includes(provider.id)} onChange={() => toggle(providers, setProviders, provider.id)} />
                  <span className="truncate">{provider.name}</span>
                </span>
                <span className="shrink-0 text-text-muted">{provider.models}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {SUITES.map(([id, label, detail]) => (
              <label key={id} className="rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={suites.includes(id)} onChange={() => toggle(suites, setSuites, id)} />
                  {label}
                </span>
                <span className="mt-1 block text-xs text-text-muted">{detail}</span>
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-text-muted">Reviewer</span>
            <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="judge-router atau provider/model" />
          </label>
        </Card>

        <div className="space-y-6">
          <Card title="Kesimpulan" subtitle={report ? report.reviewer : "Reviewer menulis setelah semua tes selesai"} icon="psychology">
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {active ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="default">{active.status}</Badge>
                <Badge variant="default">{active.progress?.done || 0}/{active.progress?.total || 0} model</Badge>
                <Badge variant="success">{counts.passed || 0} lolos</Badge>
                <Badge variant="error">{counts.failed || 0} gagal</Badge>
                <Badge variant="warning">{counts.rate_limited || 0} rate limit</Badge>
              </div>
            ) : null}
            {report ? (
              <div className="whitespace-pre-wrap text-sm leading-6 text-text-main">{report.report}</div>
            ) : (
              <p className="text-sm text-text-muted">Belum ada kesimpulan. Jalankan benchmark, lalu reviewer membaca hasil tersimpan dan menulis bagian layak dipakai, jangan dipakai, dan cek lagi.</p>
            )}
          </Card>

          <Card title="Hasil" subtitle="Satu baris per model, suite, dan status" icon="table">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-text-muted">
                  <tr><th className="py-2">Akun</th><th>Model</th><th>Suite</th><th>Status</th><th>Kualitas</th><th>Byte pertama</th><th>Total</th><th>tok/s</th><th>Format</th></tr>
                </thead>
                <tbody>
                  {attempts.map((row) => (
                    <tr key={`${row.account_name}-${row.model}-${row.suite}-${row.status}-${row.format}`} className="border-t border-border-subtle">
                      <td className="py-2 pr-3">{row.account_name || "-"}</td>
                      <td className="pr-3">{row.model}</td>
                      <td>{row.suite}</td>
                      <td>{STATUS_LABEL[row.status] || row.status}</td>
                      <td>{row.median_score ?? "-"}</td>
                      <td>{row.median_ttft ?? "-"}</td>
                      <td>{row.median_ms ?? "-"}</td>
                      <td>{row.median_tps ?? "-"}</td>
                      <td>{row.format || "-"}</td>
                    </tr>
                  ))}
                  {attempts.length === 0 ? <tr><td colSpan="9" className="py-6 text-text-muted">Hasil muncul di sini setelah job dimulai.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Hari ini" subtitle="Median kecepatan. Skor kualitas terpisah." icon="monitoring">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted"><tr><th className="py-2">Model</th><th>PONG</th><th>Kualitas</th><th>Byte pertama</th><th>Total</th></tr></thead>
            <tbody>
              {daily.map((row) => (
                <tr key={`${row.provider}-${row.model}`} className="border-t border-border-subtle">
                  <td className="py-2">{row.model}</td>
                  <td>{row.pong_total ? `${row.pong_passed}/${row.pong_total}` : "-"}</td>
                  <td>{row.median_score ?? "-"}</td>
                  <td>{row.median_ttft ?? "-"}</td>
                  <td>{row.median_ms ?? "-"}</td>
                </tr>
              ))}
              {daily.length === 0 ? <tr><td colSpan="5" className="py-4 text-text-muted">Belum ada data hari ini.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Riwayat" subtitle="Saran membaca request dan response yang tersimpan" icon="history" action={
        <Button size="sm" icon="psychology" variant="secondary" loading={advising} disabled={selectedJobs.length === 0} onClick={askAdvice}>
          Minta saran
        </Button>
      }>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-text-muted">Hapus otomatis setelah</span>
            <Input type="number" min="1" max="365" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} />
          </label>
          <Button size="sm" variant="secondary" onClick={saveRetention}>Simpan {retentionDays} hari</Button>
        </div>
        <div className="divide-y divide-border-subtle">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3 py-3 text-sm">
              <input type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => toggle(selectedJobs, setSelectedJobs, job.id)} aria-label="Pilih riwayat untuk saran" />
              <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left hover:text-brand-500" onClick={() => refresh(job.id)}>
                <span className="truncate">{new Date(job.created_at).toLocaleString()} · {(job.providers || []).length} provider</span>
                <span className="shrink-0 text-text-muted">{job.status}</span>
              </button>
            </div>
          ))}
          {jobs.length === 0 ? <p className="py-2 text-sm text-text-muted">Belum ada benchmark.</p> : null}
        </div>
      </Card>
    </div>
  );
}
