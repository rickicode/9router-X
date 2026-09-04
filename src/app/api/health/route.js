import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver";
import { isRedisAvailable, getRedis } from "@/lib/redis/client";

export async function GET() {
  const check = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    postgres: false,
    redis: false,
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

  // Check Redis
  const redisStart = Date.now();
  try {
    if (isRedisAvailable()) {
      const redis = getRedis();
      const pong = await redis.ping();
      check.redis = pong === "PONG";
      check.latencyMs.redis = Date.now() - redisStart;
    } else {
      check.redis = false;
      check.redisNote = "disabled or connecting";
    }
  } catch (err) {
    check.redis = false;
    check.redisError = err.message;
  }

  const httpStatus = check.postgres ? 200 : 503;
  return NextResponse.json(check, { status: httpStatus });
}
