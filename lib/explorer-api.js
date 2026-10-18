import { explorerCategories,getFeed,queryFeeds,ALL_FEEDS } from "./feed-directory.js";
import { getPrice } from "./market.js";
import { resolveMarket } from "./catalog.js";
import { cached } from "./cache.js";

function integerParam(raw,fallback,{min,max}) {
  if(raw===null)return fallback;
  if(!/^\d+$/.test(raw))throw new RangeError("INVALID_PAGINATION");
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError("INVALID_PAGINATION");
  return value;
}
export async function handleExplorer(url){
  const path=url.pathname.replace(/\/+$/,"");
  if(path==="/api/v1/explore/categories") {
    return {code:200,data:{
      categories:explorerCategories(),feedCount:ALL_FEEDS.length,
      note:"Directory coverage, not live market-data coverage. Counts are actual catalog entries."
    }};
  }
  if(path==="/api/v1/explore/feeds") {
    try {
      const page=queryFeeds({
        category:url.searchParams.get("category")||"all",
        status:url.searchParams.get("status")||"all",
        q:url.searchParams.get("q")||"",
        sort:url.searchParams.get("sort")||"name",
        limit:integerParam(url.searchParams.get("limit"),25,{min:1,max:100}),
        offset:integerParam(url.searchParams.get("offset"),0,{min:0,max:10000})
      });
      return {code:200,data:{...page,
        disclaimer:"Catalog listings do not imply active price availability, financial licensing, or institutional service guarantees."}};
    }catch(error){
      if(error instanceof RangeError)return {code:400,data:{error:error.message}};
      throw error;
    }
  }
  if(path==="/api/v1/explore/feed") {
    const id=url.searchParams.get("id");
    const feed=getFeed(id);
    if(!feed)return {code:404,data:{error:"FEED_NOT_FOUND"}};
    return {code:200,data:{feed,
      publicQuote:feed.status==="connected"?"/api/v1/explore/quotes":null,
      dataPolicy:feed.status==="connected"?
        "The quote is indicative public-venue spot data. Provider outages and licensing restrictions may apply.":
        "No price is currently published. This is a planned instrument only; requires an authorised data vendor."}};
  }
  if(path==="/api/v1/explore/quotes") {
    // Public sandbox: hardcoded to THREE allowlisted crypto pairs and one
    // cached computation every 20 sec / application instance.
    const quotes=await cached("explorer:public-crypto-prices-v1",20000,async()=>{
      const symbols=["BTC-USD","ETH-USD","SOL-USD"];
      const settled=await Promise.allSettled(symbols.map(symbol=>getPrice(resolveMarket(symbol))));
      return symbols.map((symbol,index)=>{
        const r=settled[index];
        if(r.status!=="fulfilled")return {symbol,status:"unavailable",price:null,
          sourceCount:0,observedAt:null};
        const price=r.value;
        return {
          symbol,status:price.status,price:price.price,quoteCurrency:"USD",
          sourceCount:price.sourceCount,observedAt:price.observedAt,
          divergenceAlert:price.divergenceAlert,
          method:price.method
        };
      });
    });
    return {code:200,data:{
      quotes,scope:"Three public crypto spot markets only",snapshotAt:new Date().toISOString(),
      disclaimer:"Indicative public-source data, not independently verifiable oracle consensus or executable orders."
    }};
  }
  return {code:404,data:{error:"NOT_FOUND"}};
}
