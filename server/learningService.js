import { knowledgeMap, subjects } from "../src/data.js";
import {
  buildReviewQuiz as buildMockReviewQuiz,
  generatePractice as generateMockPractice,
  generateTutorReply as generateMockTutorReply,
  gradeAnswer as gradeMockAnswer,
  inspectSafety,
  pickKnowledge
} from "../src/llmGateway.js";
import { createDeepSeekClient } from "./deepseekClient.js";

const KNOWLEDGE_STREAM_SYSTEM_PROMPT = `你是启思 AI 的知识问答老师。请输出纯文本，适合边生成边展示。
你擅长解释概念、公式、知识点区别、学习方法和通用问题。回答要准确、简洁、适合中小学生；可以举例，但不要把它包装成具体题目的解题流程。`;

const TEXT_STREAM_SYSTEM_PROMPT = `你是启思 AI 的流式学习辅导老师。请输出纯文本，适合边生成边展示。
你必须遵守：不直接代写作业或考试答案；先提示思路；鼓励学生写出自己的下一步；内容适合中小学生。`;

const SYSTEM_PROMPT = `你是启思 AI 的服务端学习模型。请严格输出 json，不要输出 Markdown。
目标用户是中国中小学生。你必须遵守：
1. 对作业、考试、练习题只做启发式辅导，不直接代写最终答案。
2. 输出要适合对应年级，语气温和、简洁、鼓励学生先写步骤。
3. 如涉及自伤、隐私、作弊、色情、暴力细节等风险，不展开细节。
4. 所有字段必须是中文，结构必须符合用户要求的 json 示例。`;

