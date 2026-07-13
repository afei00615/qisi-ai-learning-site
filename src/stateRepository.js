import { defaultState } from "./data.js";
import { getAuthHeaders } from "./authClient.js";

export const DEFAULT_STORAGE_KEY = "qisi-ai-learning-state";

export function createStateRepository({
  storage = getBrowserStorage(),
  storageKey = DEFAULT_STORAGE_KEY,
  apiBaseUrl = getConfiguredBaseUrl(),
  fetchImpl = typeof fetch === "function" ? fetch.bind(globalThis) : null
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
  let pendingRemoteSave = null;
  let remoteSaveTimer = 0;

  return {
    remoteEnabled: Boolean(normalizedBaseUrl && fetchImpl),

    load() {
      if (!storage) return hydrateState(defaultState);

      try {
        const saved = JSON.parse(storage.getItem(storageKey));
        return hydrateState(saved);
      } catch {
        return hydrateState(defaultState);
      }
    },

    save(state) {
      const hydrated = hydrateState(state);
      if (storage) storage.setItem(storageKey, JSON.stringify(hydrated));
      scheduleRemoteSave(hydrated);
      return Boolean(storage);
    },

    async loadRemote() {
      if (!normalizedBaseUrl || !fetchImpl) return null;
      const response = await fetchImpl(`${normalizedBaseUrl}/state`, { method: "GET", headers: getAuthHeaders(storage) });
      if (!response.ok) throw new Error(`State API load failed: ${response.status} ${response.statusText}`);
      const remoteState = hydrateState(await response.json());
      if (storage) storage.setItem(storageKey, JSON.stringify(remoteState));
      return remoteState;
    },

    async saveRemote(state) {
      if (!normalizedBaseUrl || !fetchImpl) return false;
      await postRemoteState(fetchImpl, normalizedBaseUrl, hydrateState(state));
      return true;
    }
  };

  function scheduleRemoteSave(state) {
    if (!normalizedBaseUrl || !fetchImpl) return;
    pendingRemoteSave = state;
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(() => {
      const snapshot = pendingRemoteSave;
      pendingRemoteSave = null;
      postRemoteState(fetchImpl, normalizedBaseUrl, snapshot).catch((error) => {
        console.warn("State API save failed", error);
      });
    }, 250);
  }
}

export function hydrateState(saved) {
  const base = clone(defaultState);
  if (!saved || typeof saved !== "object") return withChatSessions(base);

  return withChatSessions({
    ...base,
    ...saved,
    student: { ...base.student, term: "上", bindingCode: base.student.bindingCode, ...(saved.student || {}) },
    parent: { ...base.parent, ...(saved.parent || {}) },
    currentUserId: saved.currentUserId || base.currentUserId,
    activeRole: saved.activeRole || base.activeRole,
    users: Array.isArray(saved.users) ? saved.users : clone(base.users),
    reports: Array.isArray(saved.reports) ? saved.reports : clone(base.reports),
    safetyLogs: Array.isArray(saved.safetyLogs) ? saved.safetyLogs : clone(base.safetyLogs),
    moderationQueue: Array.isArray(saved.moderationQueue) ? saved.moderationQueue : clone(base.moderationQueue),
    reviewHistory: Array.isArray(saved.reviewHistory) ? saved.reviewHistory : []
  }, saved);
}

function withChatSessions(state, saved = state) {
  const defaultSolve = clone(defaultState.chats);
  const defaultKnowledge = clone(defaultState.knowledgeChats);

  state.chatSessions = normalizeSessionMap(saved.chatSessions, saved.chats, defaultSolve);
  state.knowledgeSessions = normalizeSessionMap(saved.knowledgeSessions, saved.knowledgeChats, defaultKnowledge);
  state.conversationThreads = normalizeConversationThreads(saved.conversationThreads, state.chatSessions, state.knowledgeSessions);
  state.activeConversationIds = normalizeActiveConversationIds(saved.activeConversationIds, state.conversationThreads);
  syncLegacyChatViews(state);
  return state;
}

function normalizeSessionMap(sessionMap, legacyChats, fallbackChats) {
  const normalized = sessionMap && typeof sessionMap === "object" && !Array.isArray(sessionMap) ? clone(sessionMap) : {};
  if (!Array.isArray(normalized.math)) {
    normalized.math = Array.isArray(legacyChats) ? clone(legacyChats) : clone(fallbackChats);
  }
  return normalized;
}

function normalizeConversationThreads(savedThreads, solveSessions, knowledgeSessions) {
  const normalized = { solve: {}, knowledge: {} };
  for (const kind of ["solve", "knowledge"]) {
    const source = savedThreads?.[kind];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [subjectId, threads] of Object.entries(source)) {
        if (Array.isArray(threads) && threads.length) normalized[kind][subjectId] = threads.map((thread, index) => normalizeThread(thread, kind, subjectId, index));
      }
    }
  }
  migrateLegacySessions(normalized.solve, solveSessions, "solve");
  migrateLegacySessions(normalized.knowledge, knowledgeSessions, "knowledge");
  return normalized;
}

