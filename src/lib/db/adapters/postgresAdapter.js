import postgres from "postgres";

// Singleton pool to survive Next.js dev server hot-reload
if (!global._pgSql) {
  const connectionString = process.env.DATABASE_URL || "postgres://9router:password123@localhost:5432/9router";
  global._pgSql = postgres(connectionString, {
    max: 25,
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    types: {
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x) => "" + x,
        parse: (x) => (x === null ? null : parseFloat(x)),
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x) => "" + x,
        parse: (x) => (x === null ? null : Number(x)),
      },
      timestamptz: {
        to: 1184,
        from: [1184],
        serialize: (x) => (x instanceof Date ? x.toISOString() : "" + x),
        parse: (x) => (x === null ? null : (new Date(x)).toISOString()),
      },
      timestamp: {
        to: 1114,
        from: [1114],
        serialize: (x) => (x instanceof Date ? x.toISOString() : "" + x),
        parse: (x) => (x === null ? null : (new Date(x)).toISOString()),
      },
      date: {
        to: 1082,
        from: [1082],
        serialize: (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : "" + x),
        parse: (x) => (x === null ? null : String(x).slice(0, 10)),
      },
    },
    transform: {
      undefined: null,
    },
    onnotice: () => {},
  });
}

const sql = global._pgSql;

// Graceful pool close on shutdown
function gracefulClose() {
  if (global._pgSql) {
    try {
      global._pgSql.end({ timeout: 5 }).catch(() => {});
    } catch {}
  }
}

process.once("beforeExit", gracefulClose);
process.once("SIGINT", () => { gracefulClose(); process.exit(0); });
process.once("SIGTERM", () => { gracefulClose(); process.exit(0); });

export function createPostgresAdapter() {
  return {
    driver: "postgres",
    raw: sql,

    async run(query, params = []) {
      if (params.length === 0) {
        const result = await sql.unsafe(query);
        return { changes: result.count, lastInsertRowid: result[0]?.id || null };
      }
      const result = await sql.unsafe(query, params);
      return { changes: result.count, lastInsertRowid: result[0]?.id || null };
    },

    async get(query, params = []) {
      const rows = await sql.unsafe(query, params);
      return rows[0] || null;
    },

    async all(query, params = []) {
      const rows = await sql.unsafe(query, params);
      return rows;
    },

    async exec(rawSql) {
      return await sql.unsafe(rawSql);
    },

    async transaction(fn) {
      return await sql.begin(async (tx) => {
        const txAdapter = {
          driver: "postgres",
          raw: tx,
          async run(q, p = []) {
            const res = await tx.unsafe(q, p);
            return { changes: res.count, lastInsertRowid: res[0]?.id || null };
          },
          async get(q, p = []) {
            const rows = await tx.unsafe(q, p);
            return rows[0] || null;
          },
          async all(q, p = []) {
            return await tx.unsafe(q, p);
          },
          async exec(raw) {
            return await tx.unsafe(raw);
          },
        };
        return await fn(txAdapter);
      });
    },

    async close() {
      gracefulClose();
    },
  };
}
