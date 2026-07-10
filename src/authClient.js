export const AUTH_TOKEN_KEY = "qisi-auth-token";

export function createAuthClient({
  baseUrl = getConfiguredBaseUrl(),
  fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null,
  storage = getStorage()
} = {}) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    get token() {
      return storage?.getItem(AUTH_TOKEN_KEY) || "";
    },

    async login(username, password) {
      const result = await request("/auth/login", { method: "POST", body: { username, password }, authenticated: false });
      storage?.setItem(AUTH_TOKEN_KEY, result.token);
      return result;
    },

    async restore() {
      if (!this.token) return null;
      try {
        return await request("/auth/me", { method: "GET" });
      } catch (error) {
        if (error.status === 401) storage?.removeItem(AUTH_TOKEN_KEY);
        return null;
      }
    },

    async logout() {
      try {
        if (this.token) await request("/auth/logout", { method: "POST" });
      } finally {
        storage?.removeItem(AUTH_TOKEN_KEY);
      }
    },

    bindParent(bindingCode) {
      return request("/parent/bind", { method: "POST", body: { bindingCode } });
    },

    saveParentSettings(dailyLimit) {
      return request("/parent/settings", { method: "POST", body: { dailyLimit } });
    },

    reportContent(detail) {
      return request("/moderation/report", { method: "POST", body: { detail } });
    },

    reviewModeration(id, action) {
      return request(`/moderation/${encodeURIComponent(id)}/review`, { method: "POST", body: { action } });
    }
  };

  async function request(path, { method, body, authenticated = true }) {
    if (!normalizedBaseUrl || !fetchImpl) throw new Error("认证服务不可用");
    const token = storage?.getItem(AUTH_TOKEN_KEY) || "";
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "请求失败");
      error.status = response.status;
      throw error;
    }
    return payload;
  }
}

export function getAuthHeaders(storage = getStorage()) {
  const token = storage?.getItem(AUTH_TOKEN_KEY) || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getConfiguredBaseUrl() {
  const value = typeof globalThis.QISI_CONFIG?.apiBaseUrl === "string" ? globalThis.QISI_CONFIG.apiBaseUrl : "";
  return globalThis.location?.protocol === "file:" && value.startsWith("/") ? "" : value;
}

function getStorage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}
