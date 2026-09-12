/**
 * Shared combo (model combo) handling with fallback support
 */

import { checkFallbackError, formatRetryAfter } from "./accountFallback.js";
import { unavailableResponse } from "../utils/error.js";
import { COMBO_TARGET_TIMEOUT_MS, COMBO_LOOP_SAFETY_MS } from "../config/errorConfig.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";
import { extractTextContent } from "../translator/formats/gemini.js";

// Hard capabilities = input modalities; missing one drops request data (e.g. image
// stripped). Must be prioritized. Soft (e.g. search) only degrades a feature.
const HARD_CAPS = new Set(["vision", "pdf", "audioInput", "videoInput"]);

// Prefixes used when flattening tool turns into plain prose for panel models.
const TOOL_CALL_PREFIX = "[Called tools: ";
const TOOL_RESULT_PREFIX = "[Tool result: ";

// Flatten tool turns into prose so panel models keep the context but can't loop
// on tools: drop the request's tools, turn tool/function results into assistant
// text, and inline assistant tool_calls names instead of the structured field.
function flattenToolHistory(messages) {
  return messages
    .filter((msg) => msg)
    .map((msg) => {
      if (msg.role === "tool" || msg.role === "function") {
        return { role: "assistant", content: `${TOOL_RESULT_PREFIX}${extractTextContent(msg.content) || String(msg.content ?? "")}]` };
      }
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        const { tool_calls, ...rest } = msg;
        const names = tool_calls.map((c) => c?.function?.name || c?.name || "tool").join(", ");
        const base = extractTextContent(rest.content) || (typeof rest.content === "string" ? rest.content : "");
        return { ...rest, content: `${base}${base ? "\n" : ""}${TOOL_CALL_PREFIX}${names}]` };
      }
      if (Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((c) => c.type === "tool_use");
        const hasToolResult = msg.content.some((c) => c.type === "tool_result");
        if (hasToolUse || hasToolResult) {
          const textParts = [];
          const toolNames = [];
          const toolResults = [];
          for (const block of msg.content) {
            if (block.type === "text" && block.text) textParts.push(block.text);
            if (block.type === "tool_use") toolNames.push(block.name || "tool");
            if (block.type === "tool_result") toolResults.push(extractTextContent(block.content) || String(block.content ?? ""));
          }
          const { ...rest } = msg;
          let newContent = textParts.join("\n");
          if (toolNames.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_CALL_PREFIX}${toolNames.join(", ")}]`;
          }
          if (toolResults.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_RESULT_PREFIX}${toolResults.join("\n")}]`;
          }
          return { ...rest, content: newContent };
        }
      }
      return msg;
    });
}

// Reorder combo models by capability fit. Stable; never drops a model (fallback intact).
// Tier 0: satisfies all hard + all soft. Tier 1: all hard only. Tier 2: rest.
export function reorderByCapabilities(models, required) {
  if (!required || required.size === 0 || !Array.isArray(models) || models.length <= 1) return models;
  const hard = [...required].filter((c) => HARD_CAPS.has(c));
  const soft = [...required].filter((c) => !HARD_CAPS.has(c));

  const tierOf = (m) => {
    const slash = typeof m === "string" ? m.indexOf("/") : -1;
    const provider = slash > 0 ? m.slice(0, slash) : "";
    const model = slash > 0 ? m.slice(slash + 1) : m;
    const caps = getCapabilitiesForModel(provider, model);
    if (!hard.every((c) => caps[c] === true)) return 2;
    return soft.every((c) => caps[c] === true) ? 0 : 1;
  };

  // Stable sort by tier (Array.prototype.sort is stable in modern engines).
  const tiers = models.map((m, i) => ({ m, i, t: tierOf(m) }));
  if (tiers.every((x) => x.t === tiers[0].t)) return models;

  return tiers
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
}
/**
 * Track rotation state per combo (for round-robin strategy)
 * @type {Map<string, { index: number, consecutiveUseCount: number }>}
 */
const comboRotationState = new Map();

