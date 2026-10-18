import { createPublicKey, verify as verifySignature, sign as signSignature, createPrivateKey } from "node:crypto";
import { median } from "./analytics.js";

export const ORACLE_DOMAIN = "mushee-mm/oracle/attestation/v1";
export const ORACLE_MAX_AGE_MS = 30000;
const SUPPORTED = new Set(["BTC-USD","ETH-USD","SOL-USD"]);
const SOURCES = new Set(["coinbase","kraken"]);

export class AttestationError extends Error {
  constructor(message,code="INVALID_ATTESTATION") {
    super(message);this.code=code;
  }
}
function iso(value) {
  if(typeof value!=="string" || !Number.isFinite(Date.parse(value))) return null;
  const canonical = new Date(value).toISOString();
  return canonical === value ? canonical : null;
}
export function normalizeAttestation(input,{now=Date.now(),maxAgeMs=ORACLE_MAX_AGE_MS}={}) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new AttestationError("Invalid payload");
  const {publisherId,symbol,source,price,sequence,sourceTime} = input;
  if(typeof publisherId!=="string" || !/^[0-9a-f-]{36}$/i.test(publisherId)) {
    throw new AttestationError("Invalid publisher ID");
  }
  if(!SUPPORTED.has(symbol)||!SOURCES.has(source)) throw new AttestationError("Unsupported symbol/source");
  if(typeof price!=="number" || !Number.isFinite(price) || price<=0 || price>1e12 || Number(price.toFixed(10))!==price) {
    throw new AttestationError("Invalid price");
  }
  if(!Number.isSafeInteger(sequence) || sequence<1) throw new AttestationError("Invalid sequence");
  const stamp=iso(sourceTime);
  if(!stamp) throw new AttestationError("Source time must be canonical ISO-8601");
  const delta=now-Date.parse(stamp);
  if(delta>maxAgeMs || delta< -5000) throw new AttestationError("Observation outside freshness window","STALE_OR_FUTURE_ATTESTATION");
  // Construct the signed message from explicitly authorised fields in a stable order.
  // Unknown request fields never alter signed semantics.
  return {publisherId:publisherId.toLowerCase(),symbol,source,price,sequence,sourceTime:stamp};
}
export function attestationBytes(record) {
  return Buffer.from(ORACLE_DOMAIN+"\n"+JSON.stringify({
    publisherId:record.publisherId,symbol:record.symbol,source:record.source,
    price:record.price,sequence:record.sequence,sourceTime:record.sourceTime
  }),"utf8");
}
export function verifyAttestation(record,signature,pem) {
  if(typeof signature!=="string" || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  if(typeof pem!=="string" || pem.length>4096) return false;
  try {
    const key=createPublicKey(pem);
    if(key.asymmetricKeyType!=="ed25519") return false;
    const raw=Buffer.from(signature,"base64url");
    return raw.length===64 && verifySignature(null,attestationBytes(record),key,raw);
  } catch {return false;}
}
export function signAttestation(record,pem) {
  const key=createPrivateKey(pem);
  if(key.asymmetricKeyType!=="ed25519") throw new AttestationError("Ed25519 signing key required");
  return signSignature(null,attestationBytes(record),key).toString("base64url");
}

/**
 * Independent publisher/source threshold, re-verifies each signature.
 * Operators must be separately registered and their data provenance independently audited.
 */
export function buildConsensus(rows,{
  now=Date.now(),threshold=2,maxAgeMs=ORACLE_MAX_AGE_MS,maxDeviationBps=50
}={}) {
  const byPublisher=new Set(),bySource=new Set(),accepted=[],rejected=[];
  for(const row of rows) {
    let record;
    try {record=normalizeAttestation(row,{now,maxAgeMs});}
    catch(e) {rejected.push({publisherId:row.publisherId,reason:e.code||"INVALID"});continue;}
    if(row.active!==true || !verifyAttestation(record,row.signature,row.publicKey)) {
      rejected.push({publisherId:record.publisherId,reason:"INVALID_SIGNATURE_OR_INACTIVE"});continue;
    }
    if(byPublisher.has(record.publisherId) || bySource.has(record.source)) {
      rejected.push({publisherId:record.publisherId,reason:"DUPLICATE_PUBLISHER_OR_SOURCE"});continue;
    }
    byPublisher.add(record.publisherId);bySource.add(record.source);accepted.push(record);
  }
  const prices=accepted.map(x=>x.price);
  const price=prices.length?median(prices):null;
  const dev=prices.length && price>0?
    Math.max(...prices.map(x=>Math.abs(x.price-price)/price*10000)):null;
  const quorum=accepted.length>=threshold && bySource.size>=threshold;
  return {
    schemaVersion:"1.0",price:quorum && dev<=maxDeviationBps?price:null,
    status:!quorum?"INSUFFICIENT_QUORUM":dev>maxDeviationBps?"DISPUTED":"ATTESTED",
    threshold,validPublisherCount:accepted.length,distinctSourceCount:bySource.size,
    maxDeviationBps:dev===null?null:Number(dev.toFixed(2)),
    underlyingSources:[...bySource],
    verifiedAttestations:accepted,
    rejected,observedAt:new Date(now).toISOString(),
    disclaimer:"Cryptographic publisher authenticity and operator/source quorum do not independently prove that the underlying exchange market prices are accurate, licensed or executable."
  };
}
