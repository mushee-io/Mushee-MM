export const MARKETS = Object.freeze({
  "BTC-USD": { base: "BTC", quote: "USD", coinbase: "BTC-USD", kraken: "XBTUSD" },
  "ETH-USD": { base: "ETH", quote: "USD", coinbase: "ETH-USD", kraken: "ETHUSD" },
  "SOL-USD": { base: "SOL", quote: "USD", coinbase: "SOL-USD", kraken: "SOLUSD" }
});

export function resolveMarket(symbol) {
  if (typeof symbol !== "string") return null;
  const key = symbol.trim().toUpperCase().replace("/", "-");
  if (!Object.hasOwn(MARKETS, key)) return null;
  return { symbol: key, ...MARKETS[key] };
}

export function listMarkets() {
  return Object.entries(MARKETS).map(([symbol, market]) => ({
    symbol, base: market.base, quote: market.quote, providers: ["coinbase", "kraken"]
  }));
}

export function boundedNumber(value, fallback, min, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