// Trailing run of items after the last assistant/model turn = the current user
// turn. It may span several messages (e.g. text + image split across blocks),
// so we return all of them. History media (older turns) must not pin the combo
// to a vision model — those get stripped + placeholdered downstream instead.
function trailingUserItems(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const isAssistant = (r) => r === "assistant" || r === "model";
  let i = arr.length - 1;
  while (i >= 0 && !isAssistant(arr[i]?.role)) i--;
  return arr.slice(i + 1);
}

// Detect which capabilities a request needs. Modalities (vision/pdf) are scanned
// only on the current user turn; "search" is request-wide (lives in tools).
// Returns a Set of: "vision" | "pdf" | "search".
export function detectRequiredCapabilities(body) {
  const required = new Set();
  if (!body || typeof body !== "object") return required;

  const addByMime = (mime) => {
    if (typeof mime !== "string") return;
    if (mime.startsWith("image/")) required.add("vision");
    else if (mime === "application/pdf") required.add("pdf");
    else if (mime.startsWith("audio/")) required.add("audioInput");
    else if (mime.startsWith("video/")) required.add("videoInput");
  };

  const scanBlock = (b) => {
    if (!b || typeof b !== "object") return;
    const t = b.type;
    if (t === "image_url" || t === "image" || t === "input_image") required.add("vision");
    if (t === "input_audio" || t === "audio_url" || t === "audio") required.add("audioInput");
    if (t === "input_video" || t === "video_url" || t === "video") required.add("videoInput");
    if (t === "file" || t === "document" || t === "input_file") {
      // Infer modality from embedded mime when available; fall back to pdf for generic files.
      let fmime = null;
      if (b.input_audio?.format) fmime = `audio/${b.input_audio.format}`;
      else if (b.file?.file_data) fmime = String(b.file.file_data).match(/^data:([^;,]+)/)?.[1];
      else if (b.source?.media_type) fmime = b.source.media_type;
      else if (b.source?.data) fmime = String(b.source.data).match(/^data:([^;,]+)/)?.[1];
      if (fmime) addByMime(fmime);
      else required.add("pdf");
    }
    // gemini parts: inlineData/fileData carry a mime
    addByMime(b.inlineData?.mimeType || b.fileData?.mimeType);
  };

  const scanContent = (content) => {
    if (Array.isArray(content)) for (const b of content) scanBlock(b);
  };

  const scanMessage = (m) => {
    if (!m || typeof m !== "object") return;

    // Ollama / Hermes images array (strings or objects)
    if (Array.isArray(m.images) && m.images.length > 0) {
      required.add("vision");
    }

    // Vercel AI SDK / Hermes attachments / experimental_attachments
    const attachments = m.experimental_attachments || m.attachments;
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att) continue;
        const mime = att.contentType || att.mediaType || (typeof att.url === "string" && att.url.match(/^data:([^;,]+)/)?.[1]);
        if (mime) addByMime(mime);
        else if (att.url || att.data) required.add("vision");
      }
    }

    // Direct message-level modality properties
    if (m.image_url || m.image) required.add("vision");
    if (m.audio_url || m.audio) required.add("audioInput");

    // Scan array content blocks
    scanContent(m.content);

    // Scan string content for embedded data URIs
    if (typeof m.content === "string") {
      if (m.content.includes("data:image/")) required.add("vision");
      else if (m.content.includes("data:audio/")) required.add("audioInput");
      else if (m.content.includes("data:application/pdf")) required.add("pdf");
    }
  };

  // Modalities: current user turn only (trailing user run across each known shape).
  for (const m of trailingUserItems(body.messages)) scanMessage(m);              // openai / claude / hermes / ollama
  for (const it of trailingUserItems(body.input)) scanContent(it.content);       // responses
  const contents = body.contents || body.request?.contents;                      // gemini / antigravity
  for (const c of trailingUserItems(contents)) scanContent(c.parts);
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (tool?.type === "web_search" || tool?.type === "web_search_preview" || tool?.type === "search" || tool?.function?.name === "web_search") {
        required.add("search");
      }
    }
  }

  return required;
}

