import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { defaultState } from "../../src/data.js";
import { hydrateState } from "../../src/stateRepository.js";

const ROOT_DIR = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_DB_PATH = resolve(ROOT_DIR, "server/data/qisi.sqlite");
const STATE_ID = "default";

export function createSqliteStateStore({ dbPath = process.env.QISI_SQLITE_PATH || DEFAULT_DB_PATH } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);

  return {
    type: "sqlite",
    dbPath,

    loadState() {
      const row = db.prepare("SELECT payload FROM app_state WHERE id = ?").get(STATE_ID);
      if (!row?.payload) {
        const state = hydrateState(defaultState);
        this.saveState(state);
        return state;
      }

      return hydrateState(JSON.parse(row.payload));
    },

    saveState(state) {
      const hydrated = hydrateState(state);
      const updatedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO app_state (id, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      ).run(STATE_ID, JSON.stringify(hydrated), updatedAt);
      syncAuditEvents(db, hydrated.safetyLogs || []);
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

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT,
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);

  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, new Date().toISOString());
}

function syncAuditEvents(db, logs) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO audit_events (id, actor, type, detail, occurred_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const log of logs) {
    const occurredAt = log.occurredAt || log.time || new Date().toISOString();
    const id = stableAuditId(log, occurredAt);
    insert.run(id, log.actor || "", log.type || "未知事件", log.detail || "", occurredAt, JSON.stringify(log));
  }
}

function stableAuditId(log, occurredAt) {
  if (log.id) return String(log.id);
  return Buffer.from(`${occurredAt}|${log.type || ""}|${log.detail || ""}`).toString("base64url").slice(0, 48);
}
