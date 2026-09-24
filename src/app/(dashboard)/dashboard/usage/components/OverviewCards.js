"use client";

import PropTypes from "prop-types";
import Link from "next/link";
import { formatTokens, formatTokensExact } from "@/shared/utils/formatTokens";

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

function Metric({ label, icon, tone, value, valueClass, note, extra, exact, compact = false }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:gap-3 sm:p-4 ${
        extra ? "col-span-2 sm:col-span-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted sm:text-[11px]">
          {label}
        </span>
        <span className={`flex size-6 items-center justify-center rounded-md border sm:size-7 ${tone}`}>
          <span className="material-symbols-outlined text-[15px] sm:text-[16px]" aria-hidden="true">{icon}</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          title={exact ? `${exact} · exact count` : undefined}
          className={`text-lg font-semibold tabular-nums whitespace-nowrap sm:text-2xl ${valueClass || "text-text-main"}`}
        >
          {value}
        </span>
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

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
      <Metric
        {...CARDS[0]}
        value={fmt(stats.totalRequests)}
        note={
          <span className={`text-xs font-medium ${failed > 0 ? "text-danger" : "text-emerald-400"}`}>
            {fmt(failed)} failed
          </span>
        }
      />
      <Metric
        {...CARDS[1]}
        value={formatTokens(stats.totalPromptTokens)}
        exact={formatTokensExact(stats.totalPromptTokens)}
        valueClass="text-primary"
      />
      <Metric
        {...CARDS[2]}
        value={formatTokens(stats.totalCachedTokens)}
        exact={formatTokensExact(stats.totalCachedTokens)}
        valueClass="text-cyan-400"
      />
      <Metric
        {...CARDS[3]}
        value={formatTokens(stats.totalCompletionTokens)}
        exact={formatTokensExact(stats.totalCompletionTokens)}
        valueClass="text-emerald-400"
      />
      <Metric
        {...CARDS[4]}
        value={`~${fmtCost(stats.totalCost)}`}
        valueClass="text-amber-400"
        extra={
          <div className="flex flex-col gap-1 text-[11px] text-text-muted">
            <span className="truncate">
              Estimated, not billed · In {fmtCost(inputCost)} · Cache {fmtCost(cachedCost)} · Out {fmtCost(outputCost)}
            </span>
            <Link
              href="/dashboard/settings/pricing"
              className="inline-flex min-h-11 w-fit items-center underline decoration-dotted underline-offset-2 hover:text-primary sm:min-h-0"
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
