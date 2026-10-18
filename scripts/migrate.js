import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPool, closePool, hasDatabase } from "../lib/storage.js";

if (!hasDatabase()) { console.error("DATABASE_URL is required"); process.exitCode = 1; }
else {
  try {
    for (const migration of ["001_market_data.sql","002_entitlements.sql","003_oracle_and_usage.sql","004_licensed_assets.sql","005_institutional_billing.sql"]) {
      const filename = fileURLToPath(new URL("../sql/" + migration, import.meta.url));
      const ddl = await readFile(filename,"utf8");
      await getPool().query(ddl);
      console.log("Applied",migration);
    }
    console.log("Market data schema migration completed.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally { await closePool(); }
}
