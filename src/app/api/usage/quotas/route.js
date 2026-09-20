import { NextResponse } from "next/server";
import { getBatchProviderQuotas } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { autoHealConnectionOnQuotaRestored } from "@/sse/services/accountExhaustionPolicy.js";
import { syncAntigravityConnectionStatus, isAntigravityQuotaMapExhausted } from "@/sse/services/antigravityQuota.js";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/quotas?provider=xxx
 * Batch quota snapshots for one provider, joined with connection routing info
 * (name, email, priority, is_active, locked_all_until). One round-trip, replaces
 * the per-connection quota storm from the dashboard.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    if (!provider) {
      return NextResponse.json(
        { error: "provider query parameter is required" },
        { status: 400 },
      );
    }

    const quotas = await getBatchProviderQuotas(provider);

    // Sync connection status on view: if snapshot shows quota is fully depleted (0%),
    // mark exhausted; if restored (>0%), auto-heal; sync family-level locks.
    if (Array.isArray(quotas)) {
      for (const item of quotas) {
        const itemProvider = item.provider || provider;
        if (itemProvider === "antigravity" && item.quotas) {
          await syncAntigravityConnectionStatus(item.connectionId, item.quotas).catch(() => {});
          if (isAntigravityQuotaMapExhausted(item.quotas)) {
            item.testStatus = "exhausted";
          }
        } else if (item.testStatus === "exhausted" || item.lockedAllUntil) {
          const healed = await autoHealConnectionOnQuotaRestored(
            item.connectionId,
            {
              provider: itemProvider,
              quotas: item.quotas,
              remainingPct: item.remainingPct,
            }
          ).catch(() => false);
          if (healed) {
            item.testStatus = "active";
            item.lockedAllUntil = null;
          }
        }
      }
    }

    return NextResponse.json({ quotas });
  } catch (error) {
    console.error("[API] Failed to fetch provider quotas:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider quotas" },
      { status: 500 },
    );
  }
}