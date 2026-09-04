import { createPostgresAdapter } from "./adapters/postgresAdapter.js";
import { PG_SCHEMA_SQL, ensureMonthlyPartitions } from "./schema.pg.js";

// Singleton adapter state
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function initAdapter() {
  const adapter = createPostgresAdapter();

  if (!state.logged) {
    console.log(`[DB] PostgreSQL Engine Initialized`);
    state.logged = true;
  }

  // Self-healing bootstrap: DDL & partitions
  try {
    await adapter.exec(PG_SCHEMA_SQL);
    await ensureMonthlyPartitions(adapter);
  } catch (err) {
    console.error(`[DB] Bootstrap schema error:`, err.message);
    throw err;
  }

  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) {
    state.initPromise = initAdapter().then((a) => {
      state.instance = a;
      return a;
    });
  }
  return state.initPromise;
}
