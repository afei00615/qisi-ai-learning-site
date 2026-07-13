import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLearningApiClient } from "./src/apiClient.js";
import { recordAuditLog } from "./src/auditLog.js";
import { buildReviewQuiz, generatePractice, generateTutorReply } from "./src/llmGateway.js";
import { tutorStrategies } from "./src/data.js";
import { createStateRepository } from "./src/stateRepository.js";
import { createDeepSeekClient, estimateCostUsd } from "./server/deepseekClient.js";
import { createRateLimiter } from "./server/rateLimiter.js";
import { withRequestContext } from "./server/observability/requestContext.js";
import { createLlmAuditStore } from "./server/storage/llmAuditStore.js";
import { createLearningService } from "./server/learningService.js";
import { createSqliteStructuredStateStore as createSqliteStateStore } from "./server/storage/sqliteStructuredStateStore.js";
import { createSqliteAuthStore } from "./server/storage/sqliteAuthStore.js";
import { createAuthService } from "./server/authService.js";

const tutorReply = generateTutorReply({
  message: "这道方程怎么做？",
  subjectId: "math",
  grade: 7
});
assert.equal(tutorReply.kind, "scaffold");
assert.match(tutorReply.title, /不急着看最终答案/);
assert.equal(tutorReply.text.includes("x = 11"), false);
assert.equal(tutorReply.microPractice.length, 2);
assert.equal(Object.keys(tutorStrategies).length, 6);
assert.match(tutorStrategies.chinese.rules.join(""), /原文/);
assert.match(tutorStrategies.english.rules.join(""), /上下文/);

const chineseTutorReply = generateTutorReply({
  message: "这篇阅读的主要内容怎么概括？",
  subjectId: "chinese",
  grade: 5
});
assert.match(chineseTutorReply.text, /回到原文定位依据/);
assert.doesNotMatch(chineseTutorReply.text, /移项/);

const englishTutorReply = generateTutorReply({
  message: "这道英语语法题怎么判断？",
  subjectId: "english",
  grade: 6
});
assert.match(englishTutorReply.text, /上下文和时间标志/);

const practice = generatePractice({ subjectId: "math", grade: 7, knowledgeId: "linear-equation", count: 5 });
assert.equal(practice.length, 5);
assert.ok(practice.every((q) => q.stem && q.hint && q.answer && q.analysis && q.difficulty && q.knowledge));

const midterm = buildReviewQuiz({ subjectId: "math", grade: 7, mode: "midterm", weakPoints: ["一元一次方程"] });
const final = buildReviewQuiz({ subjectId: "math", grade: 7, mode: "final", weakPoints: ["一元一次方程"] });
assert.equal(midterm.questions.length, 6);
assert.equal(final.questions.length, 10);

const unsafe = generateTutorReply({ message: "我想伤害自己", subjectId: "math", grade: 7 });
assert.equal(unsafe.kind, "blocked");
assert.match(unsafe.title, /安全提醒/);

const api = createLearningApiClient({ baseUrl: "" });
const apiPractice = await api.generatePractice({ subjectId: "math", grade: 7, knowledgeId: "linear-equation", count: 2 });
assert.equal(apiPractice.length, 2);

let mockStreamText = "";
const mockStreamReply = await api.streamTutorReply(
  { message: "x^2 怎么输入？", subjectId: "math", grade: 7, term: "上" },
  { onChunk: (chunk) => (mockStreamText += chunk) }
);
assert.ok(["scaffold", "concept", "blocked"].includes(mockStreamReply.kind));
assert.ok(mockStreamText.length > 0);