function migrateLegacySessions(target, sessions, kind) {
  for (const [subjectId, messages] of Object.entries(sessions || {})) {
    if (target[subjectId]?.length || !Array.isArray(messages)) continue;
    target[subjectId] = [normalizeThread({ id: `legacy-${kind}-${subjectId}`, messages }, kind, subjectId, 0)];
  }
}

function normalizeThread(thread, kind, subjectId, index) {
  const messages = Array.isArray(thread?.messages) ? clone(thread.messages) : [];
  const createdAt = thread?.createdAt || new Date(0).toISOString();
  return {
    id: thread?.id || `${kind}-${subjectId}-${index}`,
    title: thread?.title || conversationTitle(messages, kind),
    createdAt,
    updatedAt: thread?.updatedAt || createdAt,
    messages
  };
}

function normalizeActiveConversationIds(savedIds, threads) {
  const result = { solve: {}, knowledge: {} };
  for (const kind of ["solve", "knowledge"]) {
    for (const [subjectId, items] of Object.entries(threads[kind])) {
      const requested = savedIds?.[kind]?.[subjectId];
      result[kind][subjectId] = items.some((item) => item.id === requested) ? requested : items[0]?.id || "";
    }
  }
  return result;
}

function syncLegacyChatViews(state) {
  for (const kind of ["solve", "knowledge"]) {
    const legacyMap = kind === "solve" ? state.chatSessions : state.knowledgeSessions;
    for (const [subjectId, threads] of Object.entries(state.conversationThreads[kind])) {
      const activeId = state.activeConversationIds[kind][subjectId];
      legacyMap[subjectId] = threads.find((thread) => thread.id === activeId)?.messages || threads[0]?.messages || [];
    }
  }
  state.chats = state.chatSessions.math || [];
  state.knowledgeChats = state.knowledgeSessions.math || [];
}

function conversationTitle(messages, kind) {
  const firstQuestion = messages.find((message) => message.role === "user")?.text?.trim();
  if (firstQuestion) return firstQuestion.length > 20 ? `${firstQuestion.slice(0, 20)}...` : firstQuestion;
  return kind === "solve" ? "新解题对话" : "新知识问答";
}
function getBrowserStorage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

async function postRemoteState(fetchImpl, baseUrl, state) {
  const response = await fetchImpl(`${baseUrl}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(state)
  });
  if (!response.ok) throw new Error(`State API save failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function getConfiguredBaseUrl() {
  const configuredBaseUrl = typeof globalThis.QISI_CONFIG?.apiBaseUrl === "string" ? globalThis.QISI_CONFIG.apiBaseUrl : "";
  if (configuredBaseUrl && globalThis.location?.protocol === "file:" && configuredBaseUrl.startsWith("/")) return "";
  return configuredBaseUrl;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
