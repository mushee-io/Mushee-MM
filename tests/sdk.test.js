import test from "node:test";
import assert from "node:assert/strict";
import { MusheeClient } from "../sdk/javascript/index.js";

test("SDK sends authenticated query safely",async()=>{
  let requested;
  const client=new MusheeClient({
    baseURL:"https://api.example.com",
    apiKey:"test_secret",
    fetchImpl:async(url,opts)=>{requested={url:String(url),opts};return {ok:true,json:async()=>({status:"ok"})};}
  });
  assert.equal((await client.execution("BTC-USD",{side:"sell",notional:10000})).status,"ok");
  assert.ok(requested.url.includes("/api/v1/execution-intelligence?symbol=BTC-USD"));
  assert.ok(requested.url.includes("notional=10000"));
  assert.equal(requested.opts.headers["x-api-key"],"test_secret");
});

test("SDK handles entitlement failures and rejects HTTP remote secrets",async()=>{
  assert.throws(()=>new MusheeClient({baseURL:"http://api.example.com",apiKey:"x"}));
  const client=new MusheeClient({
    baseURL:"http://localhost:3000",
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:"INSUFFICIENT_SCOPE"})})
  });
  await assert.rejects(()=>client.usage(),e=>e.status===403 && e.code==="INSUFFICIENT_SCOPE");
});
