import { randomBytes } from "node:crypto";
import { getPool, closePool, hasDatabase } from "../lib/storage.js";
import { hashToken } from "../lib/auth.js";

const args = Object.fromEntries(process.argv.slice(2).filter((v) => v.startsWith("--"))
  .map((v) => v.slice(2).split(/=(.*)/s).slice(0,2)));
const name = args.name?.trim();
const plan = args.plan || "starter";
const limit = Number(args.limit || 120);
const label = args.label || "primary";
const scopes = (args.scopes || "price,depth,history,intelligence,stream,account").split(",");
const VALID_SCOPES = ["price","depth","history","intelligence","stream","publish","account"];

if (!hasDatabase() || !name || name.length > 140 ||
    !["starter","growth","enterprise"].includes(plan) ||
    !Number.isInteger(limit) || limit < 1 || limit > 20000 ||
    label.length < 1 || label.length > 140 || scopes.length < 1 ||
    new Set(scopes).size !== scopes.length || !scopes.every((s) => VALID_SCOPES.includes(s))) {
  console.error("Usage: DATABASE_URL=... npm run tenant -- --name=Company [--plan=starter|growth|enterprise] [--limit=120] [--label=primary] [--scopes=price,depth]");
  process.exitCode = 1;
} else {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query(
      "INSERT INTO tenants (name,plan) VALUES ($1,$2) RETURNING id", [name,plan]
    );
    const token = "mm_live_" + randomBytes(32).toString("hex");
    await client.query(
      "INSERT INTO api_keys (tenant_id,label,key_prefix,key_hash,rate_limit_per_minute,scopes) VALUES ($1,$2,$3,$4,$5,$6)",
      [tenant.rows[0].id,label,token.slice(0,17),hashToken(token),limit,scopes]
    );
    await client.query("COMMIT");
    console.log("Tenant ID:", tenant.rows[0].id);
    console.log("API key (shown once; store securely):", token);
  } catch(error) {
    await client.query("ROLLBACK");
    console.error("Tenant creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await closePool();
  }
}
