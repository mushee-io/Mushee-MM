/**
 * Mushee feed discovery metadata. A listed instrument is NOT a licensed or live feed.
 * Prices are never stored in this catalog.
 */
const RAW = {
  indices: [
    "SPX|S&P 500|USD","NDX|Nasdaq-100|USD","DJI|Dow Jones Industrial Average|USD",
    "RUT|Russell 2000|USD","VIX|CBOE Volatility Index|USD","FTSE100|FTSE 100|GBP",
    "DAX|DAX 40|EUR","CAC40|CAC 40|EUR","N225|Nikkei 225|JPY",
    "HSI|Hang Seng Index|HKD","STOXX50|EURO STOXX 50|EUR","ASX200|S&P/ASX 200|AUD"
  ],
  metals: [
    "XAUUSD|Gold Spot|USD","XAGUSD|Silver Spot|USD","XPTUSD|Platinum Spot|USD",
    "XPDUSD|Palladium Spot|USD","XAU-EUR|Gold Spot / EUR|EUR",
    "XAU-GBP|Gold Spot / GBP|GBP","XAG-EUR|Silver Spot / EUR|EUR","XCUUSD|Copper Reference|USD"
  ],
  crypto: [
    "BTC-USD|Bitcoin|USD","ETH-USD|Ethereum|USD","SOL-USD|Solana|USD",
    "XRP-USD|XRP|USD","BNB-USD|BNB|USD","ADA-USD|Cardano|USD",
    "DOGE-USD|Dogecoin|USD","AVAX-USD|Avalanche|USD","LINK-USD|Chainlink|USD",
    "DOT-USD|Polkadot|USD","LTC-USD|Litecoin|USD","BCH-USD|Bitcoin Cash|USD",
    "UNI-USD|Uniswap|USD","AAVE-USD|Aave|USD","SUI-USD|Sui|USD",
    "APT-USD|Aptos|USD","NEAR-USD|NEAR Protocol|USD","ATOM-USD|Cosmos|USD",
    "TRX-USD|TRON|USD","TON-USD|Toncoin|USD","XLM-USD|Stellar|USD",
    "ETC-USD|Ethereum Classic|USD"
  ],
  equities: [
    "AAPL|Apple Inc.|USD","NVDA|NVIDIA Corporation|USD","MSFT|Microsoft Corporation|USD",
    "GOOGL|Alphabet Inc. Class A|USD","AMZN|Amazon.com Inc.|USD",
    "META|Meta Platforms Inc.|USD","TSLA|Tesla Inc.|USD","NFLX|Netflix Inc.|USD",
    "AMD|Advanced Micro Devices|USD","INTC|Intel Corporation|USD",
    "JPM|JPMorgan Chase & Co.|USD","GS|Goldman Sachs Group|USD",
    "BAC|Bank of America|USD","V|Visa Inc.|USD","MA|Mastercard Inc.|USD",
    "KO|The Coca-Cola Company|USD","PEP|PepsiCo Inc.|USD",
    "WMT|Walmart Inc.|USD","COST|Costco Wholesale|USD",
    "DIS|The Walt Disney Company|USD","BA|Boeing Co.|USD",
    "XOM|Exxon Mobil Corporation|USD","CVX|Chevron Corporation|USD",
    "PFE|Pfizer Inc.|USD","UNH|UnitedHealth Group|USD",
    "PLTR|Palantir Technologies|USD","COIN|Coinbase Global|USD",
    "MSTR|Strategy Inc.|USD","UBER|Uber Technologies|USD","SHOP|Shopify Inc.|USD",
    "SHEL|Shell PLC (US ADR)|USD","BP|BP PLC (US ADR)|USD"
  ],
  fx: [
    "EUR-USD|Euro / US Dollar|USD","GBP-USD|British Pound / US Dollar|USD",
    "USD-JPY|US Dollar / Japanese Yen|JPY","USD-CHF|US Dollar / Swiss Franc|CHF",
    "AUD-USD|Australian Dollar / US Dollar|USD","USD-CAD|US Dollar / Canadian Dollar|CAD",
    "NZD-USD|New Zealand Dollar / US Dollar|USD","EUR-GBP|Euro / British Pound|GBP",
    "EUR-JPY|Euro / Japanese Yen|JPY","GBP-JPY|British Pound / Japanese Yen|JPY",
    "USD-CNY|US Dollar / Chinese Yuan|CNY","USD-INR|US Dollar / Indian Rupee|INR",
    "USD-NGN|US Dollar / Nigerian Naira|NGN","USD-KRW|US Dollar / South Korean Won|KRW",
    "USD-SGD|US Dollar / Singapore Dollar|SGD","USD-HKD|US Dollar / Hong Kong Dollar|HKD",
    "USD-ZAR|US Dollar / South African Rand|ZAR","USD-BRL|US Dollar / Brazilian Real|BRL",
    "USD-MXN|US Dollar / Mexican Peso|MXN","EUR-CHF|Euro / Swiss Franc|CHF"
  ],
  commodities: [
    "WTI|WTI Crude Oil|USD","BRENT|Brent Crude Oil|USD","NATGAS|Natural Gas|USD",
    "RBOB|RBOB Gasoline|USD","HEATOIL|Heating Oil|USD",
    "COPPER|Copper|USD","ALUMINIUM|Aluminium|USD","NICKEL|Nickel|USD",
    "ZINC|Zinc|USD","CORN|Corn|USD","WHEAT|Wheat|USD",
    "SOYBEAN|Soybeans|USD","COFFEE|Coffee|USD","SUGAR|Sugar|USD",
    "COCOA|Cocoa|USD","COTTON|Cotton|USD","LIVECATTLE|Live Cattle|USD",
    "LEANHOGS|Lean Hogs|USD","RICE|Rough Rice|USD","URANIUM|Uranium Reference|USD"
  ],
  rates: [
    "US10Y|US Treasury 10Y Yield|USD","US2Y|US Treasury 2Y Yield|USD",
    "US30Y|US Treasury 30Y Yield|USD","US3M|US Treasury 3M Yield|USD",
    "SOFR|Secured Overnight Financing Rate|USD","EFFR|Effective Federal Funds Rate|USD",
    "FEDFUNDS|US Federal Funds Target Rate|USD","UK10Y|UK Gilt 10Y Yield|GBP",
    "UK2Y|UK Gilt 2Y Yield|GBP","BOEBR|Bank of England Bank Rate|GBP",
    "DE10Y|German Bund 10Y Yield|EUR","ECBDFR|ECB Deposit Facility Rate|EUR",
    "JP10Y|Japan Government Bond 10Y Yield|JPY","JPYON|Japan Overnight Rate|JPY"
  ]
};
export const CATEGORIES = Object.freeze([
  {slug:"all",name:"All feeds",description:"Every instrument in the Mushee directory"},
  {slug:"indices",name:"Indices",description:"Broad market and volatility indices"},
  {slug:"metals",name:"Precious metals",description:"Spot and reference metals"},
  {slug:"crypto",name:"Crypto",description:"Digital assets and crypto spot markets"},
  {slug:"equities",name:"Equities",description:"Public company shares and ADRs"},
  {slug:"fx",name:"FX",description:"Foreign exchange currency pairs"},
  {slug:"commodities",name:"Commodities",description:"Energy, agriculture and industrial metals"},
  {slug:"rates",name:"Interest rates & yields",description:"Sovereign yields and benchmark rates"}
]);
const CLASSES={indices:"index",metals:"metal",crypto:"crypto",equities:"equity",
  fx:"fx",commodities:"commodity",rates:"rate"};