export function createLearningService({ deepSeekClient = createDeepSeekClient() } = {}) {
  const useDeepSeek = deepSeekClient?.enabled;

  return {
    provider: useDeepSeek ? "deepseek" : "mock",
    model: useDeepSeek ? deepSeekClient.model : "local-mock",

    async generateTutorReply(payload) {
      if (!useDeepSeek) return generateMockTutorReply(payload);

      const safety = inspectSafety(payload.message || "");
      if (!safety.safe) return generateMockTutorReply(payload);

      const knowledge = pickKnowledge(payload.subjectId, payload.grade);
      const fallback = generateMockTutorReply(payload);
      const subjectName = getSubjectName(payload.subjectId);
      const result = await deepSeekClient.chatJson({
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 1600,
        userPrompt: `请为一次学生提问生成 json 回复。

输入：
- 年级：${payload.grade} 年级${formatTerm(payload.term)}
- 学科：${subjectName}
- 学生问题：${payload.message}
- 最近对话上下文：${formatConversationContext(payload.conversationContext)}
- 推荐知识点：${JSON.stringify(knowledge)}
- 本地安全提示：${safety.guidance || "无"}

json 输出格式：
{
  "kind": "scaffold 或 concept",
  "title": "一句标题",
  "text": "分步骤提示，不能直接给最终答案",
  "knowledge": {"id":"${knowledge.id}","title":"${knowledge.title}"},
  "microPractice": [
    {"id":"p1","stem":"题干","hint":"提示","answer":"参考答案","analysis":"解析","difficulty":"基础","knowledge":"${knowledge.title}"}
  ]
}`
      });

      return sanitizeTutorReply(result, fallback, knowledge);
    },

    async streamTutorReply(payload, emit) {
      const fallback = payload.mode === "knowledge" ? buildMockKnowledgeReply(payload) : generateMockTutorReply(payload);
      const safety = inspectSafety(payload.message || "");
      const knowledge = pickKnowledge(payload.subjectId, payload.grade);
      const subjectName = getSubjectName(payload.subjectId);

      if (!useDeepSeek || !safety.safe) {
        emit({ type: "meta", title: fallback.title, kind: fallback.kind });
        await streamText(fallback.text, emit);
        emit({ type: "done", ...fallback });
        return fallback;
      }

      if (payload.mode === "knowledge") {
        emit({ type: "meta", title: "知识讲解", kind: "concept" });
        const userPrompt = `请直接输出给学生看的知识问答纯文本，不要输出 Markdown，不要输出 JSON。

输入：
- 年级：${payload.grade} 年级${formatTerm(payload.term)}
- 学科：${subjectName}
- 学生问题：${payload.message}
- 最近对话上下文：${formatConversationContext(payload.conversationContext)}
- 相关知识点参考：${JSON.stringify(knowledge)}

要求：
1. 优先回答概念、公式、知识点区别或学习方法。
2. 如果是追问，要承接最近对话。
3. 可以给一个小例子，但不要默认生成同类练习。
4. 语言适合中小学生。`;

        const text = await deepSeekClient.chatTextStream({
          systemPrompt: KNOWLEDGE_STREAM_SYSTEM_PROMPT,
          userPrompt,
          maxTokens: 1000,
          onChunk: (chunk) => emit({ type: "chunk", text: chunk })
        });

        const reply = {
          kind: "concept",
          title: "知识讲解",
          text: text || fallback.text,
          knowledge,
          microPractice: []
        };
        emit({ type: "done", ...reply });
        return reply;
      }

      emit({ type: "meta", title: "解答思路", kind: "scaffold" });
      let text = "";
      const userPrompt = `请直接输出给学生看的解答思路纯文本，不要输出 Markdown，不要输出 JSON。

输入：
- 年级：${payload.grade} 年级${formatTerm(payload.term)}
- 学科：${subjectName}
- 学生问题：${payload.message}
- 最近对话上下文：${formatConversationContext(payload.conversationContext)}
- 推荐知识点：${JSON.stringify(knowledge)}

要求：
1. 如果本轮是追问，要优先承接最近对话中的原题和上一轮解答，不要要求学生重复原题。
2. 先说明你承接的是哪道题或哪个步骤。
3. 分步骤启发学生理解思路。
4. 不要代写作业式地只给最终答案；如果必须出现结果，也要说明如何检查。
5. 结尾邀请学生先尝试下一步。`;

      text = await deepSeekClient.chatTextStream({
        systemPrompt: TEXT_STREAM_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 1200,
        onChunk: (chunk) => emit({ type: "chunk", text: chunk })
      });

      const reply = {
        kind: "scaffold",
        title: "解答思路",
        text: text || fallback.text,
        knowledge,
        microPractice: fallback.microPractice || []
      };
      emit({ type: "done", ...reply });
      return reply;
    },

    async generatePractice(payload) {
      if (!useDeepSeek) return generateMockPractice(payload);

      const count = clampCount(payload.count, 1, 10);
      const knowledge = findKnowledge(payload.subjectId, payload.knowledgeId) || pickKnowledge(payload.subjectId, payload.grade);
      const fallback = generateMockPractice({ ...payload, count });
      const subjectName = getSubjectName(payload.subjectId);
      const result = await deepSeekClient.chatJson({
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: Math.min(3600, 700 + count * 420),
        userPrompt: `请生成 ${count} 道练习题，并输出 json。

要求：
- 年级：${payload.grade} 年级${formatTerm(payload.term)}
- 学科：${subjectName}
- 知识点：${JSON.stringify(knowledge)}
- 难度分布：基础、提高、挑战
- 题目要适合中小学生，不出现不适宜内容。

json 输出格式：
{
  "questions": [
    {"id":"唯一短 id","stem":"题干","hint":"启发式提示","answer":"参考答案","analysis":"解析","difficulty":"基础/提高/挑战","knowledge":"${knowledge.title}"}
  ]
}`
      });

      return sanitizeQuestions(result.questions, fallback, count, knowledge.title);
    },

    async gradeAnswer({ question, answer }) {
      if (!useDeepSeek) return gradeMockAnswer(question, answer);

      const fallback = gradeMockAnswer(question, answer || "");
      const result = await deepSeekClient.chatJson({
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 600,
        userPrompt: `请批改学生答案并输出 json。

题目：${JSON.stringify(question)}
学生答案：${answer || ""}

要求：
- score 是 0 到 100 的整数。
- feedback 给出鼓励和下一步建议，不讽刺、不泄露不必要隐私。

json 输出格式：
{"score": 78, "feedback": "一句到两句反馈"}`
      });

      return {
        score: normalizeScore(result.score, fallback.score),
        feedback: asText(result.feedback, fallback.feedback)
      };
    },

    async buildReviewQuiz(payload) {
      if (!useDeepSeek) return buildMockReviewQuiz(payload);

      const count = payload.mode === "final" ? 10 : 6;
      const knowledge = pickKnowledge(payload.subjectId, payload.grade);
      const questions = await this.generatePractice({
        subjectId: payload.subjectId,
        grade: payload.grade,
        term: payload.term,
        knowledgeId: knowledge.id,
        count
      });

      return {
        title: payload.mode === "midterm" ? "期中复习测验" : "期末综合测验",
        scope: payload.mode === "midterm" ? "上半学期核心知识点" : "全学期重点与易错点",
        weakPoints: Array.isArray(payload.weakPoints) ? payload.weakPoints : [],
        questions
      };
    }
  };
}

