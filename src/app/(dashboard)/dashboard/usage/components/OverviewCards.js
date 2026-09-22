"use client";

import PropTypes from "prop-types";
import Link from "next/link";
import Card from "@/shared/components/Card";
import Tooltip from "@/shared/components/Tooltip";

const fmt = (n) => new Intl.NumberFormat().format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

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

 // Info tooltip: Input/Cached/Output cost split + exact-rate note + billing link hint
 const costBreakdownTip = `Input ${fmtCost(inputCost)} · Cached ${fmtCost(cachedCost)} · Output ${fmtCost(outputCost)} — token-share split of exact total. Exact rate from Settings > Pricing. See billing docs for rate details.`;

 return (
 <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-3">
 <Card className="flex min-w-0 flex-col gap-1">
 <span className="text-text-muted text-sm font-semibold">Total Requests</span>
 <div className="flex items-baseline gap-2 flex-wrap">
 <span className="truncate text-2xl font-medium">{fmt(stats.totalRequests)}</span>
 {Number(stats.totalFailedRequests || 0) > 0 ? (
 <span className="text-xs font-medium text-danger">({fmt(stats.totalFailedRequests)} failed)</span>
 ) : (
 <span className="text-xs font-medium text-success">(0 failed)</span>
 )}
 </div>
 </Card>
 <Card className="flex min-w-0 flex-col gap-1">
 <span className="text-text-muted text-sm font-semibold">Total Input Tokens</span>
 <span className="truncate text-2xl font-medium text-primary">{fmt(stats.totalPromptTokens)}</span>
 </Card>
 <Card className="flex min-w-0 flex-col gap-1">
 <span className="text-text-muted text-sm font-semibold">Cached Tokens</span>
 <span className="truncate text-2xl font-medium text-info">{fmt(stats.totalCachedTokens)}</span>
 </Card>
 <Card className="flex min-w-0 flex-col gap-1">
 <span className="text-text-muted text-sm font-semibold">Output Tokens</span>
 <span className="truncate text-2xl font-medium text-success">{fmt(stats.totalCompletionTokens)}</span>
 </Card>
 <Card className="flex min-w-0 flex-col gap-1">
 <div className="flex items-center gap-1.5">
 <span className="text-text-muted text-sm font-semibold">Est. Cost</span>
 <Tooltip text={costBreakdownTip} position="top" />
 </div>
 <span className="truncate text-2xl font-medium text-warning">~{fmtCost(stats.totalCost)}</span>
 <span className="text-[11px] text-text-muted">
 Estimated, not actual billing —{" "}
 <Link href="/dashboard/settings/pricing" className="underline decoration-dotted underline-offset-2 hover:text-primary">
 billing docs
 </Link>
 {" · "}exact-rate note: rates from Settings &gt; Pricing
 </span>
 <span className="text-[11px] text-text-muted">
 Input {fmtCost(inputCost)} · Cached {fmtCost(cachedCost)} · Output {fmtCost(outputCost)}
 </span>
 </Card>
 </div>
 );
}

OverviewCards.propTypes = {
 stats: PropTypes.object.isRequired,
};
