import test from "node:test";
import assert from "node:assert/strict";
import { configuredAssets,getLicensedQuote } from "../lib/licensed.js";
test("No vendor configuration does not invent stock, commodity or FX quotes",async()=>{
  const old=process.env.LICENSED_ASSET_CATALOG;
  delete process.env.LICENSED_ASSET_CATALOG;
  try {
    assert.deepEqual(configuredAssets(),[]);
    assert.deepEqual(await getLicensedQuote("equity","AAPL"),{
      status:404,error:"ASSET_NOT_CONFIGURED"
    });
  } finally {
    if(old===undefined)delete process.env.LICENSED_ASSET_CATALOG;
    else process.env.LICENSED_ASSET_CATALOG=old;
  }
});
test("Configured asset without vendor cannot return fake quote",async()=>{
  const old=process.env.LICENSED_ASSET_CATALOG;
  const base=process.env.LICENSED_PROVIDER_BASE_URL;
  const token=process.env.LICENSED_PROVIDER_TOKEN;
  process.env.LICENSED_ASSET_CATALOG=JSON.stringify([
    {assetClass:"equity",symbol:"AAPL",currency:"USD"}
  ]);
  delete process.env.LICENSED_PROVIDER_BASE_URL;
  delete process.env.LICENSED_PROVIDER_TOKEN;
  try {
    assert.equal(configuredAssets()[0].symbol,"AAPL");
    assert.deepEqual(await getLicensedQuote("equity","AAPL"),{
      status:503,error:"LICENSED_PROVIDER_UNAVAILABLE"
    });
  } finally {
    if(old===undefined)delete process.env.LICENSED_ASSET_CATALOG;
    else process.env.LICENSED_ASSET_CATALOG=old;
    if(base===undefined)delete process.env.LICENSED_PROVIDER_BASE_URL;
    else process.env.LICENSED_PROVIDER_BASE_URL=base;
    if(token===undefined)delete process.env.LICENSED_PROVIDER_TOKEN;
    else process.env.LICENSED_PROVIDER_TOKEN=token;
  }
});
test("Invalid catalog and duplicates are explicitly rejected",()=>{
  const old=process.env.LICENSED_ASSET_CATALOG;
  try {
    process.env.LICENSED_ASSET_CATALOG="bad JSON";
    assert.throws(()=>configuredAssets(),/INVALID_VENDOR_CATALOG/);
    process.env.LICENSED_ASSET_CATALOG=JSON.stringify([
      {assetClass:"equity",symbol:"AAPL",currency:"USD"},
      {assetClass:"equity",symbol:"AAPL",currency:"USD"}
    ]);
    assert.throws(()=>configuredAssets(),/DUPLICATE_VENDOR_SYMBOL/);
  } finally {
    if(old===undefined)delete process.env.LICENSED_ASSET_CATALOG;
    else process.env.LICENSED_ASSET_CATALOG=old;
  }
});


test("Provider JSON must describe the exact allowlisted symbol and provide a valid quote",async()=>{
  const env={};
  for(const k of ["LICENSED_ASSET_CATALOG","LICENSED_PROVIDER_BASE_URL","LICENSED_PROVIDER_TOKEN"]){
    env[k]=process.env[k];
  }
  const prior=globalThis.fetch;
  process.env.LICENSED_ASSET_CATALOG=JSON.stringify([{assetClass:"fx",symbol:"GBP-USD",currency:"USD"}]);
  process.env.LICENSED_PROVIDER_BASE_URL="https://institutional-data.example/v1";
  process.env.LICENSED_PROVIDER_TOKEN="server-only-token";
  try {
    globalThis.fetch=async (_url,_opts)=>({ok:true,json:async()=>({
      assetClass:"fx",symbol:"EUR-USD",currency:"USD",price:1.23,
      asOf:new Date().toISOString(),source:"vendor_one"
    })});
    assert.deepEqual(await getLicensedQuote("fx","GBP-USD"),{
      status:503,error:"INVALID_PROVIDER_RESPONSE"
    });
    globalThis.fetch=async()=>({ok:true,json:async()=>({
      assetClass:"fx",symbol:"GBP-USD",currency:"USD",price:1.35,
      asOf:new Date().toISOString(),source:"vendor_one"
    })});
    const result=await getLicensedQuote("fx","GBP-USD");
    assert.equal(result.status,200);
    assert.equal(result.data.price,1.35);
    assert.equal(result.data.priceType,"licensed-vendor-indicative");
  } finally {
    globalThis.fetch=prior;
    for(const [k,v] of Object.entries(env)) {
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
});
