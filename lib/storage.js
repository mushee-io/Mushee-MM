import pg from "pg";

let pool;
export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}
export function getPool() {
  if (!hasDatabase()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: "mushee-mm"
    });
    pool.on("error", (error) => {
      console.error("[db] idle pool connection error", error.message);
    });
  }
  return pool;
}
export async function closePool() {
  if (pool) { const existing = pool; pool = null; await existing.end(); }
}

export function tickToRow(tick) {
  return [tick.symbol, tick.provider, tick.last, tick.bid, tick.ask,
    tick.sourceTime, tick.receivedAt];
}

export async function insertTicks(ticks) {
  if (!ticks.length || !hasDatabase()) return 0;
  const db = getPool();
  const params = [];
  const groups = ticks.map((tick, i) => {
    const offset = i * 7;
    params.push(...tickToRow(tick));
    return "(" + Array.from({ length:7 }, (_, j) => "$" + (offset + j + 1)).join(",") + ")";
  });
  const result = await db.query(
    "INSERT INTO market_ticks (symbol,provider,last_price,bid_price,ask_price,source_time,received_at) VALUES " +
    groups.join(","),
    params
  );
  return result.rowCount;
}

export async function recentTicks(symbol, limit = 100) {
  if (!hasDatabase()) return null;
  const result = await getPool().query(
    "SELECT id, symbol, provider, last_price::float8 AS last, bid_price::float8 AS bid, " +
    "ask_price::float8 AS ask, source_time AS \"sourceTime\", received_at AS \"receivedAt\" " +
    "FROM market_ticks WHERE symbol=$1 ORDER BY id DESC LIMIT $2",
    [symbol, limit]
  );
  return result.rows;
}
