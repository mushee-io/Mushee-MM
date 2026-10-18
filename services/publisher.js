/**
 * Independently deployable exchange-data publisher (M4 prototype).
 * Each operator owns its Ed25519 key and its exchange access credentials.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolveMarket } from "../lib/catalog.js";
import { coinbaseTicker,krakenTicker } from "../lib/providers.js";
import { normalizeAttestation,signAttestation } from "../lib/oracle.js";

const source=process.env.PUBLISHER_SOURCE;
const id=process.env.PUBLISHER_ID;
const privateKeyFile=process.env.PUBLISHER_PRIVATE_KEY_FILE;
const apiKey=process.env.PUBLISHER_API_KEY;
const coordinator=process.env.ORACLE_SUBMIT_ENDPOINT;
const interval=Number(process.env.PUBLISHER_INTERVAL_MS||5000);
const symbols=(process.env.PUBLISHER_MARKETS||"BTC-USD,ETH-USD,SOL-USD").split(",");
const markets=symbols.map(resolveMarket);
if(!["coinbase","kraken"].includes(source)||!id||!privateKeyFile||!apiKey||!coordinator||
   !Number.isInteger(interval)||interval<1000||markets.length<1||markets.some(m=>!m)||
   (!/^https:\/\//.test(coordinator) &&
    !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(coordinator))) {
  console.error("Missing or invalid publisher configuration. See docs/oracle-operators.md");
  process.exit(1);
}
const secret=await readFile(privateKeyFile,"utf8");
const port=Number(process.env.PUBLISHER_HEALTH_PORT||3002);
const state={startedAt:new Date().toISOString(),success:0,failures:0,lastSuccessAt:null,lastError:null,source};
const health=createServer((_req,res)=>{
  res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
  res.end(JSON.stringify(state));
});
health.listen(port);
let stopped=false,previousSequence=0;

async function publish(market) {
  const ticker=source==="coinbase"?await coinbaseTicker(market):await krakenTicker(market);
  // Kraken REST ticker lacks an exchange-authorised observation timestamp:
  // collector receipt time is used and explicitly described as weaker provenance.
  const sourceTime=ticker.sourceTime?
    new Date(ticker.sourceTime).toISOString():ticker.receivedAt;
  const report=normalizeAttestation({
    publisherId:id,symbol:market.symbol,source,price:ticker.last,
    sequence:Math.max(Date.now(),previousSequence+1),sourceTime
  });
  previousSequence=report.sequence;
  const signature=signAttestation(report,secret);
  const response=await fetch(coordinator,{
    method:"POST",signal:AbortSignal.timeout(10000),
    headers:{"Content-Type":"application/json","x-api-key":apiKey},
    body:JSON.stringify({...report,signature})
  });
  if(!response.ok)throw Error("Coordinator rejected report: HTTP "+response.status);
  state.success++;state.lastSuccessAt=new Date().toISOString();state.lastError=null;
}
async function run() {
  if(stopped)return;
  await Promise.all(markets.map(async market=>{
    try {await publish(market);}
    catch(e){state.failures++;state.lastError=String(e.message).slice(0,160);console.error("[publisher]",market.symbol,e.message);}
  }));
  if(!stopped)setTimeout(run,interval);
}
console.log("[publisher] started",source,symbols.join(","));
run().catch(console.error);
function close() {stopped=true;health.close();}
process.on("SIGINT",close);
process.on("SIGTERM",close);
