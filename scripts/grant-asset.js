import { getPool,closePool,hasDatabase } from "../lib/storage.js";
import { configuredAssets } from "../lib/licensed.js";
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--"))
  .map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
const {tenantId,assetClass,symbol}=flags;
const action=flags.action || "grant";
if(!hasDatabase() || !/^[0-9a-f-]{36}$/i.test(tenantId||"") ||
   !configuredAssets().some(x=>x.assetClass===assetClass && x.symbol===symbol) ||
   !["grant","revoke"].includes(action)) {
  console.error("Usage: npm run asset:grant -- --tenantId=UUID --assetClass=equity --symbol=AAPL [--action=grant|revoke]");
  process.exitCode=1;
} else {
  try {
    const db=getPool();
    if(action==="grant") {
      await db.query("INSERT INTO licensed_entitlements(tenant_id,asset_class,symbol) VALUES($1,$2,$3) " +
        "ON CONFLICT(tenant_id,asset_class,symbol) DO UPDATE SET active=true",
      [tenantId,assetClass,symbol]);
    } else {
      await db.query("UPDATE licensed_entitlements SET active=false WHERE tenant_id=$1 AND asset_class=$2 AND symbol=$3",
        [tenantId,assetClass,symbol]);
    }
    console.log(action==="grant"?"Granted":"Revoked",assetClass,symbol,"for tenant",tenantId);
  } catch(e){console.error("Entitlement operation failed:",e.message);process.exitCode=1;}
  finally{await closePool();}
}
