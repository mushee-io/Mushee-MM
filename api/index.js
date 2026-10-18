import { authorise, presentedApiKey } from "../lib/auth.js";
import { recentTicks, hasDatabase, minuteMedianPriceSeries, selfUsage } from "../lib/storage.js";
import { submitOracleReport, readOracleConsensus } from "../lib/oracle-storage.js";
import { AttestationError } from "../lib/oracle.js";
import { evaluateVolatility } from "../lib/volatility.js";
import { evaluateTrainedVolatility } from "../lib/ml-volatility.js";
import { previewBill, listBillingDrafts } from "../lib/billing.js";
import { configuredAssets, isLicensedEntitled, getLicensedQuote } from "../lib/licensed.js";
import { listMarkets, resolveMarket, boundedNumber } from "../lib/catalog.js";
import { getPrice, getOrderBook, getLiquidity, getHistory, getIntelligence, getExecutionIntelligence } from "../lib/market.js";
import { generateCommentary } from "../lib/ai.js";
import { cached } from "../lib/cache.js";

const STARTED = new Date().toISOString();

async function jsonBody(req,maxBytes=8192) {
  // Serverless platforms may supply a pre-parsed object; local Node streams require reading.
  if(req.body !== undefined && req.body !== null) {
    if(typeof req.body === "object") {
      if(Buffer.byteLength(JSON.stringify(req.body))>maxBytes) throw Error("BODY_TOO_LARGE");
      return req.body;
    }
    if(typeof req.body === "string" && Buffer.byteLength(req.body)<=maxBytes) return JSON.parse(req.body);
    throw Error("INVALID_JSON_BODY");
  }
  let total=0;
  const chunks=[];
  for await (const chunk of req) {
    total+=chunk.length;
    if(total>maxBytes) throw Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key, Authorization, Content-Type");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method==="GET" && path === "/api/v1/health") {
    return send(res, 200, {
      service: "Mushee Market Data Network", status: "running", version: "0.6.0",
      startedAt: STARTED, upstreamChecked: false,
      note: "Health confirms the API process is running, not upstream availability."
    });
  }
  if (req.method==="GET" && path === "/api/v1/markets") {
    return send(res, 200, { markets: listMarkets(), assetClasses: ["crypto-spot"],
      note: "Equities, FX, commodities and RWA data require authorised suppliers and additional integrations." });
  }

  try {
    const scope = ["/api/v1/price","/api/v1/oracle/consensus","/api/v1/licensed/quote","/api/v1/licensed/catalog"].includes(path) ? "price" :
      ["/api/v1/orderbook","/api/v1/liquidity","/api/v1/execution-intelligence"].includes(path) ? "depth" :
      ["/api/v1/history","/api/v1/ticks"].includes(path) ? "history" :
      ["/api/v1/intelligence","/api/v1/models/volatility","/api/v1/models/volatility-ml"].includes(path) ? "intelligence" :
      ["/api/v1/account/usage","/api/v1/account/billing-preview","/api/v1/account/billing-drafts"].includes(path) ? "account" :
      path === "/api/v1/oracle/reports" && req.method === "POST" ? "publish" : null;
    const permission = await authorise(presentedApiKey(req.headers),{scope});
    if (permission.ok) req.authorisedTenant = permission.tenantId || null;
    if (!permission.ok) return send(res, permission.code, {error:permission.error});
  } catch {
    return send(res,503,{error:"AUTH_BACKEND_UNAVAILABLE",
      message:"Credential verification or usage metering unavailable."});
  }

  const endpoints = new Set([
    "/api/v1/price", "/api/v1/orderbook", "/api/v1/liquidity",
    "/api/v1/history", "/api/v1/intelligence", "/api/v1/ticks", "/api/v1/execution-intelligence",
    "/api/v1/models/volatility", "/api/v1/oracle/consensus", "/api/v1/account/usage",
    "/api/v1/oracle/reports", "/api/v1/licensed/quote", "/api/v1/licensed/catalog",
    "/api/v1/models/volatility-ml", "/api/v1/account/billing-preview", "/api/v1/account/billing-drafts"
  ]);
  if (!endpoints.has(path)) {
    return send(res, 404, { error: "NOT_FOUND", endpoints: [
      "/api/v1/health", "/api/v1/markets", ...endpoints
    ] });
  }
  if(path === "/api/v1/oracle/reports") {
    if(req.method!=="POST") return send(res,405,{error:"METHOD_NOT_ALLOWED"});
    if(!hasDatabase()) return send(res,503,{error:"ORACLE_DATABASE_REQUIRED"});
    try {
      const body=await jsonBody(req);
      const saved=await submitOracleReport(body);
      return send(res,201,saved);
    } catch(e) {
      if(e instanceof AttestationError) return send(res,
        e.code==="REPLAYED_SEQUENCE"?409:400,{error:e.code,message:e.message});
      if(["BODY_TOO_LARGE","INVALID_JSON_BODY","SyntaxError"].includes(e?.message) || e instanceof SyntaxError) {
        return send(res,400,{error:"INVALID_JSON_BODY"});
      }
      return send(res,503,{error:"ORACLE_WRITE_UNAVAILABLE"});
    }
  }
  if(req.method!=="GET") return send(res,405,{error:"METHOD_NOT_ALLOWED"});
  if(path === "/api/v1/licensed/catalog") {
    if(!hasDatabase() || !req.authorisedTenant) return send(res,403,{error:"TENANT_ACCOUNT_REQUIRED"});
    try {return send(res,200,{assets:configuredAssets(),kind:"operator-configured-catalog",
      warning:"Listing does not itself confirm commercial rights or tenant entitlements."});}
    catch {return send(res,503,{error:"LICENSED_VENDOR_CONFIGURATION_INVALID"});}
  }
  if(path === "/api/v1/licensed/quote") {
    if(!hasDatabase() || !req.authorisedTenant) return send(res,403,{error:"TENANT_ACCOUNT_REQUIRED"});
    const assetClass=url.searchParams.get("assetClass");
    const symbol=url.searchParams.get("symbol");
    if(typeof assetClass!=="string" || typeof symbol!=="string" ||
      !/^[A-Za-z]+$/.test(assetClass) || !/^[A-Z0-9][A-Z0-9.:/_-]{0,39}$/.test(symbol)) {
      return send(res,400,{error:"INVALID_ASSET_REQUEST"});
    }
    try {
      if(!(await isLicensedEntitled(req.authorisedTenant,assetClass,symbol))) {
        return send(res,403,{error:"ASSET_NOT_ENTITLED"});
      }
      const response=await getLicensedQuote(assetClass,symbol);
      return send(res,response.status,response.data||{error:response.error});
    } catch {return send(res,503,{error:"LICENSED_PROVIDER_UNAVAILABLE"});}
  }
  if(path === "/api/v1/account/billing-preview" || path === "/api/v1/account/billing-drafts") {
    if(!hasDatabase() || !req.authorisedTenant) return send(res,403,{error:"TENANT_ACCOUNT_REQUIRED"});
    if(path === "/api/v1/account/billing-drafts") {
      try{return send(res,200,await listBillingDrafts(req.authorisedTenant));}
      catch{return send(res,503,{error:"BILLING_DATABASE_UNAVAILABLE"});}
    }
    const month=url.searchParams.get("month");
    if(!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return send(res,400,{error:"INVALID_BILLING_MONTH"});
    try {return send(res,200,await previewBill(req.authorisedTenant,month));}
    catch(e) {
      if(e?.message==="BILLING_NOT_CONFIGURED")return send(res,409,{error:"BILLING_NOT_CONFIGURED"});
      return send(res,503,{error:"BILLING_DATABASE_UNAVAILABLE"});
    }
  }
  if(path === "/api/v1/account/usage") {
    if(!hasDatabase() || !req.authorisedTenant) return send(res,403,{error:"TENANT_ACCOUNT_REQUIRED"});
    const days=boundedNumber(url.searchParams.get("days"),30,1,90);
    if(days===null || !Number.isInteger(days)) return send(res,400,{error:"INVALID_DAYS"});
    try {return send(res,200,await selfUsage(req.authorisedTenant,days));}
    catch {return send(res,503,{error:"USAGE_DATABASE_UNAVAILABLE"});}
  }
  const market = resolveMarket(url.searchParams.get("symbol"));
  if (!market) return send(res, 400, {
    error: "INVALID_SYMBOL", message: "Use BTC-USD, ETH-USD or SOL-USD."
  });

  try {
    if (path === "/api/v1/oracle/consensus") {
      if(!hasDatabase()) return send(res,503,{error:"ORACLE_DATABASE_REQUIRED"});
      const result=await readOracleConsensus(market.symbol);
      return send(res,result.status==="ATTESTED"?200:409,{
        ...result,symbol:market.symbol
      });
    }
    if (path === "/api/v1/models/volatility-ml") {
      if(!hasDatabase())return send(res,503,{error:"MODEL_HISTORY_NOT_CONFIGURED"});
      const bars=await minuteMedianPriceSeries(market.symbol,24);
      try {return send(res,200,evaluateTrainedVolatility(bars));}
      catch(e) {
        if(["GAPPED_SERIES","INSUFFICIENT_HISTORY"].includes(e.message))return send(res,422,{
          error:e.message,availableMinutes:bars.length,
          message:"Real continuous one-minute observations are required for training and holdout evaluation."
        });
        throw e;
      }
    }
    if (path === "/api/v1/models/volatility") {
      if(!hasDatabase()) return send(res,503,{error:"MODEL_HISTORY_NOT_CONFIGURED"});
      const bars=await minuteMedianPriceSeries(market.symbol,24);
      try {return send(res,200,evaluateVolatility(bars));}
      catch(e) {
        if(["GAPPED_SERIES","INSUFFICIENT_HISTORY"].includes(e.message)) {
          return send(res,422,{error:e.message,availableMinutes:bars.length,
            message:"Collect continuous live market observations before running the backtest."});
        }
        throw e;
      }
    }
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
