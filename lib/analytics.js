export function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 8) {
  return Number(value.toFixed(digits));
}

export function aggregateTicker(tickers, symbol, unavailable = []) {
  if (!tickers.length) throw new Error("No market-data sources available");
  const reference = median(tickers.map((ticker) => ticker.last));
  const deviations = tickers.map((ticker) =>
    Math.abs(ticker.last - reference) / reference * 10000);
  return {
    symbol,
    price: round(reference),
    quote: "USD",
    method: "median-of-available-source-last-prices",
    sourceCount: tickers.length,
    status: tickers.length >= 2 ? "normal" : "degraded",
    maxSourceDeviationBps: round(Math.max(...deviations), 2),
    divergenceAlert: tickers.length >= 2 && Math.max(...deviations) > 50,
    sources: tickers,
    unavailable,
    observedAt: new Date().toISOString(),
    disclaimer: "Indicative spot prices; not a guaranteed executable quote."
  };
}

export function summariseBooks(books, symbol, unavailable = []) {
  if (!books.length) throw new Error("No market-data sources available");
  const bestBid = Math.max(...books.map((b) => b.bids[0].price));
  const bestAsk = Math.min(...books.map((b) => b.asks[0].price));
  return {
    symbol,
    bestBid, bestAsk,
    crossed: bestBid >= bestAsk,
    referenceMid: round(median(books.map((b) =>
      (b.bids[0].price + b.asks[0].price) / 2))),
    sourceCount: books.length,
    status: books.length >= 2 ? "normal" : "degraded",
    books, unavailable, observedAt: new Date().toISOString(),
    disclaimer: "Snapshot only. Exchange trading fees, permissions, outages and network latency are not included."
  };
}

export function estimateLiquidity(books, symbol, side, notionalUsd, unavailable = []) {
  if (!books.length) throw new Error("No market-data sources available");
  const referenceMid = median(books.map((book) =>
    (book.bids[0].price + book.asks[0].price) / 2));
  if (!Number.isFinite(referenceMid) || referenceMid <= 0) throw new Error("Invalid order books");
  const levels = books.flatMap((book) =>
    (side === "buy" ? book.asks : book.bids).map((level) =>
      ({ ...level, provider: book.provider }))
  ).sort((a, b) => side === "buy" ? a.price - b.price : b.price - a.price);

  let remaining = side === "buy" ? notionalUsd : notionalUsd / referenceMid;
  let filledBase = 0;
  let filledUsd = 0;
  const byProvider = {};

  for (const level of levels) {
    if (remaining <= 1e-10) break;
    const quantity = side === "buy"
      ? Math.min(level.size, remaining / level.price)
      : Math.min(level.size, remaining);
    const dollars = quantity * level.price;
    filledBase += quantity;
    filledUsd += dollars;
    remaining -= side === "buy" ? dollars : quantity;
    byProvider[level.provider] = (byProvider[level.provider] || 0) + dollars;
  }
  const vwap = filledBase > 0 ? filledUsd / filledBase : null;
  const targetBase = side === "sell" ? notionalUsd / referenceMid : null;
  const fillRatio = side === "buy"
    ? filledUsd / notionalUsd
    : filledBase / targetBase;
  const slippageBps = vwap === null ? null :
    (side === "buy" ? 1 : -1) * (vwap / referenceMid - 1) * 10000;

  return {
    symbol, side, requestedNotionalUsd: notionalUsd,
    referenceMid: round(referenceMid),
    fillRatio: round(Math.max(0, Math.min(1, fillRatio)), 6),
    filledBase: round(filledBase), filledNotionalUsd: round(filledUsd, 2),
    vwap: vwap === null ? null : round(vwap),
    estimatedSlippageBps: slippageBps === null ? null : round(slippageBps, 2),
    unfilled: fillRatio < 0.999999,
    providerNotionalUsd: Object.fromEntries(Object.entries(byProvider)
      .map(([name, value]) => [name, round(value, 2)])),
    sourceCount: books.length,
    status: books.length >= 2 ? "normal" : "degraded",
    unavailable, observedAt: new Date().toISOString(),
    disclaimer: "Theoretical multi-venue order-book simulation only. Not executable, predictive or guaranteed; excludes fees, market impact from latency, slippage during execution, inventory constraints and exchange account access."
  };
}

export function analyseMarket(ticker, candles, granularity) {
  const closes = candles.map((c) => c.close).filter((x) => x > 0);
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  const variance = returns.length >= 2 ? returns.reduce((a, b) =>
    a + (b - mean) ** 2, 0) / (returns.length - 1) : null;
  const annualisedVol = variance === null ? null :
    Math.sqrt(variance) * Math.sqrt(365 * 24 * 3600 / granularity) * 100;
  const change = closes.length > 1 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null;
  const flags = [];
  if (ticker.divergenceAlert) flags.push("SOURCE_PRICE_DIVERGENCE");
  if (ticker.sourceCount < 2) flags.push("SINGLE_DATA_SOURCE");
  if (annualisedVol !== null && annualisedVol > 100) flags.push("HIGH_HISTORICAL_VOLATILITY");

  return {
    symbol: ticker.symbol, spotPrice: ticker.price, sourceCount: ticker.sourceCount,
    observationCount: closes.length, granularitySeconds: granularity,
    periodChangePct: change === null ? null : round(change, 3),
    annualisedRealisedVolatilityPct: annualisedVol === null ? null : round(annualisedVol, 3),
    maxSourceDeviationBps: ticker.maxSourceDeviationBps,
    flags, calculation: "observed log-return sample stdev, annualised assuming continuous 24/7 markets",
    source: "live ticker sources and historical Coinbase spot candles",
    disclaimer: "Descriptive historical analytics, not a forecast or investment recommendation."
  };
}
