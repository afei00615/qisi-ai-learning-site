import assert from "node:assert/strict";
import { createLearningApiClient } from "./src/apiClient.js";
import { recordAuditLog } from "./src/auditLog.js";
import { buildReviewQuiz, generatePractice, generateTutorReply } from "./src/llmGateway.js";
import { createStateRepository } from "./src/stateRepository.js";
import { createDeepSeekClient } from "./server/deepseekClient.js";
import { createLearningService } from "./server/learningService.js";

const tutorReply = generateTutorReply({
  message: "这道方程怎么做？",
  subjectId: "math",
  grade: 7
});
assert.equal(tutorReply.kind, "scaffold");
assert.match(tutorReply.title, /不急着看最终答案/);
assert.equal(tutorReply.text.includes("x = 11"), false);
assert.equal(tutorReply.microPractice.length, 2);

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








