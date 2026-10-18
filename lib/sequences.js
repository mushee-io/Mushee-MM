/**
 * Observed upstream sequence sanity checks.
 * Coinbase product sequence jumps are only advisory: not all upstream events
 * are subscribed to, so jumps must never be called proven lost ticker events.
 */
export function makeSequenceTracker() {
  const state=new Map();
  const counters={duplicates:0,regressions:0,jumps:0,accepted:0};
  return {
    counters,
    observe(tick) {
      const seq=tick?.sequence;
      if(!Number.isSafeInteger(seq) || seq<0) {
        counters.accepted++;return {accept:true,reason:"UNSEQUENCED"};
      }
      const key=tick.provider+":"+tick.symbol;
      const prev=state.get(key);
      if(prev!==undefined && seq<=prev) {
        if(seq===prev)counters.duplicates++;
        else counters.regressions++;
        return {accept:false,reason:seq===prev?"DUPLICATE":"SEQUENCE_REGRESSION"};
      }
      if(prev!==undefined && seq>prev+1)counters.jumps++;
      state.set(key,seq);
      counters.accepted++;
      return {accept:true,reason:prev!==undefined && seq>prev+1?"SEQUENCE_JUMP_OBSERVED":"MONOTONIC"};
    },
    resetProvider(provider) {
      for(const key of state.keys())if(key.startsWith(provider+":"))state.delete(key);
    }
  };
}