function normalizeStickyLimit(stickyLimit) {
  const parsed = Number.parseInt(stickyLimit, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function rotateModelsFromIndex(models, currentIndex) {
  const rotatedModels = [...models];
  for (let i = 0; i < currentIndex; i++) {
    const moved = rotatedModels.shift();
    rotatedModels.push(moved);
  }
  return rotatedModels;
}

/**
 * Get rotated model list based on strategy
 * @param {string[]} models - Array of model strings
 * @param {string} comboName - Name of the combo
 * @param {string} strategy - "fallback" or "round-robin"
 * @param {number|string} [stickyLimit=1] - Requests per combo model before switching
 * @returns {string[]} Rotated models array
 */
export function getRotatedModels(models, comboName, strategy, stickyLimit = 1) {
  if (!models || models.length <= 1 || strategy !== "round-robin") {
    return models;
  }

  const rotationKey = comboName || "__default__";
  const normalizedStickyLimit = normalizeStickyLimit(stickyLimit);
  const existingState = comboRotationState.get(rotationKey);
  const state = typeof existingState === "number"
    ? { index: existingState, consecutiveUseCount: 0 }
    : (existingState || { index: 0, consecutiveUseCount: 0 });

  const currentIndex = state.index % models.length;
  const rotatedModels = rotateModelsFromIndex(models, currentIndex);
  const nextUseCount = state.consecutiveUseCount + 1;

  if (nextUseCount >= normalizedStickyLimit) {
    comboRotationState.set(rotationKey, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    comboRotationState.set(rotationKey, {
      index: currentIndex,
      consecutiveUseCount: nextUseCount,
    });
  }

  return rotatedModels;
}

/**
 * Reset in-memory rotation state when combo/settings change
 * @param {string} [comboName] - Combo name to reset; omit to clear all
 */
export function resetComboRotation(comboName) {
  if (comboName) comboRotationState.delete(comboName);
  else comboRotationState.clear();
}

/**
 * Get combo models from combos data
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {string[]|null} Array of models or null if not a combo
 */
export function getComboModelsFromData(modelStr, combosData) {
  // Don't check if it's in provider/model format
  if (modelStr.includes("/")) return null;
  
  // Handle both array and object formats
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);
  
  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Handle combo chat with fallback
 * @param {Object} options
 * @param {Object} options.body - Request body
 * @param {string[]} options.models - Array of model strings to try
 * @param {Function} options.handleSingleModel - Function to handle single model: (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger object
 * @param {string} [options.comboName] - Name of the combo (for round-robin tracking)
 * @param {string} [options.comboStrategy] - Strategy: "fallback" or "round-robin"
 * @param {number|string} [options.comboStickyLimit=1] - Requests per combo model before switching
 * @returns {Promise<Response>}
 */
export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1, autoSwitch = true, rotationBudget = null, targetTimeoutMs = COMBO_TARGET_TIMEOUT_MS, loopSafetyMs = COMBO_LOOP_SAFETY_MS }) {
  // Apply rotation strategy if enabled
  let rotatedModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit);

  // Auto-switch: float models that satisfy the request's required capabilities to the front.
  if (autoSwitch) {
    const required = detectRequiredCapabilities(body);
    if (required.size > 0) {
      const reordered = reorderByCapabilities(rotatedModels, required);
      if (reordered[0] !== rotatedModels[0]) {
        log.info("COMBO", `auto-switch for [${[...required].join(",")}] → ${reordered[0]}`);
      }
      rotatedModels = reordered;
    }
  }
  
  let lastError = null;
  let earliestRetryAfter = null;
  let lastStatus = null;

  // Loop safety net: absolute wall-clock cap for the whole fallback pass so
  // member timeouts can never stack without bound. Fail-open (timer unref'd).
  // The deadline also races each in-flight member await — checking a flag
  // between members is not enough when a member hangs forever.
  const loopDeadline = loopSafetyMs > 0 ? Date.now() + loopSafetyMs : Infinity;
  let loopTimer = null;
  if (loopSafetyMs > 0) {
    loopTimer = setTimeout(() => {}, loopSafetyMs);
    if (loopTimer.unref) loopTimer.unref();
  }
  const loopTimeoutOutcome = () => {
    const ms = Math.max(0, loopDeadline - Date.now());
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ loopTimedOut: true }), ms);
      if (t.unref) t.unref();
    });
  };

  // Race one member attempt against the per-target timeout. On timeout the
  // attempt's AbortController fires (callers that thread the signal abort the
  // orphaned upstream); the synthetic 504 stays fallback-eligible and never
  // penalizes the account. Resolves { result, timedOut } and never rejects.
  const runMemberWithTimeout = (modelStr) => new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { controller.abort(new Error("combo_target_timeout")); } catch {}
      resolve({ result: null, timedOut: true });
    }, Math.max(1, targetTimeoutMs));
    if (timer.unref) timer.unref();
    Promise.resolve()
      .then(() => handleSingleModel(body, modelStr, { signal: controller.signal }))
      .then(
        (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ result, timedOut: false }); } },
        (error) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ result: null, thrown: error }); } },
      );
  });

  for (let i = 0; i < rotatedModels.length; i++) {
    if (Date.now() >= loopDeadline) {
      const msg = `Combo loop safety timeout (${loopSafetyMs}ms) exceeded${lastError ? `: ${lastError}` : ""}`;
      log.warn("COMBO", msg);
      if (loopTimer) clearTimeout(loopTimer);
      return unavailableResponse(504, msg, earliestRetryAfter, earliestRetryAfter ? formatRetryAfter(earliestRetryAfter) : null, { code: "COMBO_TIMEOUT" });
    }
    // Shared-budget short-circuit: once the request spent its whole rotation
    // budget on earlier members, stop here instead of paying a credential
    // lookup + refresh check per remaining member only to 503 each of them.
    if (rotationBudget && typeof rotationBudget.used === "number"
        && typeof rotationBudget.max === "number" && rotationBudget.used >= rotationBudget.max) {
      const msg = `Max rotation attempts (${rotationBudget.max}) reached${lastError ? `: ${lastError}` : ""}`;
      log.warn("COMBO", `Rotation budget spent — stopping | ${msg}`);
      if (loopTimer) clearTimeout(loopTimer);
      return unavailableResponse(503, msg, earliestRetryAfter, earliestRetryAfter ? formatRetryAfter(earliestRetryAfter) : null, { code: "ROTATION_BUDGET" });
    }
    const modelStr = rotatedModels[i];
    log.info("COMBO", `Trying model ${i + 1}/${rotatedModels.length}: ${modelStr}`);

    // Fair-share accounting for the shared rotation budget: each member gets
    // at most ceil(budget/members) upstream attempts so one dead member with
    // many accounts cannot starve the rest of the combo.
    if (rotationBudget) {
      rotationBudget.membersTotal = rotatedModels.length;
      rotationBudget.memberIndex = i;
    }

    try {
      const outcome = loopSafetyMs > 0
        ? await Promise.race([runMemberWithTimeout(modelStr), loopTimeoutOutcome()])
        : await runMemberWithTimeout(modelStr);
      if (outcome.loopTimedOut) {
        const msg = `Combo loop safety timeout (${loopSafetyMs}ms) exceeded${lastError ? `: ${lastError}` : ""}`;
        log.warn("COMBO", msg);
        if (loopTimer) clearTimeout(loopTimer);
        return unavailableResponse(504, msg, earliestRetryAfter, earliestRetryAfter ? formatRetryAfter(earliestRetryAfter) : null, { code: "COMBO_TIMEOUT" });
      }
      const { result, timedOut, thrown } = outcome;

      if (thrown) throw thrown;

      if (timedOut) {
        // Per-target timeout: move on WITHOUT touching the account. A slow
        // member is not a dead account — no lock, no cooldown, just next.
        lastError = `Combo target timeout after ${targetTimeoutMs}ms`;
        lastStatus = 504;
        log.warn("COMBO", `Model ${modelStr} timed out after ${targetTimeoutMs}ms, trying next`);
        continue;
      }

      // Success (2xx) - validate non-streaming bodies before returning.
      if (result.ok) {
        // Quality gate (non-streaming only): an "ok" envelope with no text
        // AND no tool calls is a silent failure — fail over instead of
        // handing the client an empty answer. Streaming responses cannot be
        // inspected without consuming them, so they pass through.
        if (body.stream !== true && await isEmptySuccess(result)) {
          lastError = "Model returned empty content";
          lastStatus = 502;
          log.warn("COMBO", `Model ${modelStr} returned empty content, trying next`);
          continue;
        }
        log.info("COMBO", `Model ${modelStr} succeeded`);
        if (loopTimer) clearTimeout(loopTimer);
        return result;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let retryAfter = null;
      try {
        const errorBody = await result.clone().json();
        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
        retryAfter = errorBody?.retryAfter || null;
      } catch {
        // Ignore JSON parse errors
      }

      // Track earliest retryAfter across all combo models
      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
        earliestRetryAfter = retryAfter;
      }

      // Normalize error text to string (Worker-safe)
      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      // Check if should fallback to next model
      const { shouldFallback, cooldownMs } = checkFallbackError(result.status, errorText);

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        if (loopTimer) clearTimeout(loopTimer);
        return result;
      }

      // For transient errors (503/502/504), wait for cooldown before falling through
      // so a briefly-overloaded provider gets a chance to recover rather than being
      // skipped immediately (fixes: combo falls through on transient 503)
      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 5000 &&
          (result.status === 503 || result.status === 502 || result.status === 504)) {
        log.info("COMBO", `Model ${modelStr} transient ${result.status}, waiting ${cooldownMs}ms before next`);
        await new Promise(r => setTimeout(r, cooldownMs));
      }

      // Fallback to next model
      lastError = errorText || String(result.status);
      lastStatus = result.status;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
    } catch (error) {
      // Catch unexpected exceptions to ensure fallback continues
      lastError = error.message || String(error);
      lastStatus = 500;
      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
    }
  }

  // All models failed
  // Use 503 (Service Unavailable) rather than 406 (Not Acceptable) — 406 implies
  // the request itself is invalid, but here the providers are simply unavailable
  // or have no active credentials. 503 is more accurate and retryable by clients.
  const allDisabled = lastError && lastError.toLowerCase().includes("no credentials");
  const status = allDisabled ? 503 : (lastStatus || 503);
  const msg = lastError || "All combo models unavailable";

  if (loopTimer) clearTimeout(loopTimer);
  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
  }

  log.warn("COMBO", `All models failed | ${msg}`);
  return unavailableResponse(status, msg, null, null, { code: "COMBO_UNAVAILABLE" });
}

