import { DatabaseSync } from "node:sqlite";

export function createLlmAuditStore({ dbPath }) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_request_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      provider_request_id TEXT,
      user_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      prompt_cache_hit_tokens INTEGER NOT NULL DEFAULT 0,
      prompt_cache_miss_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      input_hash TEXT,
      output_hash TEXT,
      output_excerpt TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_audits_request ON llm_request_audits(request_id);
    CREATE INDEX IF NOT EXISTS idx_llm_audits_user_created ON llm_request_audits(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_llm_audits_status_created ON llm_request_audits(status, created_at);
  `);

  return {
    record(entry) {
      db.prepare(`INSERT INTO llm_request_audits
        (request_id, provider_request_id, user_id, operation, provider, model, status, retry_count, latency_ms,
         prompt_tokens, prompt_cache_hit_tokens, prompt_cache_miss_tokens, completion_tokens, total_tokens,
         estimated_cost_usd, input_hash, output_hash, output_excerpt, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(entry.requestId, entry.providerRequestId || null, entry.userId, entry.operation, entry.provider || "deepseek",
          entry.model, entry.status, entry.retryCount || 0, entry.latencyMs || 0, entry.usage?.prompt_tokens || 0,
          entry.usage?.prompt_cache_hit_tokens || 0, entry.usage?.prompt_cache_miss_tokens || 0,
          entry.usage?.completion_tokens || 0, entry.usage?.total_tokens || 0, entry.estimatedCostUsd || 0,
          entry.inputHash || null, entry.outputHash || null, entry.outputExcerpt || null,
          entry.errorMessage || null, entry.createdAt || new Date().toISOString());
    },

    usageSummary({ days = 30 } = {}) {
      const since = new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString();
      return db.prepare(`SELECT model, status, COUNT(*) AS requests, SUM(retry_count) AS retries,
        SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens) AS total_tokens, ROUND(SUM(estimated_cost_usd), 8) AS estimated_cost_usd
        FROM llm_request_audits WHERE created_at >= ? GROUP BY model, status ORDER BY model, status`).all(since);
    },

    close() {
      db.close();
    }
  };
}
