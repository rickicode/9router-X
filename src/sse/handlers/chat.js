import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { handleAntigravityQuotaError, clearAntigravityStrikes } from "../services/antigravityQuota.js";
import { handleFreebuffQuotaError } from "open-sse/services/usage/freebuff.js";
import { canonicalFreebuffModel } from "open-sse/executors/freebuff.js";
import { getSettings, lockAccountToModel, lockProxyPoolForScope } from "@/lib/localDb";
import { saveFailedRequest, saveRequestDetail } from "@/lib/usageDb.js";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { getTransform as getPxpipeTransform } from "@/lib/pxpipe/loader.js";
import { appendPxpipeEvent } from "@/lib/pxpipe/events.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat, handleFusionChat, detectRequiredCapabilities } from "open-sse/services/combo.js";
import { augmentModelsWithCapacityAdapter, withCapacityAdapterStripping, getActiveAdapterStrategy } from "open-sse/services/capacityAdapter.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { MAX_FALLBACK_ATTEMPTS } from "open-sse/config/errorConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { stripModelContextMarker } from "open-sse/utils/modelMarkers.js";

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  const isTestRequest = request.headers.get("x-9router-test-request") === "1";
  // Claude Code marks a 1M-context request as `<model>[1m]`; the marker matches
  // no combo, alias or provider/model pair, so it must not reach resolution.
  // The capability travels in the anthropic-beta header, forwarded as-is.
  const { model: modelStr, contextMarker } = stripModelContextMarker(body.model);
  if (contextMarker) body.model = modelStr;

  // Request summary is emitted as the unified "▶" line in chatCore (has fmt/thinking/account)

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  const requiredCapabilities = detectRequiredCapabilities(body);

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
    // A combo is an explicit routing contract. Never inject a model from a
    // different provider into it; its members and configured strategy define
    // the complete fallback set.
    const augmentedModels = comboModels;
    const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, isPanel) => {
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, modelStr, isTestRequest);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
      });
    }

    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
    log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      models: augmentedModels,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit
    });
  }

  // Single model request — may still switch to a capacity-adapter model if the
  // target lacks a capability the request needs (e.g. no vision, request has an image).
  const soloAugmented = augmentModelsWithCapacityAdapter([modelStr], requiredCapabilities, settings);
  if (soloAugmented.length > 1) {
    const adapterAdded = soloAugmented.filter((m) => m !== modelStr);
    log.info("CHAT", `Capacity adapter for [${[...requiredCapabilities].join(",")}] on "${modelStr}" → trying ${soloAugmented.join(", ")}`);
    return handleComboChat({
      body,
      models: soloAugmented,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy: getActiveAdapterStrategy(requiredCapabilities, settings)
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, null, isTestRequest);
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, comboName = null, isTestRequest = false) {
  const modelInfo = await getModelInfo(modelStr);

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      const requiredCapabilities = detectRequiredCapabilities(body);
       const augmentedModels = comboModels;
      const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, isPanel) => {
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, modelStr, isTestRequest);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
        });
      }

      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
      log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: augmentedModels,
        handleSingleModel: withCapacityAdapterStripping(
          (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, modelStr, isTestRequest),
          adapterAdded
        ),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;
  if (clientRawRequest) {
    clientRawRequest = { ...clientRawRequest, comboName: comboName || clientRawRequest.comboName || null };
  }

  // Routing shown in the unified "▶" line (client model → provider/model)

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
         if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: null, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: status, isStream: body?.stream, error: errorMsg }).catch(() => {});
         if (!isTestRequest) saveRequestDetail({
          provider, model, connectionId: null,
          latency: { ttft: 0, total: 0 },
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          request: body,
          response: { error: errorMsg, status, thinking: null },
          status: "error",
          error: errorMsg,
         }).catch(() => {});
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman, {
          code: credentials.lastErrorCode,
          provider,
          model,
          statusBreakdown: credentials.statusBreakdown,
        });
      }
      if (excludeConnectionIds.size === 0) {
        // No credentials exist for this provider at all (or none active).
        // 503, not 404: the provider/node EXISTS but has no usable account —
        // 404 tells clients the endpoint/model is wrong and they stop retrying.
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        const noCredMsg = `No active credentials for provider: ${provider} — add an account or re-enable disabled ones`;
         if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: null, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: HTTP_STATUS.SERVICE_UNAVAILABLE, isStream: body?.stream, error: noCredMsg }).catch(() => {});
         if (!isTestRequest) saveRequestDetail({
          provider, model, connectionId: null,
          latency: { ttft: 0, total: 0 },
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          request: body,
          response: { error: noCredMsg, status: HTTP_STATUS.SERVICE_UNAVAILABLE, thinking: null },
          status: "error",
          error: noCredMsg,
        }).catch(() => {});
        return unavailableResponse(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          noCredMsg,
          null,
          null,
          { code: "NO_CREDENTIALS", provider, model },
        );
      }
      log.warn("CHAT", "No more accounts available", { provider });
      const noMoreMsg = lastError || "All accounts unavailable";
      const noMoreStatus = lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE;
       if (!isTestRequest) saveFailedRequest({ provider, model, connectionId: null, apiKey, endpoint: clientRawRequest?.endpoint, errorStatus: noMoreStatus, isStream: body?.stream, error: noMoreMsg }).catch(() => {});
       if (!isTestRequest) saveRequestDetail({
        provider, model, connectionId: null,
        latency: { ttft: 0, total: 0 },
        tokens: { prompt_tokens: 0, completion_tokens: 0 },
        request: body,
        response: { error: noMoreMsg, status: noMoreStatus, thinking: null },
        status: "error",
        error: noMoreMsg,
      }).catch(() => {});
      return errorResponse(noMoreStatus, noMoreMsg);
    }

    // Account selection shown in the unified "▶" line (acc:...)
    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken, provider, credentials.connectionName);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      isTestRequest,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      headroomEnabled: !!chatSettings.headroomEnabled,
      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
      headroomTimeoutMs: chatSettings.headroomTimeoutMs,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      pxpipeEnabled: !!chatSettings.pxpipeEnabled,
      pxpipeMinChars: chatSettings.pxpipeMinChars,
      pxpipeTimeoutMs: chatSettings.pxpipeTimeoutMs,
      // Lazily warms the in-process module on first use; null when not installed (fail-open)
      pxpipeTransform: chatSettings.pxpipeEnabled ? await getPxpipeTransform() : null,
      onPxpipeEvent: appendPxpipeEvent,
      providerThinking,
      // Pool-scoped failure recovery: re-resolve proxy config excluding the
      // failed pool so the request retries via another pool, not a dead end.
      resolveProxyConfig: async (creds, excludePoolIds = []) => {
        const psd = { ...(creds?.providerSpecificData || {}) };
        if (psd.proxyPoolIds?.length || psd.proxyGroup) psd.proxyPoolScope = `${provider}::${model}`;
        const resolved = await resolveConnectionProxyConfig(psd, creds?.connectionId || creds?.id, excludePoolIds);
        if (!resolved?.proxyPoolId) return null;
        return {
          connectionProxyEnabled: resolved.connectionProxyEnabled,
          connectionProxyUrl: resolved.connectionProxyUrl,
          connectionNoProxy: resolved.connectionNoProxy,
          connectionProxyPoolId: resolved.proxyPoolId || null,
          vercelRelayUrl: resolved.vercelRelayUrl || "",
          proxyPoolId: resolved.proxyPoolId || null,
          strictProxy: resolved.strictProxy === true,
        };
      },
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      isTestRequest,
      comboName,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
        // "Consecutive" strikes: a success clears the breaker for this pair.
        clearAntigravityStrikes(credentials.connectionId, model);

        // Freebuff 1-hour model affinity lock: lock account to the successful model
        if (provider === "freebuff" && model && credentials.connectionId) {
          const canonical = canonicalFreebuffModel(model);
          lockAccountToModel(credentials.connectionId, canonical, 60 * 60 * 1000).catch((e) => {
            log.warn("AUTH", `Failed to lock Freebuff account to model ${canonical}:`, e);
          });
        }

        // Lock working proxy pool: lock the successful proxy for this provider/scope
        // until it fails or becomes unfit.
        const successfulPoolId = credentials?.providerSpecificData?.proxyPoolId || credentials?.providerSpecificData?.connectionProxyPoolId;
        if (successfulPoolId) {
          lockProxyPoolForScope(provider, successfulPoolId, credentials?.providerSpecificData?.proxyGroup || null);
        }
      }
    });

    if (result.success) return result.response;

    // Upstream 401: If connection has a refreshToken, attempt one immediate forced refresh before locking account
    if (result.status === 401 && credentials.refreshToken && !credentials._tokenRefreshedOn401) {
      log.warn("TOKEN_REFRESH", `Upstream 401 on ${provider} — attempting immediate force token refresh for ${credentials.connectionName}`);
      credentials._tokenRefreshedOn401 = true;
      const ref = await checkAndRefreshToken(provider, credentials, { force: true });
      if (ref?.accessToken && ref.accessToken !== refreshedCredentials.accessToken) {
        log.info("TOKEN_REFRESH", `Immediate token refresh succeeded for ${provider} (${credentials.connectionName}), retrying request`);
        continue;
      }
    }

    // Antigravity 409/429: refresh live quota to get exact resetAt before locking
    let quotaResetMs = null;
    let resetsAtMs = result.resetsAtMs;
    if (provider === "antigravity" && (result.status === 409 || result.status === 429)) {
      quotaResetMs = await handleAntigravityQuotaError(
        credentials.connectionId, result.status, model,
        refreshedCredentials.accessToken, credentials.providerSpecificData
      );
      if (quotaResetMs) resetsAtMs = quotaResetMs;
    }
    // Freebuff 403/429: refresh live quota to get exact resetAt before locking (unless limited tier on proxy IP)
    const isFreebuffLimitedIp = provider === "freebuff" && (
      result.extra?.freebuffKind === "limited_ip" ||
      /accesstier["']?\s*:\s*["']?limited|pool["']?\s*:\s*["']?freebucks|limited-tier|limited_ip/i.test(String(result.error || ""))
    );
    if (isFreebuffLimitedIp) {
      resetsAtMs = null;
    } else if (provider === "freebuff" && (result.status === 403 || result.status === 429) && !resetsAtMs) {
      const fbResetMs = await handleFreebuffQuotaError(
        credentials.connectionId, model,
        refreshedCredentials.accessToken, credentials.providerSpecificData,
        credentials.proxyOptions,
      );
      if (fbResetMs) resetsAtMs = fbResetMs;
    }

    // Preserve upstream status/kind because chatCore returns thrown upstream
    // errors as a 502 gateway response.
    const upstreamStatus = result.extra?.upstreamStatus || result.status;

    // When Freebuff upstream reports model_locked, immediately bind account to currentModel and fallback to next account
    if (provider === "freebuff") {
      let currentLockedModel = result.extra?.currentModel;
      if (!currentLockedModel) {
        const match = String(result.error || "").match(/"currentModel"\s*:\s*"([^"]+)"/);
        if (match) currentLockedModel = match[1];
      }
      if (currentLockedModel && credentials?.connectionId) {
        const canonical = canonicalFreebuffModel(currentLockedModel);
        log.warn("AUTH", `Freebuff account ${credentials.connectionName} locked to "${canonical}" upstream — updating local lock for 1h`);
        lockAccountToModel(credentials.connectionId, canonical, 60 * 60 * 1000).catch((e) => {
          log.warn("AUTH", `Failed to record Freebuff upstream lock for model ${canonical}:`, e);
        });
      }
      if (upstreamStatus === 409 || /(model_locked|session_model_mismatch|locked to another model)/i.test(String(result.error || ""))) {
        log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} Freebuff model locked to other model (${currentLockedModel || "other"}) → NEXT ACCOUNT`);
        excludeConnectionIds.add(credentials.connectionId);
        lastError = result.error;
        lastStatus = 409;
        if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
          log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
          return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
        }
        continue;
      }
    }

    // A Freebuff proxy-egress refusal (free_mode_unavailable / anonymous_network)
    // already rotated pools inside chatCore — never treat it as a ban even
    // when the message embeds upstream JSON. Just fall back to next account.
    const isFreebuffProxyRefusal = provider === "freebuff"
      && (result.extra?.freebuffKind === "free_mode_unavailable"
        || /free_mode_unavailable|anonymous_network/i.test(String(result.error || "")));

    // A banned Freebuff account is permanently disabled (is_active=false, test_status="disabled")
    // and gateway falls back to the next healthy account
    if (!isFreebuffProxyRefusal && !isFreebuffLimitedIp && (result.extra?.freebuffKind === "banned" || (provider === "freebuff" && /(^|[^a-z])banned([^a-z]|$)/i.test(String(result.error || ""))))) {
      const connName = credentials.connectionName || credentials.name || credentials.email || credentials.connectionId?.slice(0, 8) || "account";
      const rawError = String(result.error || '{"status":"banned"}');
      const banReason = rawError.includes(connName)
        ? rawError
        : `Freebuff account "${connName}" banned (403): ${rawError}`;
      await markAccountUnavailable(
        credentials.connectionId,
        upstreamStatus || 403,
        banReason,
        provider,
        model,
        resetsAtMs,
        "banned",
      );
      log.warn("FALLBACK", `⇄ ACC:${connName} BANNED & DISABLED → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = banReason;
      lastStatus = HTTP_STATUS.FORBIDDEN;
      if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
        log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
      }
      continue;
    }

    const shouldFallback = (await markAccountUnavailable(
      credentials.connectionId,
      upstreamStatus,
      result.error,
      provider,
      model,
      resetsAtMs,
      result.extra?.freebuffKind,
    )).shouldFallback;

    if (shouldFallback) {
      log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} UNAVAILABLE (${result.status}) → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
        log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
      }
      continue;
    }

    return result.response || errorResponse(
      result.status || HTTP_STATUS.BAD_GATEWAY,
      result.error || "Chat request failed",
    );
  }
}
