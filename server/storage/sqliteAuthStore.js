import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSqliteAuthStore({ dbPath }) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  seedUsers(db);

  return {
    authenticate(username, password) {
      const user = db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(normalizeUsername(username));
      if (!user || !verifyPassword(password, user.password_hash)) return null;
      return publicUser(user);
    },

    createSession(userId) {
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
      db.prepare("INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(token, userId, now.toISOString(), expiresAt);
      return { token, expiresAt };
    },

    findSession(token) {
      if (!token) return null;
      const row = db.prepare(`
        SELECT u.id, u.username, u.name, u.role, u.status, s.expires_at
        FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'
      `).get(token, new Date().toISOString());
      return row ? { user: publicUser(row), expiresAt: row.expires_at } : null;
    },

    deleteSession(token) {
      if (token) db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
    },

    bindParent(parentId, studentId) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO parent_bindings (parent_id, student_id, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
        ON CONFLICT(parent_id, student_id) DO UPDATE SET status = 'active', updated_at = excluded.updated_at
      `).run(parentId, studentId, now, now);
      return { parentId, studentId, status: "active", updatedAt: now };
    },

    isParentLinked(parentId, studentId) {
      return Boolean(db.prepare("SELECT 1 FROM parent_bindings WHERE parent_id = ? AND student_id = ? AND status = 'active'").get(parentId, studentId));
    },

    close() {
      db.close();
    }
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'parent', 'admin')),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS parent_bindings (
      parent_id TEXT NOT NULL REFERENCES users(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(parent_id, student_id)
    );
  `);
}

function seedUsers(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, name, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `);
  const now = new Date().toISOString();
  for (const user of [
    ["student-demo", "student", "student123", "小安", "student"],
    ["parent-demo", "parent", "parent123", "家长", "parent"],
    ["admin-demo", "admin", "admin123", "管理员", "admin"]
  ]) {
    insert.run(user[0], user[1], hashPassword(user[2]), user[3], user[4], now);
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, expectedHex] = String(stored || "").split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(password || ""), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}
