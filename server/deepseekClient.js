import { createHash } from "node:crypto";
import { getRequestContext } from "./observability/requestContext.js";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function createDeepSeekClient({
  apiKey = process.env.DEEPSEEK_API_KEY,
  baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
  model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
  fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
  maxRetries = Number(process.env.DEEPSEEK_MAX_RETRIES || 2),
  retryBaseMs = Number(process.env.DEEPSEEK_RETRY_BASE_MS || 300),
  auditStore = null
} = {}) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    enabled: Boolean(apiKey),
    model,

    async chatTextStream({ systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1600, onChunk }) {
      assertConfigured(apiKey, fetchImpl);
      const context = getRequestContext();
      const startedAt = Date.now();
      let retryCount = 0;
      let output = "";
      let usage = {};
      let providerRequestId = "";

      try {
        const response = await requestWithRetry({
          fetchImpl,
          url: `${normalizedBaseUrl}/chat/completions`,
          apiKey,
          body: {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            user_id: safeUserId(context.userId)
          },
          maxRetries,
          retryBaseMs,
          onRetry: () => { retryCount += 1; }
        });

        const reader = response.body?.getReader?.();
        if (!reader) throw new Error("DeepSeek stream response is not readable.");

        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const event = parseStreamLine(line);
            if (!event) continue;
            providerRequestId ||= event.id || "";
            if (event.usage) usage = event.usage;
            if (event.text) {
              output += event.text;
              onChunk?.(event.text);
            }
          }
        }
        if (buffer.trim()) {
          const event = parseStreamLine(buffer);
          if (event) {
            providerRequestId ||= event.id || "";
            if (event.usage) usage = event.usage;
            if (event.text) {
              output += event.text;
              onChunk?.(event.text);
            }
          }
        }

        recordAudit(auditStore, auditEntry({ context, model, status: "success", retryCount, startedAt, usage, systemPrompt, userPrompt, output, providerRequestId }));
        return output;
      } catch (error) {
        recordAudit(auditStore, auditEntry({ context, model, status: "error", retryCount, startedAt, usage, systemPrompt, userPrompt, output, providerRequestId, error }));
        throw error;
      }
    },

    async chatJson({ systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1600 }) {
      assertConfigured(apiKey, fetchImpl);
      const context = getRequestContext();
      const startedAt = Date.now();
      let retryCount = 0;
      let usage = {};
      let output = "";
      let providerRequestId = "";

      try {
        const response = await requestWithRetry({
          fetchImpl,
          url: `${normalizedBaseUrl}/chat/completions`,
          apiKey,
          body: {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature,
            max_tokens: maxTokens,
            stream: false,
            user_id: safeUserId(context.userId)
          },
          maxRetries,
          retryBaseMs,
          onRetry: () => { retryCount += 1; }
        });

        const bodyText = await response.text();
        let payload;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          throw new Error("DeepSeek returned a non-JSON API response.");
        }

        providerRequestId = payload.id || "";
        usage = payload.usage || {};
        output = payload.choices?.[0]?.message?.content || "";
        if (!output) throw new Error("DeepSeek returned an empty completion.");

        let result;
        try {
          result = JSON.parse(output);
        } catch {
          throw new Error("DeepSeek completion was not valid JSON.");
        }

        recordAudit(auditStore, auditEntry({ context, model, status: "success", retryCount, startedAt, usage, systemPrompt, userPrompt, output, providerRequestId }));
        return result;
      } catch (error) {
        recordAudit(auditStore, auditEntry({ context, model, status: "error", retryCount, startedAt, usage, systemPrompt, userPrompt, output, providerRequestId, error }));
        throw error;
      }
    }
  };
}

async function requestWithRetry({ fetchImpl, url, apiKey, body, maxRetries, retryBaseMs, onRetry }) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
      });
      if (response.ok) return response;

      const responseText = await response.text();
      const error = new Error(`DeepSeek request failed: ${response.status} ${response.statusText} ${responseText.slice(0, 240)}`.trim());
      error.status = response.status;
      error.retryAfter = response.headers.get("retry-after");
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= maxRetries) throw error;
      lastError = error;
    } catch (error) {
      if (error.status && !RETRYABLE_STATUS.has(error.status)) throw error;
      if (attempt >= maxRetries) throw error;
      lastError = error;
    }

    onRetry?.(attempt + 1, lastError);
    await delay(retryDelay(lastError, attempt, retryBaseMs));
  }
  throw lastError || new Error("DeepSeek request failed.");
}

function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const payload = JSON.parse(data);
    return {
      id: payload.id || "",
      text: payload.choices?.[0]?.delta?.content || "",
      usage: payload.usage || null
    };
  } catch {
    return null;
  }
}

function auditEntry({ context, model, status, retryCount, startedAt, usage, systemPrompt, userPrompt, output, providerRequestId, error }) {
  return {
    requestId: context.traceId,
    providerRequestId,
    userId: context.userId,
    operation: context.operation,
    provider: "deepseek",
    model,
    status,
    retryCount,
    latencyMs: Date.now() - startedAt,
    usage,
    estimatedCostUsd: estimateCostUsd(model, usage),
    inputHash: hashText(`${systemPrompt}\n${userPrompt}`),
    outputHash: output ? hashText(output) : null,
    outputExcerpt: output ? String(output).replace(/\s+/g, " ").slice(0, 1000) : null,
    errorMessage: error?.message?.slice(0, 500) || null,
    createdAt: new Date().toISOString()
  };
}

export function estimateCostUsd(model, usage = {}) {
  const defaults = model.includes("pro")
    ? { hit: 0.003625, miss: 0.435, output: 0.87 }
    : { hit: 0.0028, miss: 0.14, output: 0.28 };
  const hitRate = Number(process.env.DEEPSEEK_PRICE_INPUT_CACHE_HIT_PER_M || defaults.hit);
  const missRate = Number(process.env.DEEPSEEK_PRICE_INPUT_CACHE_MISS_PER_M || defaults.miss);
  const outputRate = Number(process.env.DEEPSEEK_PRICE_OUTPUT_PER_M || defaults.output);
  const hit = Number(usage.prompt_cache_hit_tokens || 0);
  const miss = Number(usage.prompt_cache_miss_tokens ?? Math.max(0, Number(usage.prompt_tokens || 0) - hit));
  const completion = Number(usage.completion_tokens || 0);
  return (hit * hitRate + miss * missRate + completion * outputRate) / 1_000_000;
}

function retryDelay(error, attempt, baseMs) {
  const retryAfter = Number(error?.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(30_000, retryAfter * 1000);
  return Math.min(5_000, baseMs * (2 ** attempt) + Math.floor(Math.random() * 100));
}

function safeUserId(value) {
  return String(value || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 512);
}

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function recordAudit(store, entry) {
  try {
    store?.record(entry);
  } catch (error) {
    console.warn("LLM audit write failed", error);
  }
}

function assertConfigured(apiKey, fetchImpl) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");
  if (!fetchImpl) throw new Error("No fetch implementation is available for DeepSeek requests.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
