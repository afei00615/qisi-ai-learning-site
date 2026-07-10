import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLearningService } from "./learningService.js";
import { createAuthService } from "./authService.js";
import { createSqliteAuthStore } from "./storage/sqliteAuthStore.js";
import { createStateStore } from "./storage/stateStore.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const service = createLearningService();
const stateStore = createStateStore();
const authStore = createSqliteAuthStore({ dbPath: stateStore.dbPath });
const authService = createAuthService({ authStore });

const API_ROUTES = {
  "/api/tutor-reply": (payload) => service.generateTutorReply(payload),
  "/api/practice": (payload) => service.generatePractice(payload),
  "/api/answer-feedback": (payload) => service.gradeAnswer(payload),
  "/api/review-quiz": (payload) => service.buildReviewQuiz(payload)
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    if (url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, provider: service.provider, model: service.model, storage: stateStore.type });
    }
    if (url.pathname === "/api/auth/login") return handleLogin(request, response);
    if (url.pathname === "/api/auth/me") return handleMe(request, response);
    if (url.pathname === "/api/auth/logout") return handleLogout(request, response);
    if (url.pathname === "/api/parent/bind") return handleParentBind(request, response);
    if (url.pathname === "/api/parent/settings") return handleParentSettings(request, response);
    if (url.pathname === "/api/moderation/report") return handleModerationReport(request, response);
    if (/^\/api\/moderation\/[^/]+\/review$/.test(url.pathname)) return handleModerationReview(request, response, url.pathname);
    if (url.pathname === "/api/state") return handleStateApi(request, response);
    if (url.pathname === "/api/tutor-reply/stream") return handleTutorReplyStream(request, response);
    if (url.pathname.startsWith("/api/")) return handleApi(request, response, url.pathname);
    return serveStatic(response, url.pathname);
  } catch (error) {
    return sendJson(response, 500, { error: { message: error.message } });
  }
});

