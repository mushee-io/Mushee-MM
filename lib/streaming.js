import { resolveMarket } from "./catalog.js";

const COINBASE_SYMBOLS = new Set(["BTC-USD","ETH-USD","SOL-USD"]);
const KRAKEN_MAP = new Map([
  ["BTC/USD","BTC-USD"],["ETH/USD","ETH-USD"],["SOL/USD","SOL-USD"]
]);

function positive(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function isoTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function coinbaseSubscribe() {
  return { type:"subscribe", product_ids:[...COINBASE_SYMBOLS], channels:["ticker","heartbeat"] };
}
export function krakenSubscribe() {
  return { method:"subscribe", params:{
    channel:"ticker", symbol:[...KRAKEN_MAP.keys()], snapshot:true, event_trigger:"trades"
  }};
}

export function normaliseCoinbase(message) {
  if (message?.type !== "ticker" || !COINBASE_SYMBOLS.has(message.product_id)) return [];
  const last = positive(message.price);
  if (last === null) return [];
  return [{
    provider:"coinbase", symbol:message.product_id, last,
    bid:positive(message.best_bid), ask:positive(message.best_ask),
    sourceTime:isoTime(message.time), receivedAt:new Date().toISOString(),
    sequence:Number.isSafeInteger(Number(message.sequence)) ? Number(message.sequence) : null
  }];
}

export function normaliseKraken(message) {
  if (message?.channel !== "ticker" || !Array.isArray(message.data)) return [];
  return message.data.flatMap((item) => {
    const symbol = KRAKEN_MAP.get(item?.symbol);
    const last = positive(item?.last);
    if (!symbol || last === null) return [];
    return [{
      provider:"kraken", symbol, last,
      bid:positive(item.bid), ask:positive(item.ask),
      sourceTime:isoTime(item.timestamp), receivedAt:new Date().toISOString(),
      sequence:null
    }];
  });
}

/** An unknown symbol is rejected, not silently broadcast. */
export function parseSubscription(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || data.type !== "subscribe" || !Array.isArray(data.symbols) ||
      data.symbols.length < 1 || data.symbols.length > 3) return null;
  const symbols = new Set();
  for (const candidate of data.symbols) {
    const market = resolveMarket(candidate);
    if (!market) return null;
    symbols.add(market.symbol);
  }
  return [...symbols];
}
