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


export async function minuteMedianPriceSeries(symbol,lookbackHours=24) {
  if(!hasDatabase()) return null;
  const result=await getPool().query(
    "SELECT date_trunc('minute',received_at) AS bucket, " +
    "percentile_cont(0.5) WITHIN GROUP(ORDER BY last_price::float8) AS price " +
    "FROM market_ticks WHERE symbol=$1 AND received_at>now()-($2::int * interval '1 hour') " +
    "GROUP BY 1 ORDER BY 1 DESC LIMIT 1500",
    [symbol,lookbackHours]
  );
  return result.rows.reverse().map(row=>({
    time:new Date(row.bucket).toISOString(),price:Number(row.price)
  }));
}

export async function selfUsage(tenantId,days=30) {
  if(!hasDatabase()) return null;
  const db=getPool();
  const [tenant,usage]=await Promise.all([
    db.query("SELECT id,name,plan,active,created_at FROM tenants WHERE id=$1",[tenantId]),
    db.query(
      "SELECT date(window_start) AS date, sum(request_count)::bigint AS requests " +
      "FROM api_usage_minute WHERE tenant_id=$1 AND window_start >= now()-($2::int * interval '1 day') " +
      "GROUP BY 1 ORDER BY 1 DESC",[tenantId,days]
    )
  ]);
  return {tenant:tenant.rows[0] || null,usage:usage.rows.map(x=>({
    date:x.date,requests:Number(x.requests)
  })),periodDays:days,
    note:"Counts recorded REST requests and admitted streaming connections, not WebSocket messages. This is usage accounting, not invoicing."};
}
