/**
 * Zero-dependency API client for Mushee MM REST endpoints.
 * API tokens are server-side secrets; do not put them in public JS bundles.
 */
export class MusheeClient {
  constructor({baseURL,apiKey,fetchImpl=fetch}) {
    if(typeof baseURL!=="string" || (!/^https:\/\//.test(baseURL) &&
       !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(baseURL))) {
      throw Error("HTTPS baseURL or local development URL required");
    }
    if(typeof fetchImpl!=="function") throw Error("fetch function required");
    this.baseURL=baseURL.replace(/\/+$/,"");
    this.apiKey=apiKey||null;
    this.fetchImpl=fetchImpl;
  }
  async get(path,params={}) {
    const url=new URL(this.baseURL+path);
    for(const [key,value] of Object.entries(params)) {
      if(value!==null&&value!==undefined)url.searchParams.set(key,String(value));
    }
    const response=await this.fetchImpl(url,{
      method:"GET",headers:{
        Accept:"application/json",...(this.apiKey?{"x-api-key":this.apiKey}:{})
      }
    });
    const body=await response.json();
    if(!response.ok) {
      const err=new Error(body.message||body.error||"Mushee API error");
      err.status=response.status;err.code=body.error||"UPSTREAM_ERROR";
      throw err;
    }
    return body;
  }
  markets(){return this.get("/api/v1/markets");}
  price(symbol){return this.get("/api/v1/price",{symbol});}
  depth(symbol,depth=20){return this.get("/api/v1/orderbook",{symbol,depth});}
  execution(symbol,{side="buy",notional=100000,depth=50}={}) {
    return this.get("/api/v1/execution-intelligence",{symbol,side,notional,depth});
  }
  history(symbol,limit=48){return this.get("/api/v1/history",{symbol,limit});}
  ticks(symbol,limit=100){return this.get("/api/v1/ticks",{symbol,limit});}
  intelligence(symbol){return this.get("/api/v1/intelligence",{symbol});}
  volatility(symbol){return this.get("/api/v1/models/volatility",{symbol});}
  oracle(symbol){return this.get("/api/v1/oracle/consensus",{symbol});}
  usage(days=30){return this.get("/api/v1/account/usage",{days});}
}
