import test from "node:test";
import assert from "node:assert/strict";
import { resolveMarket, boundedNumber } from "../lib/catalog.js";
import { median, aggregateTicker, summariseBooks, estimateLiquidity, analyseMarket } from "../lib/analytics.js";

test("market catalog rejects arbitrary symbols and accepts aliases", () => {
  assert.equal(resolveMarket("btc/usd").symbol, "BTC-USD");
  assert.equal(resolveMarket("SOL-USD").kraken, "SOLUSD");
  assert.equal(resolveMarket("DOGE-USD"), null);
  assert.equal(boundedNumber("NaN", 5, 1, 10), null);
});

test("median is source-neutral", () => {
  assert.equal(median([103, 101, 102]), 102);
  assert.equal(median([100, 104]), 102);
  assert.equal(median([]), null);
});

test("price aggregation flags divergences and degraded provider coverage", () => {
  const sources = [
    { provider: "coinbase", last: 100 },
    { provider: "kraken", last: 110 }
  ];
  const price = aggregateTicker(sources, "BTC-USD");
  assert.equal(price.price, 105);
  assert.equal(price.divergenceAlert, true);
  assert.equal(price.status, "disputed");
  const degraded = aggregateTicker([sources[0]], "BTC-USD");
  assert.equal(degraded.status, "degraded");
});

const books = [
  { provider: "coinbase", bids: [{ price: 99, size: 2 }], asks: [{ price: 101, size: 2 }] },
  { provider: "kraken", bids: [{ price: 98, size: 1 }], asks: [{ price: 102, size: 1 }] }
];

test("order-book summary combines independent venues", () => {
  const book = summariseBooks(books, "BTC-USD");
  assert.equal(book.bestBid, 99);
  assert.equal(book.bestAsk, 101);
  assert.equal(book.sourceCount, 2);
  assert.equal(book.referenceMid, 100);
});

test("buy liquidity simulation consumes lowest ask first", () => {
  const result = estimateLiquidity(books, "BTC-USD", "buy", 101);
  assert.equal(result.filledBase, 1);
  assert.equal(result.vwap, 101);
  assert.equal(result.estimatedSlippageBps, 100);
  assert.equal(result.fillRatio, 1);
  assert.equal(result.providerNotionalUsd.coinbase, 101);
});

test("sell liquidity simulation consumes highest bid first", () => {
  const result = estimateLiquidity(books, "BTC-USD", "sell", 100);
  assert.equal(result.filledBase, 1);
  assert.equal(result.filledNotionalUsd, 99);
  assert.equal(result.estimatedSlippageBps, 100);
});

test("simulator reports incomplete execution instead of inventing liquidity", () => {
  const result = estimateLiquidity(books, "BTC-USD", "buy", 1000);
  assert.equal(result.unfilled, true);
  assert.ok(result.fillRatio < 1);
  assert.equal(result.filledBase, 3);
});

test("statistical intelligence never labels itself a forecast", () => {
  const source = aggregateTicker([{ provider: "coinbase", last: 102 }], "BTC-USD");
  const candles = [
    { close: 100 }, { close: 101 }, { close: 99 }, { close: 102 }
  ];
  const analysis = analyseMarket(source, candles, 3600);
  assert.equal(analysis.symbol, "BTC-USD");
  assert.ok(analysis.annualisedRealisedVolatilityPct > 0);
  assert.ok(analysis.flags.includes("SINGLE_DATA_SOURCE"));
  assert.ok(analysis.disclaimer.includes("not a forecast"));
});


test("consistent prices retain normal status", () => {
  const p=aggregateTicker([{provider:"one",last:100},{provider:"two",last:100.02}],"BTC-USD");
  assert.equal(p.status,"normal");assert.equal(p.divergenceAlert,false);
});
