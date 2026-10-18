/**
 * Honest research baseline: EWMA vs trailing rolling realised-volatility forecast.
 * Out-of-sample windows are evaluated chronologically, without forward leakage.
 * A trained predictive ML model is NOT implemented here.
 */
function rmse(actual,predicted) {
  return Math.sqrt(actual.reduce((s,x,i)=>s+(x-predicted[i])**2,0)/actual.length);
}
function round(n,d=4) {return Number(n.toFixed(d));}
function ewmaVariance(returns,decay=0.94) {
  let variance=returns.reduce((s,x)=>s+x*x,0)/returns.length;
  for(const r of returns) variance=decay*variance+(1-decay)*r*r;
  return variance;
}
export function evaluateVolatility(bars,{lookback=60,horizon=30,stride=15,decay=0.94}={}) {
  if(!Array.isArray(bars) || !Number.isInteger(lookback) || lookback<30 ||
     !Number.isInteger(horizon) || horizon<5 ||
     !Number.isInteger(stride) || stride<1 || !(decay>0&&decay<1)) {
    throw new Error("Invalid series or evaluation parameters");
  }
  const valid=bars.map(x=>({time:Date.parse(x.time),price:Number(x.price)}));
  if(valid.some(x=>!Number.isFinite(x.time)||!Number.isFinite(x.price)||x.price<=0)) {
    throw new Error("Invalid price series");
  }
  // Require a contiguous 1-minute time series so "30 minutes" is never
  // calculated from a sparse set of unevenly spaced observations.
  for(let i=1;i<valid.length;i++) {
    if(valid[i].time-valid[i-1].time!==60000) {
      throw new Error("GAPPED_SERIES");
    }
  }
  const returns=[];
  for(let i=1;i<valid.length;i++) returns.push(Math.log(valid[i].price/valid[i-1].price));
  if(returns.length<lookback+horizon+20) throw new Error("INSUFFICIENT_HISTORY");
  const actual=[],predicted=[],baseline=[];
  for(let end=lookback;end+horizon<=returns.length;end+=stride) {
    const history=returns.slice(end-lookback,end);
    const future=returns.slice(end,end+horizon);
    const observed=Math.sqrt(future.reduce((s,r)=>s+r*r,0))*100;
    const forecast=Math.sqrt(ewmaVariance(history,decay)*horizon)*100;
    const simple=Math.sqrt(history.reduce((s,r)=>s+r*r,0)/lookback*horizon)*100;
    actual.push(observed);predicted.push(forecast);baseline.push(simple);
  }
  const modelRmse=rmse(actual,predicted);
  const baselineRmse=rmse(actual,baseline);
  const trainingReturns=returns.slice(-lookback);
  const horizonForecastPct=Math.sqrt(ewmaVariance(trainingReturns,decay)*horizon)*100;
  return {
    schemaVersion:"1.0",kind:"ewma-realised-volatility-baseline",
    period:"24/7 crypto spot",bucketSeconds:60,lookbackMinutes:lookback,
    horizonMinutes:horizon,decay,
    latestPrice:valid.at(-1).price,latestPriceTime:new Date(valid.at(-1).time).toISOString(),
    forecastHorizonVolatilityPct:round(horizonForecastPct),
    outOfSample:{
      windows:actual.length,ewmaRmsePct:round(modelRmse),
      trailingVarianceBaselineRmsePct:round(baselineRmse),
      improvementVsTrailingBaselinePct:baselineRmse?
        round((baselineRmse-modelRmse)/baselineRmse*100):0,
      outperformingBaseline:modelRmse<baselineRmse
    },
    source:"PostgreSQL recorded one-minute median price observations",
    methodology:"EWMA forecast of one-minute log-return variance evaluated on later held-out windows, compared against trailing variance; rolling overlapping test windows.",
    disclaimer:"Research baseline only, not a validated AI model, market recommendation, future return forecast or trading signal. Backtests may not generalise."
  };
}
