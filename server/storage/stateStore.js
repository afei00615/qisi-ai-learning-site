import { createSqliteStateStore } from "./sqliteStateStore.js";

export function createStateStore(options = {}) {
  return createSqliteStateStore(options);
}
