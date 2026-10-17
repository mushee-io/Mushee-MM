import test from "node:test";
import assert from "node:assert/strict";
import { selectFreshSources, selectFreshBooks } from "../lib/quality.js";
import { executionIntelligence } from "../lib/execution.js";

const now=Date.parse("2026-10-17T20:00:15Z");
const recent="2026-10-17T20:00:10Z";
const old="2026-10-17T19:58:10Z";

test("stale and future observations are rejected", () => {
  const result=selectFreshSources([
    {provider:"coinbase",last:100,receivedAt:recent,sourceTime:recent},
    {provider:"kraken",last:101,receivedAt:old},
    {provider:"future",last:103,receivedAt:"2026-10-17T20:01:30Z"}
  ],{nowMs:now});
  assert.equal(result.accepted.length,1);
  assert.deepEqual(result.rejected.map(x=>x.reason),["STALE_RECEIPT","STALE_RECEIPT"]);
});

test("source timestamp must also be fresh", () => {
  const r=selectFreshSources([{provider:"coinbase",last:100,receivedAt:recent,sourceTime:old}],{nowMs:now});
  assert.deepEqual(r.rejected,[{provider:"coinbase",reason:"STALE_SOURCE"}]);
});

const books=[
  {provider:"coinbase",receivedAt:recent,bids:[{price:99,size:2}],asks:[{price:101,size:2}]},
  {provider:"kraken",receivedAt:recent,bids:[{price:98,size:2}],asks:[{price:102,size:2}]}
];

test("crossed single-venue book is excluded",() => {
  const r=selectFreshBooks([...books,{provider:"bad",receivedAt:recent,bids:[{price:101,size:1}],asks:[{price:99,size:1}]}],{nowMs:now});
  assert.equal(r.accepted.length,2);
  assert.deepEqual(r.rejected,[{provider:"bad",reason:"CROSSED_OR_INVALID_VENUE_BOOK"}]);
});

test("execution signals derive reproducible microstructure metrics",() => {
  const r=executionIntelligence(books,"BTC-USD","buy",101);
  assert.equal(r.quote.vwap,101);
  assert.equal(r.marketMicrostructure.totalDisplayedBidDepthUsd,394);
  assert.equal(r.marketMicrostructure.totalDisplayedAskDepthUsd,406);
  assert.equal(r.marketMicrostructure.topOfBookSpreadBps,200);
  assert.ok(r.flags.includes("WIDE_TOP_OF_BOOK_SPREAD"));
  assert.ok(r.flags.includes("HIGH_SINGLE_VENUE_CONCENTRATION"));
  assert.equal(r.availability,"indicative");
});

test("large order identifies insufficient displayed liquidity",() => {
  const r=executionIntelligence(books,"BTC-USD","buy",10000);
  assert.ok(r.flags.includes("INSUFFICIENT_DISPLAYED_LIQUIDITY"));
  assert.equal(r.quote.unfilled,true);
});

test("execution intelligence rejects invalid requests",() => {
  assert.throws(()=>executionIntelligence([],"BTC-USD","buy",100));
  assert.throws(()=>executionIntelligence(books,"BTC-USD","bad",100));
});
