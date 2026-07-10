import { buildReviewQuiz, generatePractice, generateTutorReply, gradeAnswer } from "./llmGateway.js";
import { getAuthHeaders } from "./authClient.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export function createLearningApiClient({
  baseUrl = getConfiguredBaseUrl(),
  fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return createMockLearningApiClient();

  return {
    generateTutorReply(payload) {
      return postJson(fetchImpl, normalizedBaseUrl, "/tutor-reply", payload, timeoutMs);
    },

    streamTutorReply(payload, handlers = {}) {
      return streamJsonLines(fetchImpl, normalizedBaseUrl, "/tutor-reply/stream", payload, handlers, timeoutMs);
    },

    generatePractice(payload) {
      return postJson(fetchImpl, normalizedBaseUrl, "/practice", payload, timeoutMs);
    },

    gradeAnswer(payload) {
      return postJson(fetchImpl, normalizedBaseUrl, "/answer-feedback", payload, timeoutMs);
    },

    buildReviewQuiz(payload) {
      return postJson(fetchImpl, normalizedBaseUrl, "/review-quiz", payload, timeoutMs);
    }
  };
}

export function createMockLearningApiClient() {
  return {
    async generateTutorReply(payload) {
      return generateTutorReply(payload);
    },

    async streamTutorReply(payload, handlers = {}) {
      const reply = generateTutorReply(payload);
      handlers.onEvent?.({ type: "meta", title: reply.title, kind: reply.kind });
      await streamMockText(reply.text, handlers);
      handlers.onEvent?.({ type: "done", ...reply });
      return reply;
    },

    async generatePractice(payload) {
      return generatePractice(payload);
    },

    async gradeAnswer({ question, answer }) {
      return gradeAnswer(question, answer);
    },

    async buildReviewQuiz(payload) {
      return buildReviewQuiz(payload);
    }
  };
}

async function postJson(fetchImpl, baseUrl, path, payload, timeoutMs) {
  if (!fetchImpl) {
    throw new Error("No fetch implementation is available for the configured API base URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch {
        // Keep the generic HTTP error below when the body is not JSON.
      }
      const message = errorPayload?.error?.message || errorPayload?.message || `${response.status} ${response.statusText}`;
      throw new Error(`Learning API request failed: ${message}`);
    }

    return response.json();
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("生成时间较长，已超时。请稍后重试，或先减少生成题目数量。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function streamJsonLines(fetchImpl, baseUrl, path, payload, handlers, timeoutMs) {
  if (!fetchImpl) {
    throw new Error("No fetch implementation is available for the configured API base URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs * 3);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Learning API stream failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body?.getReader) {
      const fallback = await response.json();
      handlers.onEvent?.({ type: "done", ...fallback });
      return fallback;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        handlers.onEvent?.(event);
        if (event.type === "chunk") handlers.onChunk?.(event.text || "");
        if (event.type === "done") finalPayload = event;
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      handlers.onEvent?.(event);
      if (event.type === "chunk") handlers.onChunk?.(event.text || "");
      if (event.type === "done") finalPayload = event;
    }

    return finalPayload;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("回复生成时间较长，已超时。请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function streamMockText(text, handlers) {
  const chunks = String(text || "").match(/.{1,12}/gs) || [""];
  for (const chunk of chunks) {
    handlers.onChunk?.(chunk);
    handlers.onEvent?.({ type: "chunk", text: chunk });
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(error?.message || "");
}

function getConfiguredBaseUrl() {
  const config = globalThis.QISI_CONFIG;
  const configuredBaseUrl = typeof config?.apiBaseUrl === "string" ? config.apiBaseUrl : "";
  if (configuredBaseUrl && globalThis.location?.protocol === "file:" && configuredBaseUrl.startsWith("/")) return "";
  return configuredBaseUrl;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}




