import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import handler from "../api/index.js";

async function withServer(fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("health does not claim upstream connectivity", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/v1/health");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.upstreamChecked, false);
  });
});

test("markets lists actually integrated instruments", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/v1/markets");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.markets.length, 3);
    assert.deepEqual(body.assetClasses, ["crypto-spot"]);
  });
});

test("unknown asset is rejected before external requests", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/v1/price?symbol=FAKE-USD");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "INVALID_SYMBOL");
  });
});

test("invalid liquidity requests are blocked", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/v1/liquidity?symbol=BTC-USD&notional=9999999999");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "INVALID_NOTIONAL");
  });
});

test("configured API key protects data routes", async () => {
  const previous = process.env.API_KEY;
  process.env.API_KEY = "my-local-test-key";
  try {
    await withServer(async (base) => {
      const denied = await fetch(base + "/api/v1/price?symbol=BTC-USD");
      assert.equal(denied.status, 401);
      const markets = await fetch(base + "/api/v1/markets");
      assert.equal(markets.status, 200);
    });
  } finally {
    if (previous === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previous;
  }
});


test("persistent tick endpoint has an explicit not-configured state", async () => {
  const db = process.env.DATABASE_URL;
  const key = process.env.API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.API_KEY;
  try {
    await withServer(async (base) => {
      const response = await fetch(base + "/api/v1/ticks?symbol=BTC-USD");
      assert.equal(response.status,503);
      assert.equal((await response.json()).error,"HISTORY_NOT_CONFIGURED");
    });
  } finally {
    if (db === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL=db;
    if (key === undefined) delete process.env.API_KEY;
    else process.env.API_KEY=key;
  }
});


test("execution intelligence invalid side rejected", async () => {
  await withServer(async(base)=>{
    const r=await fetch(base+"/api/v1/execution-intelligence?symbol=BTC-USD&side=bad");
    assert.equal(r.status,400);assert.equal((await r.json()).error,"INVALID_SIDE");
  });
});


test("Oracle publisher POST without database returns explicit unavailable state",async()=>{
  const oldDb=process.env.DATABASE_URL,oldKey=process.env.API_KEY;
  delete process.env.DATABASE_URL;delete process.env.API_KEY;
  try {
    await withServer(async(base)=>{
      const r=await fetch(base+"/api/v1/oracle/reports",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({foo:"bar"})
      });
      assert.equal(r.status,503);assert.equal((await r.json()).error,"ORACLE_DATABASE_REQUIRED");
    });
  } finally {
    if(oldDb===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDb;
    if(oldKey===undefined)delete process.env.API_KEY;else process.env.API_KEY=oldKey;
  }
});

test("models endpoint refuses to fake unconfigured historical observations",async()=>{
  const oldDb=process.env.DATABASE_URL,oldKey=process.env.API_KEY;
  delete process.env.DATABASE_URL;delete process.env.API_KEY;
  try {
    await withServer(async(base)=>{
      const r=await fetch(base+"/api/v1/models/volatility?symbol=BTC-USD");
      assert.equal(r.status,503);assert.equal((await r.json()).error,"MODEL_HISTORY_NOT_CONFIGURED");
    });
  } finally {
    if(oldDb===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDb;
    if(oldKey===undefined)delete process.env.API_KEY;else process.env.API_KEY=oldKey;
  }
});

test("account usage needs real database tenant credentials",async()=>{
  const oldDb=process.env.DATABASE_URL,oldKey=process.env.API_KEY;
  delete process.env.DATABASE_URL;delete process.env.API_KEY;
  try {
    await withServer(async(base)=>{
      const r=await fetch(base+"/api/v1/account/usage");
      assert.equal(r.status,403);assert.equal((await r.json()).error,"TENANT_ACCOUNT_REQUIRED");
    });
  } finally {
    if(oldDb===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDb;
    if(oldKey===undefined)delete process.env.API_KEY;else process.env.API_KEY=oldKey;
  }
});
