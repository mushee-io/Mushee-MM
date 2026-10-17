import test from "node:test";
import assert from "node:assert/strict";
import { normaliseCoinbase, normaliseKraken, coinbaseSubscribe, krakenSubscribe, parseSubscription } from "../lib/streaming.js";
import { hashToken, presentedApiKey, authorise } from "../lib/auth.js";
import { tickToRow } from "../lib/storage.js";

test("Coinbase subscription covers exactly the supported spot markets", () => {
  assert.deepEqual(coinbaseSubscribe().product_ids, ["BTC-USD","ETH-USD","SOL-USD"]);
  assert.ok(coinbaseSubscribe().channels.includes("ticker"));
});

test("Kraken subscription uses the public v2 ticker protocol", () => {
  const req = krakenSubscribe();
  assert.equal(req.method,"subscribe");
  assert.equal(req.params.channel,"ticker");
  assert.ok(req.params.symbol.includes("BTC/USD"));
});

test("normalises Coinbase ticker without inventing quote or timestamps", () => {
  const results = normaliseCoinbase({
    type:"ticker",product_id:"BTC-USD",price:"64001.5",
    best_bid:"64000",best_ask:"64002",time:"2026-10-17T21:00:00Z",sequence:200
  });
  assert.equal(results.length,1);
  assert.equal(results[0].last,64001.5);
  assert.equal(results[0].bid,64000);
  assert.equal(results[0].ask,64002);
  assert.equal(results[0].sourceTime,"2026-10-17T21:00:00.000Z");
  assert.deepEqual(normaliseCoinbase({type:"heartbeat"}),[]);
  assert.deepEqual(normaliseCoinbase({type:"ticker",product_id:"DOGE-USD",price:"1"}),[]);
});

test("normalises Kraken v2 ticker snapshots and ignores invalid data", () => {
  const result = normaliseKraken({
    channel:"ticker",type:"update",data:[{
      symbol:"ETH/USD",last:3500.75,bid:3500,ask:3501,
      timestamp:"2026-10-17T21:00:00.123456Z"
    },{symbol:"INVALID/USD",last:1}]
  });
  assert.equal(result.length,1);
  assert.equal(result[0].symbol,"ETH-USD");
  assert.equal(result[0].last,3500.75);
  assert.equal(result[0].sourceTime,"2026-10-17T21:00:00.123Z");
});

test("invalid ticker prices cannot reach the data plane", () => {
  assert.deepEqual(normaliseKraken({channel:"ticker",data:[{symbol:"SOL/USD",last:"NaN"}]}),[]);
  assert.deepEqual(normaliseCoinbase({type:"ticker",product_id:"SOL-USD",price:-1}),[]);
});

test("client subscription prevents unauthorized symbols and excessive channels", () => {
  assert.deepEqual(parseSubscription(JSON.stringify({type:"subscribe",symbols:["ETH-USD","btc/usd"]})),["ETH-USD","BTC-USD"]);
  assert.equal(parseSubscription("{}"),null);
  assert.equal(parseSubscription("not json"),null);
  assert.equal(parseSubscription(JSON.stringify({type:"subscribe",symbols:["UNSUPPORTED/USD"]})),null);
  assert.equal(parseSubscription(JSON.stringify({type:"subscribe",symbols:Array(100).fill("BTC-USD")})),null);
});

test("API key extraction avoids URL query tokens", () => {
  assert.equal(presentedApiKey({"x-api-key":"secret"}),"secret");
  assert.equal(presentedApiKey({authorization:"Bearer secret"}),"secret");
  assert.equal(presentedApiKey({}),"");
  assert.equal(hashToken("first")===hashToken("second"),false);
});

test("sandbox and static key auth are explicitly controlled", async () => {
  const previousDb=process.env.DATABASE_URL,previousKey=process.env.API_KEY;
  delete process.env.DATABASE_URL;
  process.env.API_KEY="a-test-secret";
  try {
    assert.equal((await authorise("wrong")).code,401);
    assert.equal((await authorise("a-test-secret")).ok,true);
  } finally {
    if(previousDb===undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL=previousDb;
    if(previousKey===undefined) delete process.env.API_KEY;
    else process.env.API_KEY=previousKey;
  }
});

test("database serializer writes only numeric fields and source times", () => {
  const row=tickToRow({symbol:"BTC-USD",provider:"kraken",last:12,
    bid:null,ask:13,sourceTime:null,receivedAt:"2026-10-17T20:00:00Z"});
  assert.deepEqual(row,["BTC-USD","kraken",12,null,13,null,"2026-10-17T20:00:00Z"]);
});
