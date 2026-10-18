import test from "node:test";
import assert from "node:assert/strict";
import {ALL_FEEDS,CATEGORIES,getFeed,queryFeeds,explorerCategories} from "../lib/feed-directory.js";
import {handleExplorer} from "../lib/explorer-api.js";
import {readFile} from "node:fs/promises";

test("all seven asset classes have real, unique instrument definitions",()=>{
  assert.equal(CATEGORIES.length,8);
  assert.equal(ALL_FEEDS.length,128);
  assert.equal(new Set(ALL_FEEDS.map(x=>x.id)).size,ALL_FEEDS.length);
  assert.deepEqual(new Set(ALL_FEEDS.map(x=>x.category)),
    new Set(["indices","metals","crypto","equities","fx","commodities","rates"]));
  assert.equal(explorerCategories().find(x=>x.slug==="all").count,128);
  for(const item of ALL_FEEDS){
    assert.ok(item.name&&item.symbol&&item.quoteCurrency);
    assert.ok(item.id===item.category+":"+item.symbol);
  }
});
test("only three supported public crypto pairs are marked connector ready",()=>{
  const ready=ALL_FEEDS.filter(x=>x.status==="connected");
  assert.deepEqual(ready.map(x=>x.symbol),["BTC-USD","ETH-USD","SOL-USD"]);
  assert.ok(ALL_FEEDS.filter(x=>x.category!=="crypto").every(x=>
    x.status==="planned"&&x.sources.length===0&&!Object.hasOwn(x,"price")
  ));
});
test("metals, indices, FX, equities, commodities and yields are section-searchable",()=>{
  assert.equal(getFeed("metals:XAUUSD").name,"Gold Spot");
  assert.equal(getFeed("indices:SPX").name,"S&P 500");
  assert.equal(getFeed("rates:SOFR").name,"Secured Overnight Financing Rate");
  assert.equal(getFeed("fx:GBP-USD").quoteCurrency,"USD");
  assert.equal(getFeed("equities:AAPL").name,"Apple Inc.");
  assert.equal(getFeed("commodities:BRENT").name,"Brent Crude Oil");
  assert.equal(getFeed("equities:NOPE"),null);
});
test("server-side search, status, category and paging filter independently",()=>{
  const response=queryFeeds({category:"crypto",status:"connected",sort:"symbol",limit:2,offset:0});
  assert.equal(response.total,3);
  assert.equal(response.hasMore,true);
  assert.deepEqual(response.feeds.map(x=>x.symbol),["BTC-USD","ETH-USD"]);
  assert.equal(queryFeeds({category:"metals",q:"gold"}).total,3);
  assert.equal(queryFeeds({category:"rates",q:"Treasury"}).total,4);
  assert.equal(queryFeeds({category:"equities",q:"aapl"}).total,1);
  assert.equal(queryFeeds({category:"fx",q:"gbp"}).total>0,true);
  assert.equal(queryFeeds({category:"commodities",status:"connected"}).total,0);
  assert.equal(queryFeeds({category:"all",offset:125,limit:15}).feeds.length,3);
});
test("search parameters reject invalid and expensive requests",()=>{
  assert.throws(()=>queryFeeds({category:"fake"}),/INVALID_CATEGORY/);
  assert.throws(()=>queryFeeds({status:"live"}),/INVALID_STATUS/);
  assert.throws(()=>queryFeeds({sort:"price"}),/INVALID_SORT/);
  assert.throws(()=>queryFeeds({limit:10000}),/INVALID_PAGINATION/);
  assert.throws(()=>queryFeeds({offset:-1}),/INVALID_PAGINATION/);
  assert.throws(()=>queryFeeds({q:"x".repeat(121)}),/INVALID_SEARCH/);
});
test("public explorer routes disclose metadata, not commercially restricted quotes",async()=>{
  const base="http://localhost";
  const categories=await handleExplorer(new URL("/api/v1/explore/categories",base));
  assert.equal(categories.code,200);
  assert.equal(categories.data.feedCount,128);
  const query=await handleExplorer(new URL("/api/v1/explore/feeds?category=indices&limit=6",base));
  assert.equal(query.code,200);
  assert.equal(query.data.feeds.length,6);
  assert.ok(query.data.feeds.every(x=>x.status==="planned"&&!Object.hasOwn(x,"price")));
  const info=await handleExplorer(new URL("/api/v1/explore/feed?id=equities%3AAAPL",base));
  assert.equal(info.code,200);
  assert.equal(info.data.publicQuote,null);
  assert.match(info.data.dataPolicy,/No price/);
  const missing=await handleExplorer(new URL("/api/v1/explore/feed?id=not-a-feed",base));
  assert.equal(missing.code,404);
  const invalid=await handleExplorer(new URL("/api/v1/explore/feeds?limit=9999999",base));
  assert.equal(invalid.code,400);
});
test("responsive explorer and direct navigation are published",async()=>{
  const html=await readFile(new URL("../public/explore.html",import.meta.url),"utf8");
  const js=await readFile(new URL("../public/explore.js",import.meta.url),"utf8");
  const server=await readFile(new URL("../server.js",import.meta.url),"utf8");
  const vercel=JSON.parse(await readFile(new URL("../vercel.json",import.meta.url),"utf8"));
  for(const anchor of ["category-nav","feed-table","search","status","sort","feed-detail"]){
    assert.ok(html.includes('id="'+anchor+'"'));
  }
  assert.ok(js.includes("/api/v1/explore/feeds"));
  assert.ok(js.includes("/api/v1/explore/quotes"));
  assert.ok(server.includes('pathname === "/explore"'));
  assert.ok(vercel.rewrites.some(x=>x.source==="/explore"));
});

test("homepage visibly exposes all seven feed sections with working deep links",async()=>{
  const home=await readFile(new URL("../public/index.html",import.meta.url),"utf8");
  for(const category of ["indices","metals","crypto","equities","fx","commodities","rates"]){
    assert.ok(home.includes('href="/explore?category='+category+'"'),"missing homepage category "+category);
  }
  assert.ok(home.includes('id="markets"'));
  assert.ok(home.includes('href="/explore"'));
  assert.ok(home.includes("128-instrument directory"));
  assert.ok(home.includes("Directory entries are not live price feeds"));
});

test("Vercel rewrites all API v1 paths to a real function entry point",async()=>{
  const v=JSON.parse(await readFile(new URL("../vercel.json",import.meta.url),"utf8"));
  assert.equal(v.framework,null);
  assert.equal(v.functions["api/v1.js"].maxDuration,10);
  assert.deepEqual(v.rewrites.find(x=>x.source==="/api/v1/:path*"),
    {source:"/api/v1/:path*",destination:"/api/v1"});
  const bridge=await readFile(new URL("../api/v1.js",import.meta.url),"utf8");
  assert.match(bridge,/export default handler/);
  assert.match(bridge,/import handler from "\.\/index\.js"/);
});
