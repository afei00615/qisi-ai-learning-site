import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage();

export function createRequestContext(request) {
  const incoming = String(request.headers["x-request-id"] || "");
  const traceId = /^[a-zA-Z0-9_-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  return { traceId, userId: "anonymous", operation: "unknown", startedAt: Date.now() };
}

export function withRequestContext(context, callback) {
  return storage.run(context, callback);
}

export function updateRequestContext(values) {
  Object.assign(storage.getStore() || {}, values);
}

export function getRequestContext() {
  return storage.getStore() || { traceId: randomUUID(), userId: "system", operation: "unknown", startedAt: Date.now() };
}
