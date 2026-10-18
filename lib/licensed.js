/**
 * Adapter contract for an institution's separately licensed upstream data source.
 * No feed, instrument, or redistribution right is invented by this code.
 */
import { getPool,hasDatabase } from "./storage.js";

const CLASSES = new Set(["equity","fx","commodity","bond","derivative","rwa","index","metal","rate"]);
const SYMBOL = /^[A-Z0-9][A-Z0-9.:/_-]{0,39}$/;
export function configuredAssets() {
  const raw=process.env.LICENSED_ASSET_CATALOG;
  if(!raw)return [];
  let catalog;
  try {catalog=JSON.parse(raw);} catch {throw new Error("INVALID_VENDOR_CATALOG");}
  if(!Array.isArray(catalog) || catalog.length>1000)throw new Error("INVALID_VENDOR_CATALOG");
  const seen=new Set();
  return catalog.map(item=>{
    if(!item || !CLASSES.has(item.assetClass) ||
       typeof item.symbol!=="string" || !SYMBOL.test(item.symbol) ||
       typeof item.currency!=="string" || !/^[A-Z]{3}$/.test(item.currency)) {
      throw new Error("INVALID_VENDOR_CATALOG");
    }
    const key=item.assetClass+":"+item.symbol;
    if(seen.has(key))throw new Error("DUPLICATE_VENDOR_SYMBOL");
    seen.add(key);
    return {assetClass:item.assetClass,symbol:item.symbol,currency:item.currency};
  });
}
export async function isLicensedEntitled(tenantId,assetClass,symbol) {
  if(!hasDatabase() || !tenantId)return false;
  const r=await getPool().query(
    "SELECT 1 FROM licensed_entitlements WHERE tenant_id=$1 AND asset_class=$2 " +
    "AND symbol=$3 AND active=true AND (expires_at IS NULL OR expires_at>now())",
    [tenantId,assetClass,symbol]
  );
  return r.rowCount>0;
}
export async function getLicensedQuote(assetClass,symbol) {
  const asset=configuredAssets().find(x=>x.assetClass===assetClass && x.symbol===symbol);
  if(!asset)return {status:404,error:"ASSET_NOT_CONFIGURED"};
  const base=process.env.LICENSED_PROVIDER_BASE_URL;
  const token=process.env.LICENSED_PROVIDER_TOKEN;
  if(!base || !token || !/^https:\/\//.test(base))return {status:503,error:"LICENSED_PROVIDER_UNAVAILABLE"};
  let url;
  try {
    url=new URL(base.replace(/\/+$/,"")+"/quote");
    if(url.username || url.password || url.search || url.hash)throw Error("Invalid provider URL");
    url.searchParams.set("symbol",symbol);
    url.searchParams.set("assetClass",assetClass);
  } catch {return {status:503,error:"LICENSED_PROVIDER_UNAVAILABLE"};}
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:"error",
      headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
    if(!response.ok)return {status:503,error:"LICENSED_PROVIDER_UNAVAILABLE"};
    const body=await response.json();
    const price=Number(body.price);
    const asOf=Date.parse(body.asOf);
    const ageMs=Date.now()-asOf;
    if(body.assetClass!==assetClass || body.symbol!==symbol || body.currency!==asset.currency ||
       !Number.isFinite(price) || price<=0 || !Number.isFinite(asOf) ||
       ageMs< -30000 || ageMs>7*86400000 ||
       typeof body.source!=="string" || !/^[A-Za-z0-9_-]{2,80}$/.test(body.source)) {
      return {status:503,error:"INVALID_PROVIDER_RESPONSE"};
    }
    return {status:200,data:{
      assetClass,symbol,currency:asset.currency,price,asOf:new Date(asOf).toISOString(),
      source:body.source,ageSeconds:Math.round(ageMs/1000),
      dataStatus:ageMs<=60000?"recent":"delayed-or-market-closed",
      priceType:"licensed-vendor-indicative",
      disclaimer:"An upstream quote, not a verified exchange oracle or an executable order. Actual commercial redistribution must be separately licensed."
    }};
  } catch {return {status:503,error:"LICENSED_PROVIDER_UNAVAILABLE"};}
}
