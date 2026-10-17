import { createHash, timingSafeEqual } from "node:crypto";
import { getPool, hasDatabase } from "./storage.js";

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function staticKeyMatches(presented, expected) {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function presentedApiKey(headers = {}) {
  if (typeof headers["x-api-key"] === "string") return headers["x-api-key"];
  const bearer = headers.authorization;
  if (typeof bearer === "string" && bearer.startsWith("Bearer ")) return bearer.slice(7);
  return "";
}

/**
 * Verifies a long-lived API key and atomically meters ONE connection or request.
 * Database mode does not fall back to a public API if the DB is unavailable.
 */
export async function authorise(token, { charge = true } = {}) {
  if (!hasDatabase()) {
    if (!process.env.API_KEY) return { ok: true, mode: "sandbox" };
    return staticKeyMatches(token, process.env.API_KEY)
      ? { ok: true, mode: "legacy-static" }
      : { ok: false, code: 401, error: "UNAUTHORISED" };
  }

  if (!/^mm_live_[a-f0-9]{64}$/.test(token || "")) {
    return { ok: false, code: 401, error: "UNAUTHORISED" };
  }

  const db = getPool();
  const key = await db.query(
    "SELECT k.id, k.tenant_id, k.rate_limit_per_minute FROM api_keys k " +
    "JOIN tenants t ON t.id=k.tenant_id WHERE k.key_hash=$1 AND k.active=true " +
    "AND k.revoked_at IS NULL AND t.active=true",
    [hashToken(token)]
  );
  if (!key.rows.length) return { ok: false, code: 401, error: "UNAUTHORISED" };
  const record = key.rows[0];
  if (charge) {
    const result = await db.query(
      "INSERT INTO api_usage_minute (key_id, tenant_id, window_start, request_count) " +
      "VALUES ($1,$2,date_trunc('minute',now()),1) " +
      "ON CONFLICT (key_id,window_start) DO UPDATE SET request_count=api_usage_minute.request_count+1 " +
      "WHERE api_usage_minute.request_count < $3 RETURNING request_count",
      [record.id, record.tenant_id, record.rate_limit_per_minute]
    );
    if (!result.rowCount) return { ok: false, code: 429, error: "RATE_LIMIT_EXCEEDED" };
  }
  // Not every request updates last_used_at, avoiding another synchronous query.
  return { ok: true, mode: "tenant", tenantId: record.tenant_id, keyId: record.id };
}
