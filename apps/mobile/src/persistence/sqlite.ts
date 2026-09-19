import { openDatabaseSync } from 'expo-sqlite';
import type { FarmStore } from '../core/store';
import { applyPersistedState, serializeStore, type PersistedFarmState } from './serialize';

const DB_NAME = 'farm-shed.db';
const KEY = 'farm_state';

let db: ReturnType<typeof openDatabaseSync> | null = null;

function getDb() {
  if (!db) {
    db = openDatabaseSync(DB_NAME);
    db.execSync(
      'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
    );
  }
  return db;
}

export function loadPersistedStore(store: FarmStore): boolean {
  try {
    const row = getDb().getAllSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [KEY])[0];
    if (!row?.value) return false;
    const raw = JSON.parse(row.value) as { version?: number };
    if (raw.version !== 1 && raw.version !== 2) return false;
    applyPersistedState(store, raw as unknown as PersistedFarmState);
    return true;
  } catch {
    return false;
  }
}

export function persistStore(store: FarmStore): void {
  try {
    const payload = JSON.stringify(serializeStore(store));
    getDb().runSync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [KEY, payload],
    );
  } catch {
    /* persistence is best-effort on constrained devices */
  }
}

/** Test helper / reset */
export function clearPersistedStore(): void {
  try {
    getDb().runSync('DELETE FROM kv WHERE key = ?', [KEY]);
  } catch {
    /* ignore */
  }
}
