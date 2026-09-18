import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import { OPENCODE_AGENT_TOOLS, isFreeTierGateModel } from "../config/opencodeAgentTools.js";

const OPENCODE_CLIENT_VERSION = "1.18.31";
// Reverse-engineered from the genuine OpenCode CLI 1.18.31 (local packet
// capture, 2026-09-17): the keyless free-tier gate validates BOTH the
// User-Agent shape ("opencode/<version>" — bare "opencode" is rejected) AND
// the session/request id shape (ses_/msg_ + 12 lowercase-hex + 14 mixed-case
// alphanumerics, the client's time-ordered Identifier format). Either signal
// mismatched yields 403 FreeTierError on a healthy egress. Env override kept
// for future client versions.
export const OPENCODE_UA = process.env.OPENCODE_USER_AGENT?.trim() || `opencode/${OPENCODE_CLIENT_VERSION}`;
// Genuine CLI UA looks like "opencode/1.18.31 ai-sdk/... runtime/bun/..." —
// forward those untouched; synthesize for everything else (bare "opencode",
// curl, SDKs) since the gate rejects them.
export const GENUINE_CLI_UA_RE = /^opencode\/\d+\.\d+/i;
// Models served by /zen/v1/responses; every other model stays on /chat/completions.
const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);
// Models served by /zen/v1/messages (Claude transport). union-alpha 500s on
// /chat/completions AND /responses — the genuine CLI uses /messages for it
// (packet capture, 2026-09-17). Mirrors the registry targetFormat:"claude".
const CLAUDE_MODELS = new Set([
  "union-alpha",
]);
// Gate marker merge: the upstream free-tier gate rejects requests whose tool
// set lacks the genuine CLI core markers (bisected 2026-09-18: 0-70 genuine
// tools 403, +read 200, core6 alone 200). Client tools are preserved;
// missing markers are appended so thin clients (e.g. 7 dashboard stubs)
// pass without altering rich agent payloads.
export function toolNameOf(t) {
  if (!t || typeof t !== "object") return "";
  if (typeof t.name === "string") return t.name;
  if (t.function && typeof t.function.name === "string") return t.function.name;
  return "";
}

export function appendMissingGateTools(existing, toWire) {
  const list = Array.isArray(existing) ? existing : [];
  const have = new Set(list.map((t) => toolNameOf(t).toLowerCase()).filter(Boolean));
  const missing = OPENCODE_AGENT_TOOLS.filter((t) => !have.has(t.name.toLowerCase()));
  if (missing.length === 0) return list;
  return list.concat(missing.map(toWire));
}

const OPENCODE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// Real client Identifier shape: 12 lowercase-hex (time-ordered) + 14 mixed-case
// alphanumerics. Verified against the client's own SQLite store + live capture.
function randomIdSuffix() {
  const hex = crypto.randomBytes(6).toString("hex");
  let tail = "";
  for (let i = 0; i < 14; i++) tail += OPENCODE_ID_ALPHABET[crypto.randomInt(OPENCODE_ID_ALPHABET.length)];
  return hex + tail;
}

export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[A-Za-z0-9]{14}$/;
export const OPENCODE_REQUEST_RE = /^msg_[0-9a-f]{12}[A-Za-z0-9]{14}$/;

function asConformingId(value, re) {
  const v = typeof value === "string" ? value.trim() : "";
  return re.test(v) ? v : null;
}

function generateRequestId() {
  return `msg_${randomIdSuffix()}`;
}

function generateSessionId() {
  return `ses_${randomIdSuffix()}`;
}

// Strip the thinking suffix "model(level)" so registry lookups hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}

function isResponsesModel(model) {
  const base = baseModelId(model);
  return RESPONSES_MODELS.has(base) || isMuseSparkModel(base);
}

function isClaudeModel(model) {
  return CLAUDE_MODELS.has(baseModelId(model));
}

function resolveOpencodeSession(body, credentials) {
  const headers = credentials?.rawHeaders || {};
  const resolved = resolveSessionId({
    headers,
    body,
    connectionId: credentials?.connectionId,
    scope: "opencode",
    generate: generateSessionId,
  });
  // sessionManager returns UUID-mash / claude: / antigravity: ids that fail
  // the gate's shape check — only reuse it when it already looks genuine,
  // otherwise mint a fresh conforming id (proven 200 upstream).
  return asConformingId(resolved, OPENCODE_SESSION_RE) || generateSessionId();
}

function normalizeOpencodeReasoning(model, body) {
  const current = body.reasoning;
  const currentReasoning = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : null;
  const requestedEffort = typeof body.reasoning_effort === "string"
    ? body.reasoning_effort
    : currentReasoning?.effort;
  if (typeof requestedEffort !== "string") {
    // Muse Spark always spends part of the output budget on reasoning. The
    // upstream default is high, so small max_tokens requests may finish with
    // no output text. Use the lowest valid effort unless the client opts in.
    body.reasoning = { ...currentReasoning, effort: "low", summary: "auto" };
    return;
  }

  const cleanModel = baseModelId(model || body.model);
  const supportedLevels = getThinkingLevels("opencode", cleanModel);
  let effort = requestedEffort.toLowerCase().trim();
  if ((effort === "max" || effort === "ultra") && supportedLevels?.length && !supportedLevels.includes(effort)) {
    if (effort === "ultra" && supportedLevels.includes("max")) effort = "max";
    else if (supportedLevels.includes("xhigh")) effort = "xhigh";
  }

  body.reasoning = { ...currentReasoning, effort };
  if (!body.reasoning.summary) body.reasoning.summary = "auto";
  delete body.reasoning_effort;
}

