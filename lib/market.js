import {
  coinbaseTicker, krakenTicker, coinbaseOrderBook, krakenOrderBook,
  coinbaseHistory, collectProviders
} from "./providers.js";
import { aggregateTicker, summariseBooks, estimateLiquidity, analyseMarket } from "./analytics.js";
import { cached } from "./cache.js";

export async function getPrice(market) {
  return await cached("price:" + market.symbol, 2000, async () => {
    const data = await collectProviders([
      ["coinbase", () => coinbaseTicker(market)],
      ["kraken", () => krakenTicker(market)]
    ]);
    return aggregateTicker(data.sources, market.symbol, data.unavailable);
  });
}

export async function getOrderBook(market, depth = 20) {
  return await cached("book:" + market.symbol + ":" + depth, 3000, async () => {
    const data = await collectProviders([
      ["coinbase", () => coinbaseOrderBook(market, depth)],
      ["kraken", () => krakenOrderBook(market, depth)]
    ]);
    return summariseBooks(data.sources, market.symbol, data.unavailable);
  });
}

export async function getLiquidity(market, side, notionalUsd, depth = 50) {
  const book = await getOrderBook(market, depth);
  return estimateLiquidity(book.books, market.symbol, side, notionalUsd, book.unavailable);
}

export async function getHistory(market, granularity = 3600, limit = 48) {
  const candles = await cached(
    "history:" + market.symbol + ":" + granularity + ":" + limit,
    30000, () => coinbaseHistory(market, granularity, limit)
  );
  return {
    symbol: market.symbol, provider: "coinbase", granularitySeconds: granularity,
    count: candles.length, candles,
    disclaimer: "Historical exchange candles; incomplete periods or gaps are not filled with synthetic data."
  };
}

export async function getIntelligence(market) {
  const [price, history] = await Promise.all([
    getPrice(market), getHistory(market, 3600, 48)
  ]);
  const metrics = analyseMarket(price, history.candles, 3600);
  return metrics;
}
