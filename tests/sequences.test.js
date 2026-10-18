import test from "node:test";
import assert from "node:assert/strict";
import {makeSequenceTracker} from "../lib/sequences.js";

test("collector ignores duplicate or backward Coinbase sequences",()=>{
  const t=makeSequenceTracker();
  const tick=(sequence)=>({provider:"coinbase",symbol:"BTC-USD",sequence});
  assert.equal(t.observe(tick(10)).accept,true);
  assert.equal(t.observe(tick(10)).reason,"DUPLICATE");
  assert.equal(t.observe(tick(9)).reason,"SEQUENCE_REGRESSION");
  assert.equal(t.counters.duplicates,1);
  assert.equal(t.counters.regressions,1);
  assert.equal(t.observe(tick(15)).reason,"SEQUENCE_JUMP_OBSERVED");
  assert.equal(t.counters.jumps,1);
});
test("sequence resets are explicit upon reconnect",()=>{
  const t=makeSequenceTracker();
  const tick={provider:"coinbase",symbol:"SOL-USD",sequence:100};
  t.observe(tick);
  assert.equal(t.observe({...tick,sequence:1}).accept,false);
  t.resetProvider("coinbase");
  assert.equal(t.observe({...tick,sequence:1}).accept,true);
});
test("Kraken tickers without sequences are accepted without fake loss signals",()=>{
  const t=makeSequenceTracker();
  assert.equal(t.observe({provider:"kraken",symbol:"ETH-USD",sequence:null}).accept,true);
  assert.equal(t.counters.jumps,0);
});
