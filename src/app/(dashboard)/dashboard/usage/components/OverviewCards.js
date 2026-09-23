"use client";

import PropTypes from "prop-types";
import Link from "next/link";
import Tooltip from "@/shared/components/Tooltip";

const fmt = (n) => new Intl.NumberFormat().format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const CARDS = [
  {
    key: "requests",
    label: "Requests",
    icon: "swap_horiz",
    tone: "text-text-main bg-surface-3 border-border",
  },
  {
    key: "input",
    label: "Input Tokens",
    icon: "input",
    tone: "text-primary bg-primary/10 border-primary/20",
  },
  {
    key: "cached",
    label: "Cached Tokens",
    icon: "database",
    tone: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    key: "output",
    label: "Output Tokens",
    icon: "output",
    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "cost",
    label: "Estimated Cost",
    icon: "payments",
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
];

function Metric({ label, icon, tone, value, valueClass, note, extra }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <span className={`flex size-7 items-center justify-center rounded-md border ${tone}`}>
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{icon}</span>
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`truncate text-2xl font-semibold tabular-nums ${valueClass || "text-text-main"}`}>{value}</span>
        {note}
      </div>
      {extra}
    </div>
  );
}

export default function OverviewCards({ stats }) {
  const totalPrompt = Number(stats.totalPromptTokens) || 0;
  const totalCached = Number(stats.totalCachedTokens) || 0;
  const totalCompletion = Number(stats.totalCompletionTokens) || 0;
  const totalCost = Number(stats.totalCost) || 0;
  const totalTokens = totalPrompt + totalCompletion;
  const nonCachedInput = Math.max(0, totalPrompt - totalCached);
  const inputCost = totalTokens > 0 ? (nonCachedInput * totalCost) / totalTokens : 0;
  const cachedCost = totalTokens > 0 ? (totalCached * totalCost) / totalTokens : 0;
  const outputCost = totalTokens > 0 ? (totalCompletion * totalCost) / totalTokens : 0;
  const failed = Number(stats.totalFailedRequests || 0);

  const costTip = `Input ${fmtCost(inputCost)} · Cached ${fmtCost(cachedCost)} · Output ${fmtCost(outputCost)}. Token-share split of the estimated total. Rates come from Settings > Pricing.`;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric
        {...CARDS[0]}
        value={fmt(stats.totalRequests)}
        note={
          <span className={`text-xs font-medium ${failed > 0 ? "text-danger" : "text-emerald-400"}`}>
            {fmt(failed)} failed
          </span>
        }
      />
      <Metric {...CARDS[1]} value={fmt(stats.totalPromptTokens)} valueClass="text-primary" />
      <Metric {...CARDS[2]} value={fmt(stats.totalCachedTokens)} valueClass="text-cyan-400" />
      <Metric {...CARDS[3]} value={fmt(stats.totalCompletionTokens)} valueClass="text-emerald-400" />
      <Metric
        {...CARDS[4]}
        value={`~${fmtCost(stats.totalCost)}`}
        valueClass="text-amber-400"
        extra={
          <div className="flex flex-col gap-1 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              Estimated, not billed
              <Tooltip text={costTip} position="top" />
            </span>
            <span className="truncate">
              In {fmtCost(inputCost)} · Cache {fmtCost(cachedCost)} · Out {fmtCost(outputCost)}
            </span>
            <Link
              href="/dashboard/settings/pricing"
              className="w-fit underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              Edit rates
            </Link>
          </div>
        }
      />
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
