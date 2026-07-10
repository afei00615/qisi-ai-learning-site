import { defaultState } from "./data.js";

export const DEFAULT_STORAGE_KEY = "qisi-ai-learning-state";

export function createStateRepository({ storage = getBrowserStorage(), storageKey = DEFAULT_STORAGE_KEY } = {}) {
  return {
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
      if (!storage) return false;
      storage.setItem(storageKey, JSON.stringify(state));
      return true;
    }
  };
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
  state.chats = state.chatSessions.math;
  state.knowledgeChats = state.knowledgeSessions.math;
  return state;
}

function normalizeSessionMap(sessionMap, legacyChats, fallbackChats) {
  const normalized = sessionMap && typeof sessionMap === "object" && !Array.isArray(sessionMap) ? clone(sessionMap) : {};
  if (!Array.isArray(normalized.math)) {
    normalized.math = Array.isArray(legacyChats) ? clone(legacyChats) : clone(fallbackChats);
  }
  return normalized;
}

function getBrowserStorage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

