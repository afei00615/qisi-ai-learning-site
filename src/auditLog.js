export const AUDIT_LOG_LIMIT = 50;

export function recordAuditLog(state, { type, detail, actor = "system", at = new Date() }, limit = AUDIT_LOG_LIMIT) {
  const entry = {
    time: formatAuditTime(at),
    type,
    detail,
    actor,
    occurredAt: at.toISOString()
  };

  state.safetyLogs = [entry, ...(Array.isArray(state.safetyLogs) ? state.safetyLogs : [])].slice(0, limit);
  return entry;
}

function formatAuditTime(date) {
  const now = new Date();
  if (Math.abs(now.getTime() - date.getTime()) < 60_000) return "刚刚";

  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
