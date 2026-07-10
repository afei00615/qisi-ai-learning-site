import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLearningService } from "./learningService.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const service = createLearningService();

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
      return sendJson(response, 200, { ok: true, provider: service.provider, model: service.model });
    }
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
});

async function handleTutorReplyStream(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
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
    "Access-Control-Allow-Headers": "Content-Type"
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