/**
 * Quality gate: is this "successful" response actually empty? True only when a
 * non-streaming JSON body has no assistant text AND no tool calls. Anything
 * unparseable or streaming-shaped is NOT empty (fail-open: never block a
 * response we cannot inspect).
 */
async function isEmptySuccess(result) {
  let json = null;
  try {
    json = await result.clone().json();
  } catch {
    return false;
  }
  if (!json || typeof json !== "object") return false;
  const choice = json.choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    if (extractTextContent(msg.content)?.trim()) return false;
    if (typeof choice.text === "string" && choice.text.trim()) return false;
    const calls = msg.tool_calls || msg.toolCalls;
    if (Array.isArray(calls) && calls.length > 0) return false;
    if (msg.function_call) return false;
    return true;
  }
  // Claude messages shape
  if (Array.isArray(json.content)) {
    const hasUseful = json.content.some((b) =>
      (b?.type === "text" && String(b.text || "").trim()) ||
      (b?.type === "tool_use" && b.name));
    return !hasUseful;
  }
  // Tool-call-only answers are valid (agentic clients live on these).
  if (Array.isArray(json.output) && json.output.some((o) =>
    o?.type === "function_call" || (Array.isArray(o?.content) && o.content.some((c) => c?.type === "function_call")))) {
    return false;
  }
  const cands = json.candidates || [];
  if (cands.some((c) => c?.content?.parts?.some((p) => p?.functionCall))) return false;
  // Gemini / Responses shapes: any text anywhere counts as content.
  const text = extractPanelText(json);
  if (text.trim()) return false;
  return true;
}

