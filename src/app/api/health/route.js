import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver";
import { memSize } from "@/lib/redis/memoryStore";
import { getRoutingMetrics } from "open-sse/services/routingMetrics";

export async function GET() {
  const check = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    postgres: false,
    // Redis removed (single-container): memory speed layer is always up.
    redis: true,
    redisNote: "memory-only (no external redis)",
    latencyMs: {},
  };

  // Check PostgreSQL
  const dbStart = Date.now();
  try {
    const db = await getAdapter();
    const res = await db.get("SELECT 1 as ok");
    check.postgres = !!res?.ok;
    check.latencyMs.postgres = Date.now() - dbStart;
  } catch (err) {
    check.postgres = false;
    check.postgresError = err.message;
    check.status = "degraded";
  }

  // Memory speed-layer stats
  try {
    check.latencyMs.memory = 0;
    check.memoryKeys = memSize();
  } catch {}

  check.routing = getRoutingMetrics();

  const httpStatus = check.postgres ? 200 : 503;
  return NextResponse.json(check, { status: httpStatus });
}
