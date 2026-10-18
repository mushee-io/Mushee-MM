/**
 * Trained statistical ML baseline for short-horizon realised volatility.
 * Ridge regression, causal rolling features, chronological train/test split.
 * Never label an unbenchmarked model as alpha or an investment signal.
 */
const square=x=>x*x;
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const round=(n,d=6)=>Number(n.toFixed(d));
const rmse=(actual,predicted)=>Math.sqrt(mean(actual.map((y,i)=>square(y-predicted[i]))));
const mae=(actual,predicted)=>mean(actual.map((y,i)=>Math.abs(y-predicted[i])));

function solve(matrix,vector) {
  const n=vector.length;
  const a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<n;col++) {
    let pivot=col;
    for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
    if(Math.abs(a[pivot][col])<1e-12)throw Error("UNSTABLE_MODEL");
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];
    for(let j=col;j<=n;j++)a[col][j]/=divisor;
    for(let i=0;i<n;i++)if(i!==col) {
      const k=a[i][col];
      for(let j=col;j<=n;j++)a[i][j]-=k*a[col][j];
    }
  }
  return a.map(row=>row[n]);
}

function features(history,horizon) {
  const returns=history;
  const tail=n=>returns.slice(-n);
  const energy=n=>mean(tail(n).map(square));
  return [
    Math.sqrt(energy(5)*horizon)*100,
    Math.sqrt(energy(15)*horizon)*100,
    Math.sqrt(energy(60)*horizon)*100,
    mean(tail(10))*100
  ];
}
function validateBars(bars) {
  if(!Array.isArray(bars) || bars.length<500)throw Error("INSUFFICIENT_HISTORY");
  const valid=bars.map(x=>({time:Date.parse(x.time),price:Number(x.price)}));
  if(valid.some(x=>!Number.isFinite(x.time) || !Number.isFinite(x.price) || x.price<=0))throw Error("INVALID_HISTORY");
  for(let i=1;i<valid.length;i++) {
    if(valid[i].time-valid[i-1].time!==60000)throw Error("GAPPED_SERIES");
  }
  return valid;
}
export function evaluateTrainedVolatility(bars,{
  lookback=60,horizon=5,trainFraction=0.7,lambda=1
}={}) {
  if(lookback!==60 || !Number.isInteger(horizon) || horizon<5 || horizon>30 ||
     !(trainFraction>=0.6&&trainFraction<=0.85) ||
     !Number.isFinite(lambda) || lambda<=0 || lambda>100)throw Error("INVALID_MODEL_PARAMETERS");
  const series=validateBars(bars);
  const returns=series.slice(1).map((item,i)=>Math.log(item.price/series[i].price));
  const rows=[];
  // Nonoverlapping labels so evaluation windows cannot double-count the same future returns.
  for(let end=lookback;end+horizon<=returns.length;end+=horizon) {
    const historical=returns.slice(end-lookback,end);
    const future=returns.slice(end,end+horizon);
    rows.push({
      features:features(historical,horizon),
      y:Math.sqrt(future.reduce((s,v)=>s+v*v,0))*100,
      windowStart:series[end].time,
      labelEnd:series[end+horizon].time
    });
  }
  const boundary=Math.floor(rows.length*trainFraction);
  const train=rows.slice(0,boundary),test=rows.slice(boundary);
  if(train.length<40 || test.length<20)throw Error("INSUFFICIENT_TRAIN_TEST_SAMPLES");
  if(train.at(-1).labelEnd>test[0].windowStart)throw Error("TRAIN_TEST_LEAKAGE");
  const k=train[0].features.length;
  const avg=Array.from({length:k},(_,i)=>mean(train.map(r=>r.features[i])));
  const dev=Array.from({length:k},(_,i)=>Math.sqrt(mean(train.map(r=>square(r.features[i]-avg[i])))));
  const scale=dev.map(x=>x>1e-9?x:1);
  const transform=x=>[1,...x.map((v,i)=>(v-avg[i])/scale[i])];
  const X=train.map(row=>transform(row.features));
  const dimension=k+1;
  const gram=Array.from({length:dimension},()=>Array(dimension).fill(0));
  const cross=Array(dimension).fill(0);
  for(let i=0;i<X.length;i++) {
    for(let j=0;j<dimension;j++) {
      cross[j]+=X[i][j]*train[i].y;
      for(let l=0;l<dimension;l++)gram[j][l]+=X[i][j]*X[i][l];
    }
  }
  for(let i=1;i<dimension;i++)gram[i][i]+=lambda;
  const coeff=solve(gram,cross);
  const infer=row=>Math.max(0,transform(row.features).reduce((s,x,i)=>s+x*coeff[i],0));
  const actual=test.map(x=>x.y);
  const estimated=test.map(infer);
  const baseline=test.map(x=>x.features[2]);
  const modelRmse=rmse(actual,estimated);
  const baseRmse=rmse(actual,baseline);
  const currentFeatures=features(returns.slice(-lookback),horizon);
  const latest=infer({features:currentFeatures});
  return {
    schemaVersion:"1.0",kind:"trained-ridge-realised-volatility",
    training:"standardised rolling features, L2-regularised ridge regression",
    horizonMinutes:horizon,lookbackMinutes:lookback,
    trainingSamples:train.length,testSamples:test.length,
    trainEnd:new Date(train.at(-1).labelEnd).toISOString(),
    testStart:new Date(test[0].windowStart).toISOString(),
    latestObservationTime:new Date(series.at(-1).time).toISOString(),
    predictedHorizonVolatilityPct:round(latest),
    evaluation:{
      modelRmsePct:round(modelRmse),baselineRmsePct:round(baseRmse),
      modelMaePct:round(mae(actual,estimated)),
      baselineMaePct:round(mae(actual,baseline)),
      improvementVsBaselinePct:baseRmse===0?null:round((baseRmse-modelRmse)/baseRmse*100),
      beatsBaseline:modelRmse<baseRmse,
      method:"Chronological 70/30 out-of-sample holdout; nonoverlapping future labels"
    },
    modelProvenance:{
      dataSource:"Stored real one-minute median crypto spot observations",
      featureNames:["last5m_vol","last15m_vol","last60m_vol","last10m_log_return"],
      target:"forward realised root-sum-squared log returns (percent)",
      noExternalModel:true
    },
    disclaimer:"Experimental supervised statistical ML research. Performance may be worse than a naive baseline; not a risk guarantee, trading signal, regulated benchmark or investment recommendation."
  };
}
