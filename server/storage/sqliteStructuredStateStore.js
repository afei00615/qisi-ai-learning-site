import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { defaultState } from "../../src/data.js";
import { hydrateState } from "../../src/stateRepository.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_DB_PATH = resolve(ROOT_DIR, "server/data/qisi.sqlite");
const DEFAULT_STUDENT_ID = "student-demo";

export function createSqliteStructuredStateStore({ dbPath = process.env.QISI_SQLITE_PATH || DEFAULT_DB_PATH } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  migrateLegacySnapshot(db);

  return {
    type: "sqlite-structured",
    dbPath,

    loadState(studentId = DEFAULT_STUDENT_ID) {
      if (!hasStudent(db, studentId)) persistState(db, hydrateState(defaultState), studentId);
      return loadState(db, studentId);
    },

    saveState(state, studentId = DEFAULT_STUDENT_ID) {
      const updatedAt = new Date().toISOString();
      persistState(db, hydrateState(state), studentId, updatedAt);
      return { ok: true, updatedAt };
    },

    close() {
      db.close();
    }
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      binding_code TEXT NOT NULL UNIQUE,
      grade INTEGER NOT NULL,
      term TEXT NOT NULL,
      profile_complete INTEGER NOT NULL DEFAULT 0,
      profile_created_at TEXT,
      daily_minutes INTEGER NOT NULL DEFAULT 0,
      daily_limit INTEGER NOT NULL DEFAULT 60,
      weak_points TEXT NOT NULL DEFAULT '[]',
      streak INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('solve', 'knowledge')),
      subject_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_student ON chat_sessions(student_id, kind, subject_id);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      original_question TEXT,
      kind TEXT,
      micro_practice TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, sequence);
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('solve', 'knowledge')),
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_sessions_student ON conversation_sessions(student_id, kind, subject_id, updated_at);
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      original_question TEXT,
      kind TEXT,
      micro_practice TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(session_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_session ON conversation_messages(session_id, sequence);    CREATE TABLE IF NOT EXISTS practice_sets (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      knowledge_id TEXT,
      term TEXT,
      mode TEXT NOT NULL DEFAULT 'practice',
      title TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_practice_sets_student ON practice_sets(student_id, created_at);
    CREATE TABLE IF NOT EXISTS practice_items (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES practice_sets(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      stem TEXT NOT NULL,
      answer TEXT,
      hint TEXT,
      analysis TEXT,
      difficulty TEXT,
      knowledge TEXT,
      UNIQUE(set_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES practice_items(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      answer TEXT,
      score REAL,
      feedback TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learning_reports (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS review_runs (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(student_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS moderation_items (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      priority TEXT NOT NULL,
      detail TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_items(status, created_at);
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT,
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(2, new Date().toISOString());
  migrateLegacyChatRows(db);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(3, new Date().toISOString());
}

function migrateLegacySnapshot(db) {
  if (hasStudent(db, DEFAULT_STUDENT_ID)) return;
  const legacy = db.prepare("SELECT payload FROM app_state WHERE id = 'default'").get();
  const state = legacy?.payload ? hydrateState(safeJson(legacy.payload, defaultState)) : hydrateState(defaultState);
  persistState(db, state, DEFAULT_STUDENT_ID);
}

function loadState(db, studentId) {
  const state = hydrateState(defaultState);
  const profile = db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(studentId);
  state.student = {
    ...state.student,
    name: profile.name,
    bindingCode: profile.binding_code,
    grade: profile.grade,
    term: profile.term,
    profileComplete: Boolean(profile.profile_complete),
    profileCreatedAt: profile.profile_created_at || undefined,
    dailyMinutes: profile.daily_minutes,
    dailyLimit: profile.daily_limit,
    weakPoints: safeJson(profile.weak_points, []),
    streak: profile.streak
  };
  const conversations = loadConversationThreads(db, studentId);
  state.conversationThreads = conversations.threads;
  state.activeConversationIds = conversations.activeIds;
  state.chatSessions = activeSessionMap(conversations, "solve");
  state.knowledgeSessions = activeSessionMap(conversations, "knowledge");
  state.chatSessions.math ||= state.chats;
  state.knowledgeSessions.math ||= state.knowledgeChats;
  state.chats = state.chatSessions.math;
  state.knowledgeChats = state.knowledgeSessions.math;
  state.reports = db.prepare("SELECT label, value FROM learning_reports WHERE student_id = ? ORDER BY sequence").all(studentId);
  if (!state.reports.length) state.reports = structuredClone(defaultState.reports);
  state.reviewHistory = db.prepare("SELECT payload FROM review_runs WHERE student_id = ? ORDER BY sequence").all(studentId).map((row) => safeJson(row.payload, {}));
  state.practiceSets = loadPracticeSets(db, studentId);
  state.moderationQueue = db.prepare("SELECT * FROM moderation_items ORDER BY created_at DESC").all().map(mapModerationRow);
  state.safetyLogs = db.prepare("SELECT payload FROM audit_events ORDER BY occurred_at DESC LIMIT 200").all().map((row) => safeJson(row.payload, {}));
  return state;
}

function persistState(db, state, studentId, updatedAt = new Date().toISOString()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertProfile(db, state.student, studentId, updatedAt);
    replaceConversationThreads(db, state, studentId, updatedAt);
    replaceReports(db, state.reports || [], studentId, updatedAt);
    replaceReviewRuns(db, state.reviewHistory || [], studentId, updatedAt);
    replacePracticeSets(db, state.practiceSets || [], studentId, updatedAt);
    replaceModerationItems(db, state.moderationQueue || [], studentId);
    syncAuditEvents(db, state.safetyLogs || []);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function upsertProfile(db, student, studentId, updatedAt) {
  const code = uniqueBindingCode(db, student.bindingCode, studentId);
  db.prepare(`
    INSERT INTO student_profiles (user_id, name, binding_code, grade, term, profile_complete, profile_created_at, daily_minutes, daily_limit, weak_points, streak, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, binding_code=excluded.binding_code, grade=excluded.grade,
      term=excluded.term, profile_complete=excluded.profile_complete, profile_created_at=excluded.profile_created_at,
      daily_minutes=excluded.daily_minutes, daily_limit=excluded.daily_limit, weak_points=excluded.weak_points,
      streak=excluded.streak, updated_at=excluded.updated_at
  `).run(studentId, student.name || "\u5b66\u751f", code, Number(student.grade) || 7, student.term || "\u4e0a",
    student.profileComplete ? 1 : 0, student.profileCreatedAt || null, Number(student.dailyMinutes) || 0,
    Number(student.dailyLimit) || 60, JSON.stringify(student.weakPoints || []), Number(student.streak) || 0, updatedAt);
}
function migrateLegacyChatRows(db) {
  const sessions = db.prepare("SELECT * FROM chat_sessions").all();
  const oldMessages = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY sequence");
  const insertSession = db.prepare("INSERT OR IGNORE INTO conversation_sessions (id, student_id, kind, subject_id, title, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)");
  const insertMessage = db.prepare(`INSERT OR IGNORE INTO conversation_messages
    (id, session_id, sequence, role, title, text, original_question, kind, micro_practice, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const session of sessions) {
    const messages = oldMessages.all(session.id);
    const firstQuestion = messages.find((message) => message.role === "user")?.text || "";
    const title = firstQuestion ? (firstQuestion.length > 20 ? `${firstQuestion.slice(0, 20)}...` : firstQuestion) : (session.kind === "solve" ? "历史解题对话" : "历史知识问答");
    insertSession.run(session.id, session.student_id, session.kind, session.subject_id, title, session.created_at, session.updated_at);
    for (const message of messages) insertMessage.run(message.id, session.id, message.sequence, message.role, message.title, message.text, message.original_question, message.kind, message.micro_practice, message.created_at);
  }
}

function replaceConversationThreads(db, state, studentId, updatedAt) {
  const old = db.prepare("SELECT id FROM conversation_sessions WHERE student_id = ?").all(studentId);
  for (const row of old) db.prepare("DELETE FROM conversation_sessions WHERE id = ?").run(row.id);
  const insertSession = db.prepare("INSERT INTO conversation_sessions (id, student_id, kind, subject_id, title, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertMessage = db.prepare(`INSERT INTO conversation_messages
    (id, session_id, sequence, role, title, text, original_question, kind, micro_practice, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const threadRoot = state.conversationThreads || {};
  for (const kind of ["solve", "knowledge"]) {
    const fallbackMap = kind === "solve" ? state.chatSessions : state.knowledgeSessions;
    const bySubject = threadRoot[kind] || Object.fromEntries(Object.entries(fallbackMap || {}).map(([subjectId, messages]) => [subjectId, [{ id: `${studentId}:${kind}:${subjectId}`, title: "历史对话", messages }]]));
    for (const [subjectId, threads] of Object.entries(bySubject)) {
      for (const [threadIndex, thread] of (threads || []).entries()) {
        const threadId = thread.id || `${kind}:${subjectId}:${threadIndex}`;
        const sessionId = threadId.startsWith(`${studentId}:`) ? threadId : `${studentId}:${threadId}`;
        const isActive = state.activeConversationIds?.[kind]?.[subjectId] === threadId ? 1 : 0;
        const createdAt = thread.createdAt || updatedAt;
        insertSession.run(sessionId, studentId, kind, subjectId, thread.title || "历史对话", isActive, createdAt, thread.updatedAt || createdAt);
        (thread.messages || []).filter((message) => !message.streaming).forEach((message, index) => {
          insertMessage.run(`${sessionId}:${index}`, sessionId, index, message.role || "user", message.title || null, message.text || "", message.originalQuestion || null, message.kind || null, JSON.stringify(message.microPractice || []), message.createdAt || updatedAt);
        });
      }
    }
  }
}

function loadConversationThreads(db, studentId) {
  const result = { threads: { solve: {}, knowledge: {} }, activeIds: { solve: {}, knowledge: {} } };
  const sessions = db.prepare("SELECT * FROM conversation_sessions WHERE student_id = ? ORDER BY updated_at DESC").all(studentId);
  const messages = db.prepare("SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY sequence");
  for (const session of sessions) {
    const thread = {
      id: session.id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messages: messages.all(session.id).map(mapConversationMessage)
    };
    result.threads[session.kind][session.subject_id] ||= [];
    result.threads[session.kind][session.subject_id].push(thread);
    if (session.is_active || !result.activeIds[session.kind][session.subject_id]) result.activeIds[session.kind][session.subject_id] = session.id;
  }
  return result;
}

function mapConversationMessage(row) {
  return {
    role: row.role,
    ...(row.title ? { title: row.title } : {}),
    text: row.text,
    ...(row.original_question ? { originalQuestion: row.original_question } : {}),
    ...(row.kind ? { kind: row.kind } : {}),
    microPractice: safeJson(row.micro_practice, [])
  };
}

function activeSessionMap(conversations, kind) {
  const result = {};
  for (const [subjectId, threads] of Object.entries(conversations.threads[kind])) {
    const activeId = conversations.activeIds[kind][subjectId];
    result[subjectId] = threads.find((thread) => thread.id === activeId)?.messages || threads[0]?.messages || [];
  }
  return result;
}
function replaceSessions(db, sessionMap, studentId, kind, updatedAt) {
  const existing = db.prepare("SELECT id FROM chat_sessions WHERE student_id = ? AND kind = ?").all(studentId, kind);
  for (const row of existing) db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(row.id);
  const insertSession = db.prepare("INSERT INTO chat_sessions (id, student_id, kind, subject_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insertMessage = db.prepare(`INSERT INTO chat_messages
    (id, session_id, sequence, role, title, text, original_question, kind, micro_practice, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [subjectId, messages] of Object.entries(sessionMap || {})) {
    if (!Array.isArray(messages)) continue;
    const sessionId = `${studentId}:${kind}:${subjectId}`;
    insertSession.run(sessionId, studentId, kind, subjectId, updatedAt, updatedAt);
    messages.filter((message) => !message.streaming).forEach((message, index) => {
      insertMessage.run(`${sessionId}:${index}`, sessionId, index, message.role || "user", message.title || null,
        message.text || "", message.originalQuestion || null, message.kind || null,
        JSON.stringify(message.microPractice || []), message.createdAt || updatedAt);
    });
  }
}

function loadSessionMap(db, studentId, kind) {
  const result = {};
  const sessions = db.prepare("SELECT id, subject_id FROM chat_sessions WHERE student_id = ? AND kind = ?").all(studentId, kind);
  const messages = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY sequence");
  for (const session of sessions) {
    result[session.subject_id] = messages.all(session.id).map((row) => ({
      role: row.role,
      ...(row.title ? { title: row.title } : {}),
      text: row.text,
      ...(row.original_question ? { originalQuestion: row.original_question } : {}),
      ...(row.kind ? { kind: row.kind } : {}),
      microPractice: safeJson(row.micro_practice, [])
    }));
  }
  return result;
}

function replaceReports(db, reports, studentId, updatedAt) {
  db.prepare("DELETE FROM learning_reports WHERE student_id = ?").run(studentId);
  const insert = db.prepare("INSERT INTO learning_reports (id, student_id, sequence, label, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  reports.forEach((report, index) => insert.run(`${studentId}:report:${index}`, studentId, index, report.label || "", String(report.value || ""), updatedAt));
}

function replaceReviewRuns(db, runs, studentId, updatedAt) {
  db.prepare("DELETE FROM review_runs WHERE student_id = ?").run(studentId);
  const insert = db.prepare("INSERT INTO review_runs (id, student_id, sequence, payload, created_at) VALUES (?, ?, ?, ?, ?)");
  runs.forEach((run, index) => insert.run(run.id || `${studentId}:review:${index}`, studentId, index, JSON.stringify(run), run.createdAt || updatedAt));
}

function replacePracticeSets(db, sets, studentId, updatedAt) {
  const oldSets = db.prepare("SELECT id FROM practice_sets WHERE student_id = ?").all(studentId);
  for (const row of oldSets) db.prepare("DELETE FROM practice_sets WHERE id = ?").run(row.id);
  const insertSet = db.prepare("INSERT INTO practice_sets (id, student_id, subject_id, knowledge_id, term, mode, title, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertItem = db.prepare("INSERT INTO practice_items (id, set_id, sequence, stem, answer, hint, analysis, difficulty, knowledge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertAttempt = db.prepare("INSERT INTO practice_attempts (id, item_id, student_id, answer, score, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  sets.forEach((set, setIndex) => {
    const setId = set.id || `${studentId}:practice:${setIndex}`;
    insertSet.run(setId, studentId, set.subjectId || "math", set.knowledgeId || null, set.term || null, set.mode || "practice", set.title || null, set.createdAt || updatedAt, JSON.stringify(set.metadata || {}));
    (set.questions || []).forEach((item, itemIndex) => {
      const itemId = item.id || `${setId}:item:${itemIndex}`;
      insertItem.run(itemId, setId, itemIndex, item.stem || "", item.answer || null, item.hint || null, item.analysis || null, item.difficulty || null, item.knowledge || null);
      (item.attempts || []).forEach((attempt, attemptIndex) => insertAttempt.run(attempt.id || `${itemId}:attempt:${attemptIndex}`, itemId, studentId, attempt.answer || null, attempt.score ?? null, attempt.feedback || null, attempt.createdAt || updatedAt));
    });
  });
}

function loadPracticeSets(db, studentId) {
  const sets = db.prepare("SELECT * FROM practice_sets WHERE student_id = ? ORDER BY created_at").all(studentId);
  const items = db.prepare("SELECT * FROM practice_items WHERE set_id = ? ORDER BY sequence");
  const attempts = db.prepare("SELECT * FROM practice_attempts WHERE item_id = ? ORDER BY created_at");
  return sets.map((set) => ({
    id: set.id, subjectId: set.subject_id, knowledgeId: set.knowledge_id, term: set.term, mode: set.mode,
    title: set.title, createdAt: set.created_at, metadata: safeJson(set.metadata, {}),
    questions: items.all(set.id).map((item) => ({
      id: item.id, stem: item.stem, answer: item.answer, hint: item.hint, analysis: item.analysis,
      difficulty: item.difficulty, knowledge: item.knowledge,
      attempts: attempts.all(item.id).map((attempt) => ({ id: attempt.id, answer: attempt.answer, score: attempt.score, feedback: attempt.feedback, createdAt: attempt.created_at }))
    }))
  }));
}

function replaceModerationItems(db, items, studentId) {
  const upsert = db.prepare(`INSERT INTO moderation_items
    (id, student_id, type, source, priority, detail, status, created_at, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at, detail=excluded.detail`);
  for (const item of items) upsert.run(item.id, item.studentId || studentId, item.type || "\u672a\u77e5\u4e8b\u4ef6", item.source || "system", item.priority || "\u4e2d", item.detail || "", item.status || "pending", item.createdAt || new Date().toISOString(), item.reviewedBy || null, item.reviewedAt || null);
}

function mapModerationRow(row) {
  return { id: row.id, studentId: row.student_id, type: row.type, source: row.source, priority: row.priority, detail: row.detail, status: row.status, createdAt: row.created_at, ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}), ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}) };
}

function syncAuditEvents(db, logs) {
  const insert = db.prepare("INSERT OR IGNORE INTO audit_events (id, actor, type, detail, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)");
  for (const log of logs) {
    const occurredAt = log.occurredAt || log.time || new Date().toISOString();
    const id = log.id || Buffer.from(`${occurredAt}|${log.type || ""}|${log.detail || ""}`).toString("base64url").slice(0, 48);
    insert.run(id, log.actor || "", log.type || "\u672a\u77e5\u4e8b\u4ef6", log.detail || "", occurredAt, JSON.stringify({ ...log, occurredAt }));
  }
}

function hasStudent(db, studentId) {
  return Boolean(db.prepare("SELECT 1 FROM student_profiles WHERE user_id = ?").get(studentId));
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return structuredClone(fallback); }
}

function bindingCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function uniqueBindingCode(db, preferred, studentId) {
  let code = String(preferred || bindingCode()).toUpperCase();
  let owner = db.prepare("SELECT user_id FROM student_profiles WHERE binding_code = ?").get(code);
  while (owner && owner.user_id !== studentId) {
    code = bindingCode();
    owner = db.prepare("SELECT user_id FROM student_profiles WHERE binding_code = ?").get(code);
  }
  return code;
}