const HOURS={indices:"Exchange hours",metals:"Market dependent",crypto:"24/7",
  equities:"Exchange hours",fx:"Weekday sessions",commodities:"Market dependent",
  rates:"Scheduled / market"};
const CONNECTED=new Set(["BTC-USD","ETH-USD","SOL-USD"]);
export const ALL_FEEDS=Object.freeze(Object.entries(RAW).flatMap(([category,records])=>
  records.map(raw=>{
    const [symbol,name,quoteCurrency]=raw.split("|");
    const connected=category==="crypto" && CONNECTED.has(symbol);
    return Object.freeze({
      id:category+":"+symbol,category,assetClass:CLASSES[category],symbol,name,quoteCurrency,
      instrument:category==="rates"?"Rate":category==="indices"?"Index":
        category==="equities"?"Equity":category==="fx"?"Currency pair":
        category==="crypto"?"Spot":category==="metals"?"Metal reference":"Commodity reference",
      session:HOURS[category],
      status:connected?"connected":"planned",
      integration:connected?"public-spot-exchanges":"requires-licensed-data",
      sources:connected?["Coinbase Exchange","Kraken"]:[],
      methodology:connected?"Median of available exchange last prices":
        "No active data source connected",
      description:connected?
        "Price support coded for public exchange endpoints. Live availability is checked separately.":
        "Discovery-only instrument. Real prices require an authenticated, licensed source."
    });
  })
));
const IDS=new Map(ALL_FEEDS.map(feed=>[feed.id,feed]));
if(IDS.size!==ALL_FEEDS.length)throw Error("Duplicate instrument identifiers");
export function getFeed(id){return typeof id==="string"?IDS.get(id)||null:null;}
export function explorerCategories(){
  return CATEGORIES.map(c=>{
    const entries=c.slug==="all"?ALL_FEEDS:ALL_FEEDS.filter(f=>f.category===c.slug);
    return {...c,count:entries.length,connectedCount:entries.filter(f=>f.status==="connected").length};
  });
}
export function queryFeeds({category="all",status="all",q="",sort="name",limit=25,offset=0}={}){
  if(!CATEGORIES.some(c=>c.slug===category))throw new RangeError("INVALID_CATEGORY");
  if(!["all","connected","planned"].includes(status))throw new RangeError("INVALID_STATUS");
  if(!["name","symbol","category"].includes(sort))throw new RangeError("INVALID_SORT");
  if(typeof q!=="string"||q.length>120)throw new RangeError("INVALID_SEARCH");
  if(!Number.isInteger(limit)||limit<1||limit>100||
     !Number.isInteger(offset)||offset<0||offset>10000)throw new RangeError("INVALID_PAGINATION");
  const needle=q.toLowerCase().trim();
  const matching=ALL_FEEDS.filter(f=>
    (category==="all"||f.category===category)&&
    (status==="all"||f.status===status)&&
    (!needle||(f.symbol+" "+f.name+" "+f.category+" "+f.quoteCurrency).toLowerCase().includes(needle))
  ).sort((a,b)=>a[sort].localeCompare(b[sort])||a.symbol.localeCompare(b.symbol));
  return {total:matching.length,offset,limit,hasMore:offset+limit<matching.length,
    feeds:matching.slice(offset,offset+limit)};
}
