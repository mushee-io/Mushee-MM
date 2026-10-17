import { getPool, closePool, hasDatabase } from "../lib/storage.js";
const prefix = process.argv.find(arg=>arg.startsWith("--prefix="))?.slice("--prefix=".length);
const dryRun = process.argv.includes("--dry-run");
if(!hasDatabase() || !/^mm_live_[a-f0-9]{9}$/.test(prefix||"")) {
  console.error("Usage: DATABASE_URL=... npm run revoke -- --prefix=mm_live_123456789 [--dry-run]");
  process.exitCode=1;
} else {
  try {
    const db=getPool();
    const rows=await db.query("SELECT id,key_prefix,active FROM api_keys WHERE key_prefix=$1",[prefix]);
    if(rows.rowCount!==1){console.error("Expected exactly one matching key; found",rows.rowCount);process.exitCode=1;}
    else if(dryRun)console.log("Would revoke key prefix",prefix);
    else {
      await db.query("UPDATE api_keys SET active=false,revoked_at=now() WHERE id=$1",[rows.rows[0].id]);
      console.log("Revoked key prefix",prefix);
    }
  } catch(e){console.error("Revocation failed:",e.message);process.exitCode=1;}
  finally{await closePool();}
}
