import assert from "node:assert/strict";
import { randomBytes,generateKeyPairSync } from "node:crypto";
import { getPool,closePool,selfUsage } from "../lib/storage.js";
import { authorise,hashToken } from "../lib/auth.js";
import { signAttestation,normalizeAttestation } from "../lib/oracle.js";
import {previewBill,createDraftInvoice,listBillingDrafts} from "../lib/billing.js";
import {minuteMedianPriceSeries} from "../lib/storage.js";
import {evaluateTrainedVolatility} from "../lib/ml-volatility.js";
import { submitOracleReport,readOracleConsensus } from "../lib/oracle-storage.js";

if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
const db=getPool();
try {
  const tenant=(await db.query(
    "INSERT INTO tenants(name,plan) VALUES($1,$2) RETURNING id",
    ["CI Tenant "+randomBytes(4).toString("hex"),"starter"]
  )).rows[0];
  const token="mm_live_"+randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO api_keys(tenant_id,label,key_prefix,key_hash,rate_limit_per_minute,scopes) "+
    "VALUES($1,$2,$3,$4,$5,$6)",
    [tenant.id,"test",token.slice(0,17),hashToken(token),10,["price","account"]]
  );
  assert.equal((await authorise(token,{scope:"price"})).ok,true);
  assert.equal((await authorise(token,{scope:"publish"})).code,403);
  await db.query(
    "INSERT INTO tenant_billing_pricing(tenant_id,base_fee_cents,included_requests,overage_per_thousand_cents,terms_reference) VALUES($1,$2,$3,$4,$5)",
    [tenant.id,10000,1000,25,"CI test pricing only"]
  );
  const billing=await previewBill(tenant.id,new Date().toISOString().slice(0,7));
  assert.equal(billing.totalCents,10000);
  assert.equal(billing.status,"PREVIEW_ONLY");
  const closedMonth=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1)).toISOString().slice(0,7);
  const draft=await createDraftInvoice(tenant.id,closedMonth);
  assert.equal(draft.created,true);
  const repeated=await createDraftInvoice(tenant.id,closedMonth);
  assert.equal(repeated.created,false);
  const listed=await listBillingDrafts(tenant.id);
  assert.equal(listed.drafts.length,1);
  const usage=await selfUsage(tenant.id,30);
  assert.ok(usage.usage.reduce((s,d)=>s+d.requests,0)>=1);

  const first=generateKeyPairSync("ed25519"),second=generateKeyPairSync("ed25519");
  const privatePem=(p)=>p.privateKey.export({type:"pkcs8",format:"pem"});
  const publicPem=(p)=>p.publicKey.export({type:"spki",format:"pem"});
  const op1=(await db.query(
    "INSERT INTO oracle_publishers(name,public_key_pem,sources) VALUES($1,$2,$3) RETURNING id",
    ["CI Coinbase "+randomBytes(4).toString("hex"),publicPem(first),["coinbase"]]
  )).rows[0].id;
  const op2=(await db.query(
    "INSERT INTO oracle_publishers(name,public_key_pem,sources) VALUES($1,$2,$3) RETURNING id",
    ["CI Kraken "+randomBytes(4).toString("hex"),publicPem(second),["kraken"]]
  )).rows[0].id;
  const now=new Date().toISOString();
  const r1=normalizeAttestation({
    publisherId:op1,symbol:"BTC-USD",source:"coinbase",
    price:100,sequence:Date.now(),sourceTime:now
  });
  const r2=normalizeAttestation({
    publisherId:op2,symbol:"BTC-USD",source:"kraken",
    price:100.1,sequence:Date.now(),sourceTime:now
  });
  const report1={...r1,signature:signAttestation(r1,privatePem(first))};
  const report2={...r2,signature:signAttestation(r2,privatePem(second))};
  assert.equal((await submitOracleReport(report1)).accepted,true);
  assert.equal((await submitOracleReport(report2)).accepted,true);
  await assert.rejects(()=>submitOracleReport(report1),(error)=>error.code==="REPLAYED_SEQUENCE");
  const quorum=await readOracleConsensus("BTC-USD");
  assert.equal(quorum.status,"ATTESTED");
  assert.equal(quorum.price,100.05);
  assert.equal(quorum.validPublisherCount,2);
  await db.query(
    "INSERT INTO market_ticks(symbol,provider,last_price,bid_price,ask_price,received_at) " +
    "SELECT 'SOL-USD','coinbase', 100 + sin(i::float8 / 13.0)*2.0 + i::float8/5000, " +
    "99,101,date_trunc('minute',now())-(700-i)*interval '1 minute' FROM generate_series(0,700) AS i"
  );
  const observed=await minuteMedianPriceSeries("SOL-USD",24);
  const ml=evaluateTrainedVolatility(observed);
  assert.ok(ml.trainingSamples>40);
  assert.ok(Number.isFinite(ml.evaluation.modelRmsePct));
  console.log("DB integration: migrations, tenant quotas, publisher proofs, replay, quorum, synthetic-fixture ML PASS");
} finally {await closePool();}
