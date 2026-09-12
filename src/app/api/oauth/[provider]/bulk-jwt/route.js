import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";

/**
 * POST /api/oauth/[provider]/bulk-jwt  (provider: codebuddy-intl | codebuddy-cn)
 * Bulk import Keycloak offline JWT tokens as CodeBuddy connections.
 *
 * Body accepts any of:
 *   - Raw token text: one JWT per line (whitespace-separated also OK)
 *   - JSON array of token strings:  ["eyJ...", "eyJ..."]
 *   - JSON array of objects:        [{ accessToken: "eyJ...", name?: "..." }]
 *   - Single object:                { accessToken: "eyJ...", name?: "..." }
 *
 * Behavior:
 *   - authType "apikey": the offline JWT itself is the bearer credential for
 *     /v2/chat/completions (verified against the live gateway).
 *   - Connection names follow the existing DD-MM-YYYY-N pattern, numbered
 *     after the highest existing N for today. Explicit `name` objects win.
 *   - expiresAt is decoded from the JWT `exp` claim (offline tokens live ~1y).
 *   - Duplicate tokens (already stored on the same provider) are skipped, not
 *     double-imported.
 *   - Tokens are NEVER echoed back in the response.
 */

const PROVIDERS = new Set(["codebuddy-intl", "codebuddy-cn"]);

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    let seg = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (seg.length % 4) seg += "=";
    return JSON.parse(Buffer.from(seg, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function extractTokens(body) {
  if (typeof body === "string") {
    return body.split(/\s+/).filter((t) => t.startsWith("eyJ"));
  }
  if (Array.isArray(body)) {
    return body
      .map((item) => (typeof item === "string" ? item : item?.accessToken))
      .filter((t) => typeof t === "string" && t.length > 0);
  }
  if (body && typeof body === "object") {
    if (typeof body.text === "string") {
      return body.text.split(/\s+/).filter((t) => t.startsWith("eyJ"));
    }
    const list = Array.isArray(body.tokens) ? body.tokens : [body];
    return list
      .map((item) => (typeof item === "string" ? item : item?.accessToken))
      .filter((t) => typeof t === "string" && t.length > 0);
  }
  return [];
}

function todayPrefix() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

export async function POST(request, { params }) {
  const { provider } = await params;
  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Provider not supported" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: `Invalid JSON body: ${err.message}` }, { status: 400 });
  }

  const tokens = extractTokens(body);
  if (tokens.length === 0) {
    return NextResponse.json(
      { error: "No tokens found. Paste one JWT per line." },
      { status: 400 }
    );
  }

  // Existing tokens for dedupe + next name index
  const { getProviderConnections } = await import("@/models");
  let existing = [];
  try {
    existing = await getProviderConnections(provider);
  } catch {
    existing = [];
  }
  const existingTokenSet = new Set(
    existing
      .map((c) => c.apiKey || c.providerSpecificData?.accessToken || c.data?.accessToken)
      .filter(Boolean)
  );
  const nameRe = new RegExp(`^${todayPrefix()}-(\\d+)$`);
  let nextIndex = existing.reduce((max, c) => {
    const m = nameRe.exec(c.name || "");
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);

  const results = [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  // SERIAL loop — createProviderConnection reorders priorities in a transaction.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      if (existingTokenSet.has(token)) {
        results.push({ index: i, ok: true, skipped: true, reason: "duplicate" });
        skipped++;
        continue;
      }

      const payload = decodeJwtPayload(token);
      if (!payload) throw new Error("Invalid JWT (cannot decode payload)");

      const exp = typeof payload.exp === "number" ? payload.exp : null;
      const expiresAt = exp ? new Date(exp * 1000).toISOString() : null;

      nextIndex += 1;
      const created = await createProviderConnection({
        provider,
        authType: "apikey",
        name: `${todayPrefix()}-${nextIndex}`,
        apiKey: token,
        priority: 3,
        testStatus: "active",
        ...(expiresAt ? { expiresAt } : {}),
      });

      results.push({ index: i, ok: true, id: created.id, name: created.name });
      success++;
    } catch (e) {
      results.push({ index: i, ok: false, error: e.message || "Unknown error" });
      failed++;
    }
  }

  return NextResponse.json({ success, failed, skipped, results });
}