function sanitizeTutorReply(result, fallback, knowledge) {
  const microPractice = sanitizeQuestions(result.microPractice, fallback.microPractice, 2, knowledge.title);
  return {
    kind: ["scaffold", "concept", "blocked"].includes(result.kind) ? result.kind : fallback.kind,
    title: asText(result.title, fallback.title),
    text: asText(result.text, fallback.text),
    knowledge: result.knowledge && typeof result.knowledge === "object" ? { ...knowledge, ...result.knowledge } : knowledge,
    microPractice
  };
}

function sanitizeQuestions(questions, fallback, count, knowledgeTitle) {
  const source = Array.isArray(questions) && questions.length ? questions : fallback;
  return source.slice(0, count).map((question, index) => ({
    id: asText(question.id, `${Date.now()}-${index}`),
    stem: asText(question.stem, fallback[index % fallback.length]?.stem || "请先写出解题思路。"),
    hint: asText(question.hint, fallback[index % fallback.length]?.hint || "先找条件和要求。"),
    answer: asText(question.answer, fallback[index % fallback.length]?.answer || "见解析"),
    analysis: asText(question.analysis, fallback[index % fallback.length]?.analysis || "围绕知识点逐步检查。"),
    difficulty: ["基础", "提高", "挑战"].includes(question.difficulty) ? question.difficulty : fallback[index % fallback.length]?.difficulty || "基础",
    knowledge: asText(question.knowledge, knowledgeTitle)
  }));
}

function buildMockKnowledgeReply(payload) {
  const knowledge = pickKnowledge(payload.subjectId, payload.grade);
  return {
    kind: "concept",
    title: "知识讲解",
    text: `我们先从「${knowledge.title}」来理解。你问的是：${payload.message}\n\n可以先抓住核心概念，再看它适用在哪些题型里。如果你愿意，也可以继续追问“它和另一个知识点有什么区别”。`,
    knowledge,
    microPractice: []
  };
}

async function streamText(text, emit) {
  const chunks = String(text || "").match(/.{1,12}/gs) || [""];
  for (const chunk of chunks) {
    emit({ type: "chunk", text: chunk });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function formatConversationContext(context) {
  if (!Array.isArray(context) || !context.length) return "无";
  return context
    .slice(-8)
    .map((item, index) => {
      if (item.role === "assistant") {
        return `${index + 1}. AI：${compactText([item.title, item.originalQuestion ? `原题：${item.originalQuestion}` : "", item.text].filter(Boolean).join("；"))}`;
      }
      return `${index + 1}. 学生：${compactText(item.text || "")}`;
    })
    .join("\n");
}

function compactText(text, maxLength = 500) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function asText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeScore(value, fallback) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function clampCount(value, min, max) {
  const count = Number(value);
  if (!Number.isFinite(count)) return min;
  return Math.max(min, Math.min(max, Math.round(count)));
}

function findKnowledge(subjectId, knowledgeId) {
  return (knowledgeMap[subjectId] || []).find((item) => item.id === knowledgeId);
}

function formatTerm(term) {
  return ["上", "下"].includes(term) ? term : "上";
}

function getSubjectName(subjectId) {
  return subjects.find((subject) => subject.id === subjectId)?.name || subjectId || "数学";
}




