import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  return {
    error: {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code
    }
  };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Extract precise quota reset timestamp (epoch ms) from error body, headers, or details.
 * Universal support across Google (Antigravity/Gemini), Codex, OpenAI, and other providers.
 */
export function extractQuotaResetMs(bodyText, response) {
  let resetsAtMs = null;
  const now = Date.now();

  // 1. Check Retry-After / retry-after header
  const retryHeader = response?.headers?.get?.("retry-after") || response?.headers?.get?.("Retry-After");
  if (retryHeader) {
    const sec = parseInt(retryHeader, 10);
    if (!isNaN(sec) && sec > 0) {
      resetsAtMs = now + sec * 1000;
    } else {
      const d = Date.parse(retryHeader);
      if (!isNaN(d) && d > now) resetsAtMs = d;
    }
  }

  // 2. Parse JSON error structures
  if (bodyText) {
    try {
      const json = JSON.parse(bodyText);
      const err = json?.error || json;

      // Google RPC / Antigravity error details
      const details = err?.details || json?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d?.metadata?.quotaResetTimeStamp) {
            const t = Date.parse(d.metadata.quotaResetTimeStamp);
            if (!isNaN(t) && t > now) {
              resetsAtMs = t;
              break;
            }
          }
          if (d?.metadata?.quotaResetDelay) {
            const m = String(d.metadata.quotaResetDelay).match(/(\d+)h(?:(\d+)m)?(?:(\d+)s)?/i);
            if (m) {
              const h = parseInt(m[1] || "0", 10);
              const min = parseInt(m[2] || "0", 10);
              const s = parseInt(m[3] || "0", 10);
              const totalSec = h * 3600 + min * 60 + s;
              if (totalSec > 0) {
                resetsAtMs = now + totalSec * 1000;
                break;
              }
            }
          }
          if (d?.retryDelay) {
            const sec = parseFloat(String(d.retryDelay).replace("s", ""));
            if (!isNaN(sec) && sec > 0) {
              resetsAtMs = now + Math.round(sec * 1000);
              break;
            }
          }
        }
      }

      // Codex / OpenAI / generic reset fields
      if (!resetsAtMs) {
        const rawReset = err?.resets_at ?? err?.reset_at ?? err?.resetsAt ?? err?.resetAt;
        if (typeof rawReset === "number" && rawReset > 0) {
          const ms = rawReset > 1e11 ? rawReset : rawReset * 1000;
          if (ms > now) resetsAtMs = ms;
        } else if (typeof rawReset === "string") {
          const t = Date.parse(rawReset);
          if (!isNaN(t) && t > now) resetsAtMs = t;
        }
      }

      if (!resetsAtMs) {
        const rawInSec = err?.resets_in_seconds ?? err?.reset_in_seconds ?? err?.retry_after ?? err?.retryAfter;
        if (typeof rawInSec === "number" && rawInSec > 0) {
          resetsAtMs = now + rawInSec * 1000;
        }
      }
    } catch {}

    // 3. Fallback regex on string message (e.g. "Resets in 166h22m46s" or "resets in 2 hours")
    if (!resetsAtMs) {
      const resetInMatch = String(bodyText).match(/resets?\s+in\s+(\d+)\s*(hour|h|min|m|s|second)/i);
      if (resetInMatch) {
        const n = parseInt(resetInMatch[1], 10);
        const unit = resetInMatch[2].toLowerCase();
        let mult = 1000;
        if (unit.startsWith("h")) mult = 3600 * 1000;
        else if (unit.startsWith("m")) mult = 60 * 1000;
        if (n > 0) resetsAtMs = now + n * mult;
      }
    }
  }

  return resetsAtMs;
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        const resetsAtMs = parsed.resetsAtMs || extractQuotaResetMs(bodyText, response);
        return {
          statusCode: parsed.status || response.status,
          message: msg,
          resetsAtMs,
          // Executors declare IP/pool-scoped failures (e.g. per-IP rate limits)
          // here; chatCore completes poolId/scope and retries via another pool.
          poolScoped: parsed.poolScoped,
        };
      }
    } catch { /* fall through to default parsing */ }
  }

  let message = "";
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
  } catch {
    message = bodyText;
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
  const resetsAtMs = extractQuotaResetMs(bodyText, response);

  return { statusCode: response.status, message: finalMessage, resetsAtMs };
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, message)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman) {
  const retryAfterSec = Math.max(Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000), 1);
  const msg = `${message} (${retryAfterHuman})`;
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec)
      }
    }
  );
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = error.message || "Unknown error";
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}
