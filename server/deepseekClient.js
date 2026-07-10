export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export function createDeepSeekClient({
  apiKey = process.env.DEEPSEEK_API_KEY,
  baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
  model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
  fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null
} = {}) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    enabled: Boolean(apiKey),
    model,

    async chatTextStream({ systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1600, onChunk }) {
      if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");
      if (!fetchImpl) throw new Error("No fetch implementation is available for DeepSeek requests.");

      const response = await fetchImpl(`${normalizedBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true
        })
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`DeepSeek stream failed: ${response.status} ${response.statusText} ${bodyText.slice(0, 240)}`.trim());
      }

      const reader = response.body?.getReader?.();
      if (!reader) throw new Error("DeepSeek stream response is not readable.");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const chunk = parseStreamLine(line);
          if (!chunk) continue;
          fullText += chunk;
          onChunk?.(chunk);
        }
      }

      if (buffer.trim()) {
        const chunk = parseStreamLine(buffer);
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      }

      return fullText;
    },

    async chatJson({ systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1600 }) {
      if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured.");
      if (!fetchImpl) throw new Error("No fetch implementation is available for DeepSeek requests.");

      const response = await fetchImpl(`${normalizedBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
          temperature,
          max_tokens: maxTokens,
          stream: false
        })
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`DeepSeek request failed: ${response.status} ${response.statusText} ${bodyText.slice(0, 240)}`.trim());
      }

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new Error("DeepSeek returned a non-JSON API response.");
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty completion.");

      try {
        return JSON.parse(content);
      } catch {
        throw new Error("DeepSeek completion was not valid JSON.");
      }
    }
  };
}
function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return "";

  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return "";

  try {
    const payload = JSON.parse(data);
    return payload.choices?.[0]?.delta?.content || "";
  } catch {
    return "";
  }
}
