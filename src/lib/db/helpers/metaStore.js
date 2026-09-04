export async function getMeta(db, key, fallback = null) {
  const row = await db.get("SELECT value FROM _meta WHERE key = $1", [key]);
  return row ? row.value : fallback;
}

export async function setMeta(db, key, value) {
  await db.run(
    `INSERT INTO _meta(key, value)
     VALUES($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)],
  );
}

// Sync versions retained for legacy migration code using sync adapters.
export function getMetaSync(adapter, key, fallback = null) {
  const row = adapter.get("SELECT value FROM _meta WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

export function setMetaSync(adapter, key, value) {
  adapter.run(
    "INSERT INTO _meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, String(value)],
  );
}
