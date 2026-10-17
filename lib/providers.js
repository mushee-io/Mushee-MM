const TIMEOUT_MS = 5500;

export class ProviderError extends Error {
  constructor(provider, reason) {
    super(provider + ": " + reason);
    this.provider = provider;
    this.name = "ProviderError";
  }
}

function finitePositive(value) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

async function requestJson(url, provider, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Mushee-Market-Data/0.1" },
      signal: controller.signal
    });
    if (!response.ok) throw new ProviderError(provider, "HTTP " + response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(provider, error?.name === "AbortError" ? "timeout" : "network or invalid JSON");
  } finally {
    clearTimeout(timer);
  }
}

function parseLevels(rows, limit, reverse = false) {
  if (!Array.isArray(rows)) return [];
  const levels = rows.map((row) => ({
    price: finitePositive(row?.[0]),
    size: finitePositive(row?.[1])
  })).filter((row) => row.price !== null && row.size !== null);
  levels.sort((a, b) => reverse ? a.price - b.price : b.price - a.price);
  return levels.slice(0, limit);
}

function krakenPayload(data, provider) {
  if (Array.isArray(data?.error) && data.error.length) {
    throw new ProviderError(provider, "upstream reported an error");
  }
  const payload = data?.result && Object.values(data.result)[0];
  if (!payload) throw new ProviderError(provider, "missing result");
  return payload;
}

export async function coinbaseTicker(market) {
  const data = await requestJson(
    "https://api.exchange.coinbase.com/products/" + market.coinbase + "/ticker",
    "coinbase"
  );
  const last = finitePositive(data.price);
  const bid = finitePositive(data.bid);
  const ask = finitePositive(data.ask);
  if (!last) throw new ProviderError("coinbase", "invalid ticker");
  return {
    provider: "coinbase", symbol: market.symbol, last, bid, ask,
    sourceTime: typeof data.time === "string" ? data.time : null,
    receivedAt: new Date().toISOString()
  };
}

export async function krakenTicker(market) {
  const data = await requestJson(
    "https://api.kraken.com/0/public/Ticker?pair=" + market.kraken, "kraken"
  );
  const item = krakenPayload(data, "kraken");
  const last = finitePositive(item.c?.[0]);
  if (!last) throw new ProviderError("kraken", "invalid ticker");
  return {
    provider: "kraken", symbol: market.symbol,
    last, bid: finitePositive(item.b?.[0]), ask: finitePositive(item.a?.[0]),
    sourceTime: null, receivedAt: new Date().toISOString()
  };
}

export async function coinbaseOrderBook(market, depth) {
  const data = await requestJson(
    "https://api.exchange.coinbase.com/products/" + market.coinbase + "/book?level=2",
    "coinbase"
  );
  const bids = parseLevels(data.bids, depth);
  const asks = parseLevels(data.asks, depth, true);
  if (!bids.length || !asks.length) throw new ProviderError("coinbase", "empty book");
  return {
    provider: "coinbase", symbol: market.symbol, bids, asks,
    receivedAt: new Date().toISOString(), sourceSequence: data.sequence ?? null
  };
}

export async function krakenOrderBook(market, depth) {
  const data = await requestJson(
    "https://api.kraken.com/0/public/Depth?pair=" + market.kraken + "&count=" + depth,
    "kraken"
  );
  const item = krakenPayload(data, "kraken");
  const bids = parseLevels(item.bids, depth);
  const asks = parseLevels(item.asks, depth, true);
  if (!bids.length || !asks.length) throw new ProviderError("kraken", "empty book");
  return {
    provider: "kraken", symbol: market.symbol, bids, asks,
    receivedAt: new Date().toISOString(), sourceSequence: null
  };
}

export async function coinbaseHistory(market, granularity, limit) {
  const end = Date.now();
  const start = end - granularity * limit * 1000;
  const url = "https://api.exchange.coinbase.com/products/" + market.coinbase +
    "/candles?granularity=" + granularity +
    "&start=" + encodeURIComponent(new Date(start).toISOString()) +
    "&end=" + encodeURIComponent(new Date(end).toISOString());
  const data = await requestJson(url, "coinbase");
  if (!Array.isArray(data)) throw new ProviderError("coinbase", "invalid candles");
  return data.filter((row) => Array.isArray(row) && row.length >= 6 &&
    row.slice(0, 6).every((item) => Number.isFinite(Number(item))) &&
    Number(row[4]) > 0
  ).map((row) => ({
    time: new Date(Number(row[0]) * 1000).toISOString(),
    open: Number(row[3]), high: Number(row[2]), low: Number(row[1]),
    close: Number(row[4]), volume: Number(row[5])
  })).sort((a, b) => a.time.localeCompare(b.time)).slice(-limit);
}

export async function collectProviders(jobs) {
  const settled = await Promise.allSettled(
    jobs.map(async ([name, job]) => await job())
  );
  const sources = [];
  const unavailable = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") sources.push(result.value);
    else unavailable.push({ provider: jobs[index][0], error: result.reason instanceof ProviderError
      ? result.reason.message : "unavailable" });
  });
  return { sources, unavailable };
}
