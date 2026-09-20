import { NextResponse } from "next/server";
import { getBatchProviderQuotas } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { autoHealConnectionOnQuotaRestored } from "@/sse/services/accountExhaustionPolicy.js";
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

    // Auto-heal on view for all providers: if any connection was marked exhausted
    // or locked, but its snapshot shows restored quota, heal it automatically.
    if (Array.isArray(quotas)) {
      for (const item of quotas) {
        if (item.testStatus === "exhausted" || item.lockedAllUntil) {
          const healed = await autoHealConnectionOnQuotaRestored(
            item.connectionId,
            {
              provider: item.provider || provider,
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