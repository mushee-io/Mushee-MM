import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTrainedVolatility} from "../lib/ml-volatility.js";

const start=Date.parse("2026-10-01T00:00:00.000Z");
function generated(count=1300) {
  let p=3000;
  return Array.from({length:count},(_,i)=>{
    const time=new Date(start+i*60000).toISOString();
    p*=Math.exp(Math.sin(i*0.31)*0.002+Math.cos(i*0.09)*0.0009);
    return {time,price:p};
  });
}
test("ridge ML trains on past observations, evaluates unseen future windows",()=>{
  const r=evaluateTrainedVolatility(generated());
  assert.equal(r.kind,"trained-ridge-realised-volatility");
  assert.ok(r.trainingSamples>40);
  assert.ok(r.testSamples>=20);
  assert.ok(Date.parse(r.trainEnd)<=Date.parse(r.testStart));
  assert.ok(Number.isFinite(r.evaluation.modelRmsePct));
  assert.ok(Number.isFinite(r.evaluation.baselineRmsePct));
  assert.ok(Number.isFinite(r.predictedHorizonVolatilityPct));
  assert.equal(r.evaluation.beatsBaseline,r.evaluation.modelRmsePct<r.evaluation.baselineRmsePct);
});
test("prediction is deterministic across repeated valid calls",()=>{
  const fixture=generated();
  const a=evaluateTrainedVolatility(fixture);
  const b=evaluateTrainedVolatility(fixture);
  assert.deepEqual(a,b);
});
test("gaps, invalid prices, short histories and invalid horizons fail closed",()=>{
  assert.throws(()=>evaluateTrainedVolatility(generated(200)),/INSUFFICIENT_HISTORY/);
  assert.throws(()=>evaluateTrainedVolatility(generated(),{horizon:1}),/INVALID_MODEL_PARAMETERS/);
  const broken=generated();broken.splice(400,1);
  assert.throws(()=>evaluateTrainedVolatility(broken),/GAPPED_SERIES/);
  const bad=generated();bad[20].price=0;
  assert.throws(()=>evaluateTrainedVolatility(bad),/INVALID_HISTORY/);
});
test("last minute can affect prediction without rewriting past training/testing labels",()=>{
  const a=generated(),b=a.map(x=>({...x}));
  b.at(-1).price*=1.5;
  const old=evaluateTrainedVolatility(a),updated=evaluateTrainedVolatility(b);
  assert.equal(old.trainingSamples,updated.trainingSamples);
  assert.equal(old.testSamples,updated.testSamples);
  assert.notEqual(old.predictedHorizonVolatilityPct,updated.predictedHorizonVolatilityPct);
});
