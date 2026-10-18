import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { authorise, presentedApiKey } from "../lib/auth.js";
import { normaliseCoinbase, normaliseKraken, coinbaseSubscribe, krakenSubscribe, parseSubscription } from "../lib/streaming.js";
import { insertTicks, closePool, hasDatabase } from "../lib/storage.js";
import { aggregateTicker } from "../lib/analytics.js";
import { selectFreshSources } from "../lib/quality.js";
import { makeSequenceTracker } from "../lib/sequences.js";

const port = Number(process.env.STREAM_PORT || 3001);
const sources = [
  { name:"coinbase",url:"wss://ws-feed.exchange.coinbase.com",subscribe:coinbaseSubscribe,normalise:normaliseCoinbase },
  { name:"kraken",url:"wss://ws.kraken.com/v2",subscribe:krakenSubscribe,normalise:normaliseKraken }
];
const clients = new Set();
const latest = new Map();
const sourceState = {};
const tickBuffer = [];
const MAX_QUEUE = 5000;
const MAX_CLIENT_BUFFER = 1024 * 1024;
let droppedTicks = 0;
let running = true;
let flushing = false;
const upstreamConnections = new Set();
const sequencing = makeSequenceTracker();

function json(res, status, data) {
  res.writeHead(status, { "Content-Type":"application/json", "Cache-Control":"no-store" });
  res.end(JSON.stringify(data));
}
function freshnessMs(tick) { return Date.now() - new Date(tick.receivedAt).getTime(); }
function send(client, data) {
  if (client.readyState !== WebSocket.OPEN) return;
  if (client.bufferedAmount > MAX_CLIENT_BUFFER) { client.close(1013, "Slow consumer"); return; }
  client.send(JSON.stringify(data));
}
function broadcast(data) {
  for (const client of clients) {
    if (client.subscriptions?.has(data.symbol)) send(client, data);
  }
}
function processTick(tick) {
  if (!running || selectFreshSources([tick]).accepted.length !== 1) return;
  if (!sequencing.observe(tick).accept) return;
  latest.set(tick.symbol + ":" + tick.provider, tick);
  if (hasDatabase()) {
    if (tickBuffer.length >= MAX_QUEUE) droppedTicks++;
    else tickBuffer.push(tick);
  }
  broadcast({type:"ticker",...tick});
  const observed = ["coinbase","kraken"].map((provider) => latest.get(tick.symbol + ":" + provider))
    .filter(Boolean);
  const current = selectFreshSources(observed).accepted;
  if (!current.length) return;
  const ref = aggregateTicker(current, tick.symbol);
  broadcast({
    type:"reference",symbol:tick.symbol,price:ref.price,sourceCount:ref.sourceCount,
    status:ref.status,divergenceAlert:ref.divergenceAlert,observedAt:ref.observedAt,
    maxSourceDeviationBps:ref.maxSourceDeviationBps,method:ref.method,
    sources:ref.sources.map(({provider,last,sourceTime,receivedAt}) => ({provider,last,sourceTime,receivedAt}))
  });
}
async function flushTicks() {
  if (!running || flushing || !hasDatabase() || !tickBuffer.length) return;
  flushing = true;
  const batch = tickBuffer.splice(0, 100);
  try { await insertTicks(batch); }
  catch (error) {
    // Requeue at the front after transient DB errors; fail visibly if capacity exhausted.
    const free = Math.max(0,MAX_QUEUE-tickBuffer.length);
    if (free < batch.length) droppedTicks += batch.length-free;
    tickBuffer.unshift(...batch.slice(0,free));
    console.error("[stream] persistence failure (retry queued):",error.message);
  }
  finally { flushing = false; }
}
function connectUpstream(source) {
  let retries = 0;
  let reconnectTimer;
  let watchdog;
  let lastMessageAt = Date.now();
  const state = sourceState[source.name] = {connected:false,lastMessageAt:null,messages:0,errors:0};
  function reconnect() {
    if (!running || reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(retries++,5)) + Math.floor(Math.random()*500);
    reconnectTimer = setTimeout(() => {reconnectTimer = null;connect();},delay);
  }
  function connect() {
    if (!running) return;
    const socket = new WebSocket(source.url,{perMessageDeflate:false,handshakeTimeout:10000});
    upstreamConnections.add(socket);
    socket.on("open",() => {
      sequencing.resetProvider(source.name);
      retries = 0; lastMessageAt = Date.now(); state.connected = true;
      socket.send(JSON.stringify(source.subscribe()));
      console.log("[stream] subscribed to "+source.name);
    });
    socket.on("message",(raw) => {
      if (raw.length > 1024*1024) return;
      lastMessageAt = Date.now();
      state.lastMessageAt = new Date().toISOString(); state.messages++;
      try {
        const message = JSON.parse(raw.toString());
        if (message.success === false || message.type === "error") state.errors++;
        for (const tick of source.normalise(message)) processTick(tick);
      } catch { state.errors++; }
    });
    socket.on("error",(error) => {state.errors++;console.warn("[stream]",source.name,error.message);});
    socket.on("close",() => {
      state.connected = false;upstreamConnections.delete(socket);clearInterval(watchdog);reconnect();
    });
    watchdog = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now()-lastMessageAt > 60000) socket.terminate();
      else socket.ping();
    },15000);
  }
  connect();
}

