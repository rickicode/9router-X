import { NextResponse } from "next/server";
import { bulkResetProviderConnectionsStatus } from "@/models";
import { clearAntigravityConnectionCache } from "@/sse/services/antigravityQuota";

export async function POST(request) {
  try {
    const body = await request.json();
    const { provider, ids } = body;

    if (!provider && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: "provider or ids is required" }, { status: 400 });
    }

    const result = await bulkResetProviderConnectionsStatus({ provider, ids });

    if (provider === "antigravity" && typeof clearAntigravityConnectionCache === "function") {
      if (Array.isArray(ids)) {
        for (const id of ids) clearAntigravityConnectionCache(id);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error bulk resetting connection status:", error);
    return NextResponse.json({ error: "Failed to reset connection status" }, { status: 500 });
  }
}
