import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVolatility } from "../lib/volatility.js";
const base=Date.parse("2026-10-18T00:00:00Z");
function fixture(count=360) {
  const data=[];let price=100;
  for(let i=0;i<count;i++) {
    price*=Math.exp(Math.sin(i*0.28)*0.003+Math.cos(i*0.07)*0.001);
    data.push({time:new Date(base+i*60000).toISOString(),price});
  }
  return data;
}
test("forecast evaluation uses held-out windows and compares baseline",()=>{
  const r=evaluateVolatility(fixture());
  assert.equal(r.kind,"ewma-realised-volatility-baseline");
  assert.ok(r.outOfSample.windows>1);
  assert.ok(Number.isFinite(r.forecastHorizonVolatilityPct));
  assert.ok(Number.isFinite(r.outOfSample.ewmaRmsePct));
  assert.equal(typeof r.outOfSample.outperformingBaseline,"boolean");
  assert.ok(r.disclaimer.includes("not a validated AI model"));
});
test("a missing minute is not treated as one elapsed minute",()=>{
  const bars=fixture();bars.splice(100,1);
  assert.throws(()=>evaluateVolatility(bars),/GAPPED_SERIES/);
});
test("short and invalid data are rejected",()=>{
  assert.throws(()=>evaluateVolatility(fixture(70)),/INSUFFICIENT_HISTORY/);
  const bad=fixture();bad[0].price=0;
  assert.throws(()=>evaluateVolatility(bad),/Invalid price series/);
});
test("latest forecast reacts to latest observed price",()=>{
  const a=fixture(),b=a.map(x=>({...x}));
  const first=evaluateVolatility(a).forecastHorizonVolatilityPct;
  b[b.length-1].price*=2;
  assert.notEqual(first,evaluateVolatility(b).forecastHorizonVolatilityPct);
});