server.listen(PORT, () => {
  console.log(`Qisi AI learning server listening on http://localhost:${PORT}`);
  console.log(`LLM provider: ${service.provider} (${service.model})`);
  console.log(`State storage: ${stateStore.type} (${stateStore.dbPath || "configured"})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    authStore.close?.();
    stateStore.close?.();
    process.exit(0);
  });
}

async function handleStateApi(request, response) {
  const session = authorize(request, response);
  if (!session) return;

  if (request.method === "GET") {
    const state = stateStore.loadState();
    state.currentUserId = session.user.id;
    state.activeRole = session.user.role;
    state.users = [session.user];
    if (session.user.role === "parent") {
      state.parent.bindingStatus = authStore.isParentLinked(session.user.id, "student-demo") ? "linked" : "unlinked";
      state.parent.linkedStudentId = state.parent.bindingStatus === "linked" ? "student-demo" : "";
    }
    return sendJson(response, 200, state);
  }
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  if (session.user.role !== "student") return sendJson(response, 403, { error: { message: "当前账号没有保存学习数据的权限" } });

  try {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, stateStore.saveState(mergeStudentState(stateStore.loadState(), payload)));
  } catch (error) {
    return sendJson(response, 400, { error: { message: error.message } });
  }
}

async function handleTutorReplyStream(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  if (!authorize(request, response, ["student", "admin"])) return;

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });

  const emit = (event) => {
    response.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const payload = await readJsonBody(request);
    await service.streamTutorReply(payload, emit);
  } catch (error) {
    emit({ type: "error", message: error.message });
  } finally {
    response.end();
  }
}
async function handleApi(request, response, pathname) {
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  if (!authorize(request, response, ["student", "admin"])) return;

  const handler = API_ROUTES[pathname];
  if (!handler) return sendJson(response, 404, { error: { message: "API route not found" } });

  try {
    const payload = await readJsonBody(request);
    const result = await handler(payload);
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 502, { error: { message: error.message } });
  }
}

async function handleLogin(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  try {
    const { username, password } = await readJsonBody(request);
    return sendJson(response, 200, authService.login(username, password));
  } catch (error) {
    return sendJson(response, error.status || 400, { error: { message: error.message } });
  }
}

function handleMe(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  const session = authorize(request, response);
  if (session) return sendJson(response, 200, { user: session.user, expiresAt: session.expiresAt });
}

function handleLogout(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });
  authService.logout(request);
  return sendJson(response, 200, { ok: true });
}

async function handleParentBind(request, response) {
  const session = authorize(request, response, ["parent"]);
  if (!session) return;
  const { bindingCode } = await readJsonBody(request);
  const state = stateStore.loadState();
  if (String(bindingCode || "").trim().toUpperCase() !== String(state.student.bindingCode).toUpperCase()) {
    return sendJson(response, 400, { error: { message: "绑定码不正确" } });
  }
  authStore.bindParent(session.user.id, "student-demo");
  state.parent = { ...state.parent, name: session.user.name, linkedStudent: state.student.name, linkedStudentId: "student-demo", bindingStatus: "linked" };
  stateStore.saveState(state);
  return sendJson(response, 200, { parent: state.parent });
}

async function handleParentSettings(request, response) {
  const session = authorize(request, response, ["parent"]);
  if (!session) return;
  if (!authStore.isParentLinked(session.user.id, "student-demo")) return sendJson(response, 403, { error: { message: "请先绑定学生账号" } });
  const { dailyLimit } = await readJsonBody(request);
  const limit = Math.max(10, Math.min(240, Number(dailyLimit) || 60));
  const state = stateStore.loadState();
  state.student.dailyLimit = limit;
  stateStore.saveState(state);
  return sendJson(response, 200, { dailyLimit: limit });
}

async function handleModerationReport(request, response) {
  const session = authorize(request, response, ["parent"]);
  if (!session) return;
  if (!authStore.isParentLinked(session.user.id, "student-demo")) return sendJson(response, 403, { error: { message: "请先绑定学生账号" } });
  const payload = await readJsonBody(request);
  const state = stateStore.loadState();
  const item = { id: "mq-" + Date.now() + "-" + Math.random().toString(16).slice(2), type: "家长举报", source: session.user.id, priority: "高", detail: String(payload.detail || "家长提交了一条内容反馈，已进入管理端队列。"), status: "pending", createdAt: new Date().toISOString() };
  state.moderationQueue.unshift(item);
  stateStore.saveState(state);
  return sendJson(response, 201, { item });
}

async function handleModerationReview(request, response, pathname) {
  const session = authorize(request, response, ["admin"]);
  if (!session) return;
  const id = decodeURIComponent(pathname.split("/")[3]);
  const { action } = await readJsonBody(request);
  if (!["approved", "rejected", "escalated"].includes(action)) return sendJson(response, 400, { error: { message: "无效的审核操作" } });
  const state = stateStore.loadState();
  const item = state.moderationQueue.find((entry) => entry.id === id);
  if (!item) return sendJson(response, 404, { error: { message: "审核项不存在" } });
  Object.assign(item, { status: action, reviewedBy: session.user.name, reviewedAt: new Date().toISOString() });
  stateStore.saveState(state);
  return sendJson(response, 200, { item });
}

function authorize(request, response, roles = null) {
  try {
    return roles ? authService.requireRole(request, roles) : authService.authenticate(request);
  } catch (error) {
    sendJson(response, error.status || 401, { error: { message: error.message } });
    return null;
  }
}

function mergeStudentState(current, payload) {
  return {
    ...current,
    student: { ...current.student, ...(payload.student || {}) },
    chats: payload.chats || current.chats,
    knowledgeChats: payload.knowledgeChats || current.knowledgeChats,
    chatSessions: payload.chatSessions || current.chatSessions,
    knowledgeSessions: payload.knowledgeSessions || current.knowledgeSessions,
    reports: payload.reports || current.reports,
    reviewHistory: payload.reviewHistory || current.reviewHistory
  };
}
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  const filePath = resolve(join(ROOT_DIR, safePath));
  if (!filePath.startsWith(ROOT_DIR)) return sendText(response, 403, "Forbidden");

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return sendText(response, 404, "Not found");

    response.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    return sendText(response, 404, "Not found");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  response.end(status === 204 ? "" : JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
  }[extname(filePath).toLowerCase()] || "application/octet-stream";
}


