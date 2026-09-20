import { NextResponse } from "next/server";
import { getBatchProviderQuotas } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { autoHealAntigravityOnQuotaRestored } from "@/sse/services/antigravityQuota.js";
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

    // Auto-heal on view: if any connection was marked exhausted or locked, but
    // its snapshot shows restored quota, heal it automatically.
    if (provider === "antigravity" && Array.isArray(quotas)) {
      for (const item of quotas) {
        if (item.quotas && (item.testStatus === "exhausted" || item.lockedAllUntil)) {
          const healed = await autoHealAntigravityOnQuotaRestored(item.connectionId, item.quotas).catch(() => false);
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