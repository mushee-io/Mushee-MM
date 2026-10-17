import { getPool, closePool, hasDatabase } from "../lib/storage.js";
const days = Number(process.env.RETENTION_DAYS || "30");
const batch = Number(process.env.RETENTION_BATCH || "10000");
const dryRun = process.argv.includes("--dry-run");
if (!hasDatabase() || !Number.isInteger(days) || days<1 || days>3650 ||
    !Number.isInteger(batch) || batch<1 || batch>100000) {
  console.error("DATABASE_URL required. Set RETENTION_DAYS (1-3650), RETENTION_BATCH (1-100000).");
  process.exitCode=1;
} else {
  try {
    const db=getPool();
    if(dryRun) {
      const r=await db.query("SELECT count(*)::int AS count FROM market_ticks WHERE received_at < now() - $1::int * interval '1 day'",[days]);
      console.log("Would delete",r.rows[0].count,"ticks older than",days,"days");
    } else {
      const r=await db.query(
        "WITH victims AS (SELECT id FROM market_ticks WHERE received_at < now() - $1::int * interval '1 day' LIMIT $2) " +
        "DELETE FROM market_ticks WHERE id IN (SELECT id FROM victims)",[days,batch]);
      console.log("Deleted",r.rowCount,"old ticks (one bounded batch). Run periodically.");
    }
  } catch(e){console.error("Retention failed:",e.message);process.exitCode=1;}
  finally{await closePool();}
}
