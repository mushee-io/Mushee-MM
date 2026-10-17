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
