import { knowledgeMap, sampleQuestions, safetyKeywords, tutorStrategies } from "./data.js";

export function inspectSafety(input) {
  const normalized = input.trim().toLowerCase();
  const matched = safetyKeywords.find((word) => normalized.includes(word.toLowerCase()));

  if (!matched) {
    return { safe: true, reason: "" };
  }

  if (["直接给答案", "帮我作弊", "考试答案"].includes(matched)) {
    return {
      safe: true,
      reason: "疑似求答案",
      guidance: "我不能替你直接完成作业或考试，但可以给你提示和检查你的思路。"
    };
  }

  return {
    safe: false,
    reason: matched,
    guidance: "这个问题不适合继续展开。我们可以把话题转回学习内容，或者请家长、老师一起处理。"
  };
}

export function pickKnowledge(subjectId, grade) {
  const list = knowledgeMap[subjectId] || knowledgeMap.math;
  return list.find((item) => isGradeInRange(grade, item.gradeRange)) || list[0];
}

export function generateTutorReply({ message, subjectId, grade }) {
  const safety = inspectSafety(message);
  if (!safety.safe) {
    return {
      kind: "blocked",
      title: "安全提醒",
      text: safety.guidance,
      knowledge: null,
      microPractice: []
    };
  }

  const knowledge = inferKnowledge(message, subjectId, grade);
  const strategy = tutorStrategies[subjectId] || tutorStrategies.math;
  const isHomeworkLike = /求|解|证明|答案|作业|题|等于|方程|翻译|作文|阅读|怎么做|怎么算|不会做|帮我看/.test(message);
  const intro = safety.guidance ? `${safety.guidance}\n\n` : "";

  return {
    kind: isHomeworkLike ? "scaffold" : "concept",
    title: isHomeworkLike ? "我们先不急着看最终答案" : "先建立一个知识框架",
    text:
      intro +
      [
        `你现在练的是「${knowledge.title}」。`,
        `先聚焦：${strategy.rules[0]}。`,
        `找依据时注意：${strategy.rules[1]}。`,
        `先把你的尝试发给我，我会按“${strategy.rules[2]}”继续帮你。`
      ].join("\n"),
    knowledge,
    microPractice: buildMicroPractice(subjectId, grade, knowledge)
  };
}

export function generatePractice({ subjectId, grade, knowledgeId, count = 5 }) {
  const knowledge = findKnowledge(subjectId, knowledgeId) || pickKnowledge(subjectId, grade);
  const base = sampleQuestions.filter(
    (q) => q.subject === subjectId && (q.knowledgeId === knowledge.id || q.grade === grade)
  );
  const seed = base.length ? base : sampleQuestions;

  return Array.from({ length: count }).map((_, index) => {
    const template = seed[index % seed.length];
    return {
      id: `${knowledge.id}-${Date.now()}-${index}`,
      stem: adaptStem(template.stem, knowledge, index, grade),
      hint: index % 2 === 0 ? knowledge.goals[index % knowledge.goals.length] : template.hint,
      answer: template.answer,
      analysis: `先回到「${knowledge.title}」的核心：${knowledge.goals.join("、")}。检查时特别注意：${knowledge.commonMistakes[0]}。`,
      difficulty: index < 2 ? "基础" : index < 4 ? "提高" : "挑战",
      knowledge: knowledge.title
    };
  });
}

export function gradeAnswer(question, answer) {
  const trimmed = answer.trim();
  if (!trimmed) {
    return {
      score: 0,
      feedback: "还没有看到你的尝试。先写一个思路也可以，我会帮你补全。"
    };
  }

  const normalizedAnswer = question.answer.replace(/\s/g, "");
  const normalizedInput = trimmed.replace(/\s/g, "");
  const likelyCorrect = normalizedAnswer && normalizedInput.includes(normalizedAnswer);
  if (likelyCorrect || trimmed.length > 18) {
    return {
      score: likelyCorrect ? 100 : 78,
      feedback: "你的思路已经比较完整。下一步请检查单位、符号或关键词是否遗漏。"
    };
  }

  return {
    score: 52,
    feedback: `你已经开始了。再补一句“为什么这样做”，并用提示检查：${question.hint}`
  };
}

export function buildReviewQuiz({ subjectId, grade, mode, weakPoints }) {
  const count = mode === "final" ? 10 : 6;
  const knowledge = pickKnowledge(subjectId, grade);
  const questions = generatePractice({ subjectId, grade, knowledgeId: knowledge.id, count });

  return {
    title: mode === "midterm" ? "期中复习测验" : "期末综合测验",
    scope: mode === "midterm" ? "上半学期核心知识点" : "全学期重点与易错点",
    weakPoints,
    questions
  };
}

function inferKnowledge(message, subjectId, grade) {
  const list = knowledgeMap[subjectId] || knowledgeMap.math;
  const matched = list.find((item) => message.includes(item.title.split("：")[0]));
  return matched || pickKnowledge(subjectId, grade);
}

function findKnowledge(subjectId, knowledgeId) {
  return (knowledgeMap[subjectId] || []).find((item) => item.id === knowledgeId);
}

function buildMicroPractice(subjectId, grade, knowledge) {
  return generatePractice({ subjectId, grade, knowledgeId: knowledge.id, count: 2 });
}

function adaptStem(stem, knowledge, index, grade) {
  if (index === 0) return stem;
  return `【${grade}年级 · ${knowledge.title}】练习 ${index + 1}：请先写出思路，再完成答案。重点关注「${knowledge.goals[index % knowledge.goals.length]}」。`;
}

function isGradeInRange(grade, range) {
  const [start, end = start] = range.split("-").map(Number);
  return grade >= start && grade <= end;
}
