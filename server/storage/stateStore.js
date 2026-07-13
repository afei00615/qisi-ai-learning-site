import { createSqliteStructuredStateStore } from "./sqliteStructuredStateStore.js";

export function createStateStore(options = {}) {
  return createSqliteStructuredStateStore(options);
}