/**
 * Extract assistant text from a non-stream completion across formats
 * (OpenAI chat, Claude messages, Gemini, OpenAI Responses). Returns "" if none.
 * Panel responses are already translated to the client format by chatCore, so the
 * leaf content→string step reuses the translator's own extractTextContent.
 */
function extractPanelText(json) {
  if (!json || typeof json !== "object") return "";

  // OpenAI chat completion
  const choice = json.choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    const t = extractTextContent(msg.content);
    if (t.trim()) return t;
    if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  }

  // Claude messages (text blocks share OpenAI's {type:"text"} shape)
  const claudeText = extractTextContent(json.content);
  if (claudeText.trim()) return claudeText;

  // Gemini (parts carry .text without a type discriminator)
  const parts = json.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p) => p?.text || "").join("");
    if (t.trim()) return t;
  }

  // OpenAI Responses API
  if (Array.isArray(json.output)) {
    const t = json.output
      .flatMap((o) => (Array.isArray(o.content) ? o.content.map((c) => c?.text || "") : []))
      .join("");
    if (t.trim()) return t;
  }

  return "";
}

/**
 * Append a synthesized user turn to whichever message array the request format uses.
 * Preserves the original conversation + system prompt so the judge has full context.
 */
function appendUserTurn(body, text) {
  const next = { ...body };
  if (Array.isArray(body.messages)) {
    next.messages = [...body.messages, { role: "user", content: text }];
  } else if (Array.isArray(body.input)) {
    next.input = [...body.input, { role: "user", content: text }];
  } else if (Array.isArray(body.contents)) {
    next.contents = [...body.contents, { role: "user", parts: [{ text }] }];
  } else {
    next.messages = [{ role: "user", content: text }];
  }
  return next;
}