const timeoutClient = createLearningApiClient({
  baseUrl: "http://api.test",
  timeoutMs: 1,
  fetchImpl: (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")));
    })
});
await assert.rejects(
  () => timeoutClient.buildReviewQuiz({ subjectId: "math", grade: 7, term: "上", mode: "final", weakPoints: [] }),
  /生成时间较长，已超时/
);
const memoryStorage = new Map();
const storage = {
  getItem: (key) => memoryStorage.get(key) || null,
  setItem: (key, value) => memoryStorage.set(key, value)
};
const repository = createStateRepository({ storage, storageKey: "test-state" });
const loadedState = repository.load();
loadedState.student.grade = 8;
loadedState.student.term = "下";
repository.save(loadedState);
assert.equal(repository.load().student.grade, 8);
assert.equal(repository.load().student.term, "下");
assert.equal(repository.load().parent.name, "家长");
assert.ok(Array.isArray(repository.load().chatSessions.math));
assert.ok(Array.isArray(repository.load().knowledgeSessions.math));
assert.ok(Array.isArray(repository.load().users));
assert.ok(repository.load().users.some((user) => user.role === "admin"));
assert.ok(Array.isArray(repository.load().moderationQueue));

let remoteState = { ...loadedState, student: { ...loadedState.student, grade: 6 } };
const remoteRepository = createStateRepository({
  storage: null,
  apiBaseUrl: "http://state.test/api",
  fetchImpl: async (_url, options = {}) => {
    if (options.method === "GET") {
      return new Response(JSON.stringify(remoteState), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    remoteState = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
const remoteLoadedState = await remoteRepository.loadRemote();
assert.equal(remoteLoadedState.student.grade, 6);
remoteLoadedState.student.grade = 5;
await remoteRepository.saveRemote(remoteLoadedState);
assert.equal(remoteState.student.grade, 5);

const legacyRepository = createStateRepository({
  storage: {
    getItem: () => JSON.stringify({ chats: [{ role: "user", text: "旧数学题" }], knowledgeChats: [{ role: "user", text: "旧知识问答" }] }),
    setItem: () => {}
  },
  storageKey: "legacy-state"
});
const migratedState = legacyRepository.load();
assert.equal(migratedState.chatSessions.math[0].text, "旧数学题");
assert.equal(migratedState.knowledgeSessions.math[0].text, "旧知识问答");

recordAuditLog(loadedState, { type: "测试事件", detail: "审计日志写入", actor: "system" });
assert.equal(loadedState.safetyLogs[0].type, "测试事件");
assert.ok(loadedState.safetyLogs[0].occurredAt);

const tempStateDir = await mkdtemp(join(tmpdir(), "qisi-state-"));
try {
  const dbPath = join(tempStateDir, "state.sqlite");
  const sqliteStore = createSqliteStateStore({ dbPath });
  const sqliteState = sqliteStore.loadState();
  sqliteState.student.grade = 9;
  sqliteState.conversationThreads.solve.math[0].messages.push({ role: "user", text: "默认学生消息" });
  sqliteState.conversationThreads.solve.math.unshift({ id: "second-math-conversation", title: "第二条数学会话", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [{ role: "user", text: "新的数学问题" }] });
  sqliteState.activeConversationIds.solve.math = "second-math-conversation";
  sqliteState.practiceSets = [{
    id: "practice-test",
    subjectId: "math",
    knowledgeId: "linear-equation",
    term: "上",
    mode: "practice",
    title: "结构化练习",
    createdAt: new Date().toISOString(),
    questions: [{ id: "practice-item", stem: "x + 1 = 2", answer: "x = 1", attempts: [{ id: "attempt-test", answer: "x = 1", score: 100, feedback: "正确", createdAt: new Date().toISOString() }] }]
  }];
  recordAuditLog(sqliteState, { type: "SQLite测试", detail: "状态已写入 SQLite", actor: "system" });
  sqliteStore.saveState(sqliteState, "student-demo");

  const secondStudent = sqliteStore.loadState("student-second");
  secondStudent.student.grade = 5;
  secondStudent.conversationThreads.solve.math[0].messages = [{ role: "user", text: "第二个学生消息" }];
  sqliteStore.saveState(secondStudent, "student-second");
  sqliteStore.close();

  const reopenedStore = createSqliteStateStore({ dbPath });
  const reopenedState = reopenedStore.loadState("student-demo");
  const reopenedSecond = reopenedStore.loadState("student-second");
  assert.equal(reopenedState.student.grade, 9);
  assert.equal(reopenedState.conversationThreads.solve.math.length, 2);
  assert.match(reopenedState.conversationThreads.solve.math[0].title, /第二条数学会话/);
  assert.equal(reopenedState.activeConversationIds.solve.math, reopenedState.conversationThreads.solve.math[0].id);
  assert.equal(reopenedSecond.student.grade, 5);
  assert.ok(reopenedState.conversationThreads.solve.math.some((thread) => thread.messages.some((message) => /默认学生/.test(message.text))));
  assert.match(reopenedSecond.chatSessions.math[0].text, /第二个学生/);
  assert.equal(reopenedState.practiceSets[0].questions[0].attempts[0].score, 100);
  assert.ok(reopenedState.safetyLogs.some((log) => log.type === "SQLite测试"));
  reopenedStore.close();
} finally {
  await rm(tempStateDir, { recursive: true, force: true }).catch((error) => {
    if (error.code !== "EBUSY") throw error;
  });
}

let deepSeekRequest;
const deepSeekClient = createDeepSeekClient({
  apiKey: "test-key",
  fetchImpl: async (url, options) => {
    deepSeekRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 88, feedback: "思路基本正确，请补充理由。" }) } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
const deepSeekJson = await deepSeekClient.chatJson({ systemPrompt: "输出 json", userPrompt: "批改", maxTokens: 300 });
assert.equal(deepSeekJson.score, 88);
assert.equal(deepSeekRequest.url, "https://api.deepseek.com/chat/completions");
assert.equal(deepSeekRequest.options.headers.Authorization, "Bearer test-key");
assert.deepEqual(deepSeekRequest.body.response_format, { type: "json_object" });
let deepSeekStreamRequest;
const deepSeekStreamClient = createDeepSeekClient({
  apiKey: "test-key",
  fetchImpl: async (url, options) => {
    deepSeekStreamRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(
      [
        "data: {\"choices\":[{\"delta\":{\"content\":\"先看左边\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"，再移项。\"}}]}\n\n",
        "data: [DONE]\n\n"
      ].join(""),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  }
});
let streamedText = "";
const fullStreamText = await deepSeekStreamClient.chatTextStream({
  systemPrompt: "纯文本",
  userPrompt: "讲题",
  onChunk: (chunk) => (streamedText += chunk)
});
assert.equal(fullStreamText, "先看左边，再移项。");
assert.equal(streamedText, "先看左边，再移项。");
assert.equal(deepSeekStreamRequest.body.stream, true);
assert.equal(deepSeekStreamRequest.body.stream_options.include_usage, true);

const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
assert.equal(limiter.consume("student-demo").allowed, true);
assert.equal(limiter.consume("student-demo").allowed, true);
assert.equal(limiter.consume("student-demo").allowed, false);
assert.ok(estimateCostUsd("deepseek-v4-flash", { prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 20, completion_tokens: 5 }) > 0);

const tempLlmAuditDir = await mkdtemp(join(tmpdir(), "qisi-llm-audit-"));
try {
  const auditStore = createLlmAuditStore({ dbPath: join(tempLlmAuditDir, "audit.sqlite") });
  let retryAttempts = 0;
  const retryClient = createDeepSeekClient({
    apiKey: "test-key",
    maxRetries: 2,
    retryBaseMs: 0,
    auditStore,
    fetchImpl: async () => {
      retryAttempts += 1;
      if (retryAttempts === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({
        id: "deepseek-request-test",
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 30, prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 20, completion_tokens: 5, total_tokens: 35 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const retryResult = await withRequestContext(
    { traceId: "trace-retry-test", userId: "student-demo", operation: "/api/practice", startedAt: Date.now() },
    () => retryClient.chatJson({ systemPrompt: "json", userPrompt: "retry" })
  );
  assert.equal(retryResult.ok, true);
  assert.equal(retryAttempts, 2);
  const usageSummary = auditStore.usageSummary({ days: 1 });
  assert.equal(usageSummary[0].requests, 1);
  assert.equal(usageSummary[0].retries, 1);
  assert.equal(usageSummary[0].total_tokens, 35);
  assert.ok(usageSummary[0].estimated_cost_usd > 0);
  auditStore.close();
} finally {
  await rm(tempLlmAuditDir, { recursive: true, force: true });
}
const service = createLearningService({ deepSeekClient });
const feedback = await service.gradeAnswer({ question: practice[0], answer: "先展开括号再移项" });
assert.equal(feedback.score, 88);
assert.match(feedback.feedback, /思路基本正确/);

const streamService = createLearningService({ deepSeekClient: deepSeekStreamClient });
const streamEvents = [];
const streamReply = await streamService.streamTutorReply(
  {
    message: "那应该是 x=-2 或 x=-3？",
    subjectId: "math",
    grade: 7,
    term: "上",
    conversationContext: [
      { role: "user", text: "x²+5x+6=0" },
      { role: "assistant", title: "解答思路", originalQuestion: "x²+5x+6=0", text: "左边可以分解为 (x+2)(x+3)=0。" }
    ]
  },
  (event) => streamEvents.push(event)
);
assert.equal(streamReply.kind, "scaffold");
assert.ok(streamEvents.some((event) => event.type === "meta"));
assert.ok(streamEvents.some((event) => event.type === "chunk"));
assert.ok(streamEvents.some((event) => event.type === "done"));
assert.match(deepSeekStreamRequest.body.messages[1].content, /x²\+5x\+6=0/);
assert.match(deepSeekStreamRequest.body.messages[1].content, /最近对话上下文/);
assert.match(deepSeekStreamRequest.body.messages[0].content, /数学解题规则/);

await streamService.streamTutorReply(
  {
    message: "这段文字的主要内容怎么概括？",
    subjectId: "chinese",
    grade: 5,
    term: "上",
    conversationContext: []
  },
  () => {}
);
assert.match(deepSeekStreamRequest.body.messages[0].content, /语文辅导规则/);
assert.match(deepSeekStreamRequest.body.messages[0].content, /回到原文定位依据/);

const knowledgeEvents = [];
const knowledgeReply = await streamService.streamTutorReply(
  {
    message: "一元二次方程有哪些常用解法？",
    subjectId: "math",
    grade: 7,
    term: "上",
    mode: "knowledge",
    conversationContext: []
  },
  (event) => knowledgeEvents.push(event)
);
assert.equal(knowledgeReply.kind, "concept");
assert.equal(knowledgeReply.title, "知识讲解");
assert.deepEqual(knowledgeReply.microPractice, []);
assert.ok(knowledgeEvents.some((event) => event.type === "chunk"));
assert.match(deepSeekStreamRequest.body.messages[1].content, /知识问答/);
console.log("smoke tests passed");













const tempAuthDir = await mkdtemp(join(tmpdir(), "qisi-auth-"));
try {
  const authStore = createSqliteAuthStore({ dbPath: join(tempAuthDir, "auth.sqlite") });
  const authService = createAuthService({ authStore });
  const login = authService.login("student", "student123");
  assert.equal(login.user.role, "student");
  assert.ok(login.token);
  assert.throws(() => authService.login("student", "wrong-password"), /用户名或密码错误/);
  const request = { headers: { authorization: `Bearer ${login.token}` } };
  assert.equal(authService.authenticate(request).user.id, "student-demo");
  assert.throws(() => authService.requireRole(request, ["admin"]), /没有操作权限/);
  authStore.bindParent("parent-demo", "student-demo");
  assert.equal(authStore.isParentLinked("parent-demo", "student-demo"), true);
  authStore.close();
} finally {
  await rm(tempAuthDir, { recursive: true, force: true });
}