const httpServer = createServer((req,res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/readyz") {
    const coverage = ["BTC-USD","ETH-USD","SOL-USD"].map(symbol=>{
      const ticks=["coinbase","kraken"].map(provider=>latest.get(symbol+":"+provider)).filter(Boolean);
      return {symbol,freshSources:selectFreshSources(ticks).accepted.length};
    });
    const ready=coverage.every(x=>x.freshSources>=2);
    return json(res,ready?200:503,{ready,coverage,
      warning:"Availability depends on real, independent exchange observations; no synthetic fallback."});
  }
  if (url.pathname === "/healthz") return json(res,200,{
    service:"mushee-stream",running,databaseConfigured:hasDatabase(),sources:sourceState,
    connectedClients:clients.size,tickQueueSize:tickBuffer.length,droppedTicks,
    sequenceObservations:sequencing.counters,
    note:"Process status only. Source connectivity is reported separately."
  });
  return json(res,404,{error:"NOT_FOUND"});
});
const wss = new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
httpServer.on("upgrade",async (req,socket,head) => {
  if (new URL(req.url || "/", "http://localhost").pathname !== "/stream/v1/tickers") {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }
  try {
    const permission = await authorise(presentedApiKey(req.headers),{scope:"stream"});
    if (!permission.ok) {
      socket.end("HTTP/1.1 "+permission.code+" Access Denied\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req,socket,head,(ws) => {
      ws.subscriptions = new Set();
      ws.isAlive = true;
      wss.emit("connection",ws,req);
    });
  } catch(error) {
    console.error("[stream] authentication unavailable",error.message);
    socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
  }
});
wss.on("connection",(client) => {
  clients.add(client);
  send(client,{type:"hello",message:"Subscribe with a JSON message containing type=subscribe and symbols array.",version:"0.3.0"});
  client.on("pong",() => {client.isAlive = true;});
  client.on("message",(raw) => {
    const subscriptions = parseSubscription(raw.toString());
    if (!subscriptions) {send(client,{type:"error",error:"INVALID_SUBSCRIPTION"});return;}
    client.subscriptions = new Set(subscriptions);
    send(client,{type:"subscribed",symbols:subscriptions});
    for (const symbol of subscriptions) {
      const records = ["coinbase","kraken"].map((provider) => latest.get(symbol+":"+provider))
        .filter((tick) => tick && freshnessMs(tick) < 20000);
      for (const tick of records) send(client,{type:"ticker",...tick});
      if (records.length) {
        const ref = aggregateTicker(records,symbol);
        send(client,{type:"reference",symbol,price:ref.price,sourceCount:ref.sourceCount,
          status:ref.status,observedAt:ref.observedAt,method:ref.method,
          divergenceAlert:ref.divergenceAlert});
      }
    }
  });
  client.on("error",() => {});
  client.on("close",() => clients.delete(client));
});

const pingClients = setInterval(() => {
  for (const client of clients) {
    if (!client.isAlive) {client.terminate();continue;}
    client.isAlive = false;client.ping();
  }
},30000);
const flushInterval = setInterval(flushTicks,1000);
httpServer.listen(port,()=>console.log("[stream] listening on "+port));
for (const source of sources) connectUpstream(source);
if (!hasDatabase()) console.warn("[stream] DATABASE_URL missing; persistence disabled.");

async function shutdown() {
  if (!running) return;
  running = false;
  clearInterval(pingClients);clearInterval(flushInterval);
  for (const socket of upstreamConnections) socket.terminate();
  for (const client of clients) client.terminate();
  await new Promise((resolve) => httpServer.close(resolve));
  if (hasDatabase()) {
    while (tickBuffer.length) {
      const batch = tickBuffer.splice(0,100);
      try {await insertTicks(batch);}
      catch (error) {console.error("[stream] shutdown persistence error",error.message);break;}
    }
  }
  await closePool();
}
process.on("SIGINT",()=>{shutdown().catch(console.error);});
process.on("SIGTERM",()=>{shutdown().catch(console.error);});