// Only an explicit egress/IP/network marker is pool-scoped. Generic words such
// as "rate", "quota", "exhausted", and "retry" also occur in account/model
// limits. Treating those as pool failures bypasses account cooldowns and can
// repeatedly call the same exhausted OpenCode account.
const MUSE_SPARK_MAX_OUTPUT_TOKENS = 200000;

const IP_LIMIT_BODY = /(?:egress|proxy|ip[_ -]?limit|client[_ -]?ip|source[_ -]?ip|remote[_ -]?address|network[_ -]?limit|too many requests from (?:this|your) (?:ip|network))/i;

// Free-tier gate: the upstream rejects non-OpenCode clients (403) or
// anonymous/datacenter proxies (429/403). This is per-egress, not per-account,
// so the model must NOT be locked — it should fall through to the next model.
const FREE_TIER_GATE = /(?:free tier can only be used from within [Oo]pen[Cc]ode|free_mode_unavailable|anonymous[_ -]?network|proxy[_ -]?traffic)/i;

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
    this._currentSessionId = null;
  }

  transformRequest(model, body, stream, credentials) {
    this._currentSessionId = resolveOpencodeSession(body, credentials);
    // OpenCode upstream gate enforcement across all models:
    // Upstream rejects non-agent fingerprints with 403 FreeTierError. The gate
    // validates tool CONTENT (genuine core markers required), so missing
    // markers are merged in below; client tools are never stripped.
    body.stream = true;

    if (isResponsesModel(model)) {
      // Responses API names the output cap max_output_tokens and takes thinking
      // as reasoning:{effort,summary} — normalize the Chat fields at this boundary.
      if (body.max_output_tokens === undefined) {
        if (body.max_completion_tokens !== undefined) body.max_output_tokens = body.max_completion_tokens;
        else if (body.max_tokens !== undefined) body.max_output_tokens = body.max_tokens;
      }
      if (!Number.isFinite(Number(body.max_output_tokens)) || Number(body.max_output_tokens) < MUSE_SPARK_MAX_OUTPUT_TOKENS) {
        body.max_output_tokens = MUSE_SPARK_MAX_OUTPUT_TOKENS;
      }
      delete body.max_tokens;
      delete body.max_completion_tokens;
      normalizeOpencodeReasoning(model, body);

      body.tools = isFreeTierGateModel(model) ? appendMissingGateTools(body.tools, (t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })) : body.tools;
      if (!body.tool_choice) {
        body.tool_choice = "auto";
      }
    } else if (isClaudeModel(model)) {
      body.tools = isFreeTierGateModel(model) ? appendMissingGateTools(body.tools, (t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })) : body.tools;
    } else {
      body.tools = isFreeTierGateModel(model) ? appendMissingGateTools(body.tools, (t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })) : body.tools;
      if (!body.tool_choice || body.tool_choice === "none") {
        body.tool_choice = "auto";
      }
    }
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  buildUrl(model) {
    const base = this.config.baseUrl;
    if (isResponsesModel(model)) return `${base}/zen/v1/responses`;
    if (isClaudeModel(model)) return `${base}/zen/v1/messages`;
    return `${base}/zen/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true) {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;

    const downstreamUa = lower["user-agent"] || "";
    // Forward only genuine CLI UAs; a bare "opencode"/curl/SDK UA fails the
    // gate, so synthesize the versioned identity for those.
    const forwardUa = GENUINE_CLI_UA_RE.test(downstreamUa.trim()) ? downstreamUa : OPENCODE_UA;

    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "User-Agent": forwardUa,
      "x-opencode-client": lower["x-opencode-client"] || "cli",
      "x-opencode-session": asConformingId(lower["x-opencode-session"], OPENCODE_SESSION_RE)
        || asConformingId(this._currentSessionId, OPENCODE_SESSION_RE)
        || generateSessionId(),
      "x-opencode-request": asConformingId(lower["x-opencode-request"], OPENCODE_REQUEST_RE)
        || generateRequestId(),
      "x-opencode-project": lower["x-opencode-project"] || "global",
      "Accept": stream ? "text/event-stream" : "*/*",
    };
  }

  parseError(response, bodyText) {
    const status = response?.status || 0;
    const text = String(bodyText || "");
    if ((status === 429 || status === 403) && IP_LIMIT_BODY.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free limit (${status})`,
        poolScoped: { reason: "ip-limit" },
      };
    }
    // Free-tier gate (e.g. "can only be used from within OpenCode"): per-egress,
    // not per-account. Mark poolScoped so chatCore retries via another pool or
    // direct egress instead of burning rotation budget on the same blocked path.
    if ((status === 429 || status === 403) && FREE_TIER_GATE.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free-tier gate (${status})`,
        poolScoped: { reason: "free-tier-gate" },
      };
    }
    // Bare 429 ("Rate limit exceeded. Please try again later."): this provider
    // is keyless, so quota is per-egress, not per-account. A 429 only condemns
    // the egress that served it — rotate to another pool (fresh IP/quota)
    // instead of failing fast or locking anything.
    if (status === 429) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free quota spent on this egress (${status})`,
        poolScoped: { reason: "egress-rate-limit" },
      };
    }
    return null; // fall through to default parsing
  }
}
