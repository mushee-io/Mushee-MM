import { authorise, presentedApiKey } from "../lib/auth.js";
import { recentTicks, hasDatabase } from "../lib/storage.js";
import { listMarkets, resolveMarket, boundedNumber } from "../lib/catalog.js";
import { getPrice, getOrderBook, getLiquidity, getHistory, getIntelligence, getExecutionIntelligence } from "../lib/market.js";
import { generateCommentary } from "../lib/ai.js";
import { cached } from "../lib/cache.js";

const STARTED = new Date().toISOString();

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}

function cors(req, res) {
  const origin = req.headers.origin;
  const keyEnabled = Boolean(process.env.API_KEY || process.env.DATABASE_URL);
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!keyEnabled) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key, Authorization, Content-Type");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/v1/health") {
    return send(res, 200, {
      service: "Mushee Market Data Network", status: "running", version: "0.3.0",
      startedAt: STARTED, upstreamChecked: false,
      note: "Health confirms the API process is running, not upstream availability."
    });
  }
  if (path === "/api/v1/markets") {
    return send(res, 200, { markets: listMarkets(), assetClasses: ["crypto-spot"],
      note: "Equities, FX, commodities and RWA data require authorised suppliers and additional integrations." });
  }

  try {
    const scope = path === "/api/v1/price" ? "price" :
      ["/api/v1/orderbook","/api/v1/liquidity","/api/v1/execution-intelligence"].includes(path) ? "depth" :
      ["/api/v1/history","/api/v1/ticks"].includes(path) ? "history" :
      path === "/api/v1/intelligence" ? "intelligence" : null;
    const permission = await authorise(presentedApiKey(req.headers),{scope});
    if (!permission.ok) return send(res, permission.code, {error:permission.error});
  } catch {
    return send(res,503,{error:"AUTH_BACKEND_UNAVAILABLE",
      message:"Credential verification or usage metering unavailable."});
  }

  const endpoints = new Set([
    "/api/v1/price", "/api/v1/orderbook", "/api/v1/liquidity",
    "/api/v1/history", "/api/v1/intelligence", "/api/v1/ticks", "/api/v1/execution-intelligence"
  ]);
  if (!endpoints.has(path)) {
    return send(res, 404, { error: "NOT_FOUND", endpoints: [
      "/api/v1/health", "/api/v1/markets", ...endpoints
    ] });
  }
  const market = resolveMarket(url.searchParams.get("symbol"));
  if (!market) return send(res, 400, {
    error: "INVALID_SYMBOL", message: "Use BTC-USD, ETH-USD or SOL-USD."
  });

  try {
    if (path === "/api/v1/price") {
      return send(res, 200, await getPrice(market));
    }
    if (path === "/api/v1/orderbook") {
      const depth = boundedNumber(url.searchParams.get("depth"), 20, 1, 50);
      if (depth === null || !Number.isInteger(depth)) return send(res, 400, { error: "INVALID_DEPTH" });
      return send(res, 200, await getOrderBook(market, depth));
    }
    if (path === "/api/v1/liquidity") {
      const side = url.searchParams.get("side") || "buy";
      const notional = boundedNumber(url.searchParams.get("notional"), 10000, 1, 1000000);
      const depth = boundedNumber(url.searchParams.get("depth"), 50, 1, 50);
      if (!["buy", "sell"].includes(side)) return send(res, 400, { error: "INVALID_SIDE" });
      if (notional === null) return send(res, 400, { error: "INVALID_NOTIONAL" });
      if (depth === null || !Number.isInteger(depth)) return send(res, 400, { error: "INVALID_DEPTH" });
      return send(res, 200, await getLiquidity(market, side, notional, depth));
    }
    if (path === "/api/v1/execution-intelligence") {
      const side = url.searchParams.get("side") || "buy";
      const notional = boundedNumber(url.searchParams.get("notional"),100000,1,1000000);
      const depth = boundedNumber(url.searchParams.get("depth"),50,1,50);
      if (!["buy","sell"].includes(side)) return send(res,400,{error:"INVALID_SIDE"});
      if (notional === null) return send(res,400,{error:"INVALID_NOTIONAL"});
      if (depth === null || !Number.isInteger(depth)) return send(res,400,{error:"INVALID_DEPTH"});
      return send(res,200,await getExecutionIntelligence(market,side,notional,depth));
    }
    if (path === "/api/v1/ticks") {
      const limit = boundedNumber(url.searchParams.get("limit"), 100, 1, 500);
      if (limit === null || !Number.isInteger(limit)) return send(res,400,{error:"INVALID_LIMIT"});
      if (!hasDatabase()) return send(res,503,{error:"HISTORY_NOT_CONFIGURED",
        message:"Persistent tick history requires DATABASE_URL and a running streaming collector."});
      const ticks = await recentTicks(market.symbol,limit);
      return send(res,200,{
        symbol:market.symbol,count:ticks.length,ticks,
        source:"Recorded exchange WebSocket ticker events",
        note:"Historical storage contains only ticks captured while the collector was connected."
      });
    }
    if (path === "/api/v1/history") {
      const granularity = boundedNumber(url.searchParams.get("granularity"), 3600, 60, 86400);
      const limit = boundedNumber(url.searchParams.get("limit"), 48, 2, 200);
      if (![60, 300, 900, 3600, 21600, 86400].includes(granularity) ||
        limit === null || !Number.isInteger(limit)) {
        return send(res, 400, { error: "INVALID_HISTORY_PARAMS" });
      }
      return send(res, 200, await getHistory(market, granularity, limit));
    }
    if (path === "/api/v1/intelligence") {
      const metrics = await getIntelligence(market);
      const commentary = await cached("commentary:" + market.symbol, 15000,
        () => generateCommentary(metrics));
      return send(res, 200, { ...metrics, intelligence: commentary });
    }
  } catch {
    return send(res, 503, {
      error: "UPSTREAM_UNAVAILABLE",
      message: "Required exchange market data is temporarily unavailable.",
      observedAt: new Date().toISOString()
    });
  }
}