/**
 * Build the judge directive. Per OpenRouter's Fusion design, the judge does NOT
 * merge — it analyzes (consensus / contradictions / partial coverage / unique
 * insights / blind spots) then writes one answer grounded in that analysis.
 * ~3/4 of fusion's quality lift comes from this synthesis step.
 *
 * Sources are anonymized ("Source N") so the judge weighs substance, not the
 * reputation of a model brand.
 */
const MAX_JUDGE_PANEL_CHARS = 24000;

function buildJudgePrompt(answers) {
  // Cap total panel text: unbounded concatenation blows the judge context and
  // fails the whole fusion with 400/413. Truncate the longest answers first so
  // every source stays represented.
  const budget = MAX_JUDGE_PANEL_CHARS;
  const perSource = Math.max(2000, Math.floor(budget / Math.max(1, answers.length)));
  const panel = answers
    .map((a, i) => {
      const text = a.text.length > perSource
        ? `${a.text.slice(0, perSource)}\n…[truncated ${a.text.length - perSource} chars]`
        : a.text;
      return `[Source ${i + 1}]\n${text}`;
    })
    .join("\n\n");

  return [
    `You are the JUDGE in a model-fusion panel. ${answers.length} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
    "",
    "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
    "",
    "First, internally analyze the panel along these dimensions: consensus (points most sources agree on — treat as higher-confidence), contradictions (where they disagree — resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed. Then write the best possible final answer grounded in that analysis — more complete and correct than any single response, with no filler.",
    "",
    "=== PANEL RESPONSES ===",
    panel,
    "=== END PANEL RESPONSES ===",
    "",
    "Now write the final answer to the user's original request.",
  ].join("\n");
}

// Fusion tuning. Overridable per-combo via settings.comboStrategies[name].
const FUSION_DEFAULTS = {
  minPanel: 2,             // answers needed before stragglers get a grace window
  stragglerGraceMs: 8000,  // wait this long for laggards once quorum is reached
  panelHardTimeoutMs: 90000, // absolute cap so one hung model can't stall forever
};

// Resolve a Response (or {__error}) within ms; the loser keeps running but is ignored.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ __timeout: true }), ms);
    Promise.resolve(promise)
      .then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); resolve({ __error: e }); });
  });
}

/**
 * Collect panel responses with quorum-grace: as soon as `minPanel` calls succeed,
 * start a short grace timer for the rest, then proceed with whatever arrived. This
 * caps the straggler penalty (the slowest model otherwise dominates wall time) while
 * still preferring a full panel when everyone is fast. Bounded by a hard timeout.
 * Returns a sparse array aligned to `calls` (undefined = not yet / dropped).
 */
function collectPanel(calls, { minPanel, stragglerGraceMs, panelHardTimeoutMs }) {
  return new Promise((resolve) => {
    const out = new Array(calls.length);
    let settled = 0;
    let ok = 0;
    let finished = false;
    let graceTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(out);
    };
    const hardTimer = setTimeout(finish, panelHardTimeoutMs);
    calls.forEach((p, i) => {
      Promise.resolve(p)
        .then((v) => { out[i] = v; })
        .catch((e) => { out[i] = { __error: e }; })
        .finally(() => {
          settled++;
          if (out[i] && out[i].ok) ok++;
          if (settled === calls.length) return finish();
          if (ok >= minPanel && !graceTimer) graceTimer = setTimeout(finish, stragglerGraceMs);
        });
    });
  });
}

/**
 * Handle a fusion combo: fan the prompt out to every panel model in parallel,
 * then a judge model synthesizes one final answer from all panel responses.
 *
 * Panel calls are forced non-streaming with tools stripped (the judge needs
 * complete prose to synthesize). The judge call keeps the client's original
 * stream flag + tools, so streaming and downstream tool use still work.
 *
 * Speed: quorum-grace collection caps the straggler penalty. Quality: the judge
 * runs the consensus/contradiction/blind-spot analysis before writing.
 *
 * Degrades gracefully: 0 panel answers -> 503, exactly 1 -> return it directly.
 *
 * @param {Object} options
 * @param {Object} options.body - Request body (client format)
 * @param {string[]} options.models - Panel model strings
 * @param {Function} options.handleSingleModel - (body, modelStr) => Promise<Response>
 * @param {Object} options.log - Logger
 * @param {string} [options.comboName] - Combo name (logging)
 * @param {string} [options.judgeModel] - Judge model; falls back to panel[0]
 * @param {Object} [options.tuning] - Override FUSION_DEFAULTS (minPanel, grace, timeout)
 * @returns {Promise<Response>}
 */
export async function handleFusionChat({ body, models, handleSingleModel, log, comboName, judgeModel, tuning, rotationBudget = null }) {
  const panel = Array.isArray(models) ? models.filter(Boolean) : [];
  if (panel.length === 0) {
    return new Response(
      JSON.stringify({ error: { message: "Fusion combo has no models" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // A single-model fusion has nothing to fuse — just answer directly.
  if (panel.length === 1) {
    return handleSingleModel(body, panel[0]);
  }

  const cfg = { ...FUSION_DEFAULTS, ...(tuning || {}) };
  // minPanel=1 is legal: one fast answer need not wait the straggler grace.
  const minPanel = Math.min(Math.max(1, cfg.minPanel), panel.length);
  const judge = judgeModel && judgeModel.trim() ? judgeModel.trim() : panel[0];
  log.info("FUSION", `Combo "${comboName}" | panel=${panel.length} [${panel.join(", ")}] | judge=${judge} | quorum=${minPanel}`);

  // 1. Fan out to the panel in parallel: non-streaming, tools stripped (we want prose).
  const { tools, tool_choice, stream_options, ...rest } = body;
  // Fusion runs panel models non-streaming; drop stream_options too, or providers
  // like DeepSeek reject it with "stream_options should be set along with stream = true".
  // See issue #3024.
  const panelBody = { ...rest, stream: false };

  // Flatten tool turns to prose so panel models keep context without emitting tool_calls.
  if (Array.isArray(panelBody.messages)) {
    panelBody.messages = flattenToolHistory(panelBody.messages);
  } else if (Array.isArray(panelBody.input)) {
    panelBody.input = flattenToolHistory(panelBody.input);
  }

  const t0 = Date.now();
  // Bound the parallel burst against the shared rotation budget: each panel
  // member (plus the judge chain below) draws from the same slots, so tell
  // member loops how many sharers exist for the fair-share cap.
  if (rotationBudget && !rotationBudget.membersTotal) {
    rotationBudget.membersTotal = panel.length + 1; // panel + judge chain
  }
  // One AbortController per panel member: once quorum/grace/timeout decides,
  // unfinished upstreams are aborted instead of billing orphaned generations.
  // Callers that ignore the signal keep the old leak behavior (fail-open).
  const panelControllers = panel.map(() => new AbortController());
  const settledFlags = panel.map(() => false);
  // Deep-clone per member: translators/RTK mutate body.messages in place, and
  // sharing one object across parallel panel calls races those mutations.
  const calls = panel.map((m, i) => withTimeout(
    Promise.resolve()
      .then(() => handleSingleModel(structuredClone(panelBody), m, { signal: panelControllers[i].signal, isPanel: true }))
      .finally(() => { settledFlags[i] = true; }),
    cfg.panelHardTimeoutMs));
  const settled = await collectPanel(calls, { ...cfg, minPanel });
  for (let i = 0; i < panel.length; i++) {
    if (!settledFlags[i]) {
      try { panelControllers[i].abort(new Error("fusion_straggler_aborted")); } catch {}
    }
  }
  log.info("FUSION", `fan-out collected in ${Date.now() - t0}ms`);

  // 2. Collect successful answers.
  const answers = [];
  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    const model = panel[i];
    if (!res) { log.warn("FUSION", `Panel ${model} dropped (straggler/timeout)`); continue; }
    if (res.__timeout) { log.warn("FUSION", `Panel ${model} timed out`); continue; }
    if (res.__error) { log.warn("FUSION", `Panel ${model} threw`, { error: res.__error?.message || String(res.__error) }); continue; }
    if (!res.ok) { log.warn("FUSION", `Panel ${model} failed`, { status: res.status }); continue; }
    try {
      const json = await res.clone().json();
      const text = extractPanelText(json);
      if (text) {
        // Keep the original Response: single-survivor non-streaming turns can
        // return it directly instead of paying for the same model twice.
        answers.push({ model, text, res });
        log.info("FUSION", `Panel ${model} ok (${text.length} chars)`);
      } else {
        log.warn("FUSION", `Panel ${model} returned empty content`);
      }
    } catch (e) {
      log.warn("FUSION", `Panel ${model} unparseable`, { error: e.message || String(e) });
    }
  }

  // 3. Degrade gracefully when the panel is too thin to fuse.
  if (answers.length === 0) {
    log.warn("FUSION", "All panel models failed");
    return unavailableResponse(503, "All fusion panel models failed", null, null, { code: "FUSION_PANEL_UNAVAILABLE" });
  }
  if (answers.length === 1) {
    // Non-streaming clients can reuse the already-paid panel response as-is;
    // streaming clients need a fresh call so chunks actually stream.
    if (body.stream === true) {
      log.info("FUSION", `Only ${answers[0].model} succeeded — re-answering with stream`);
      return handleSingleModel(body, answers[0].model);
    }
    log.info("FUSION", `Only ${answers[0].model} succeeded — answering directly (no fusion)`);
    return answers[0].res;
  }

  // 4. Judge analyzes + writes one final answer (streams to client if requested).
  // The judge itself can 429/503 — fall through the panel as backup judges
  // instead of failing a fusion that already has good answers in hand.
  const judgeBody = appendUserTurn(body, buildJudgePrompt(answers));
  let judgeResult = null;
  for (const judgeCandidate of [...new Set([judge, ...panel])]) {
    log.info("FUSION", `Judging ${answers.length} answers with ${judgeCandidate}`);
    judgeResult = await handleSingleModel(judgeBody, judgeCandidate);
    if (judgeResult.ok) return judgeResult;
    log.warn("FUSION", `Judge ${judgeCandidate} failed, trying next judge`, { status: judgeResult.status });
  }
  return judgeResult;
}
