import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { normalizeAttestation,attestationBytes,signAttestation,verifyAttestation,buildConsensus,AttestationError } from "../lib/oracle.js";

const first=generateKeyPairSync("ed25519");
const second=generateKeyPairSync("ed25519");
const attacker=generateKeyPairSync("ed25519");
const pub=(k)=>k.publicKey.export({type:"spki",format:"pem"});
const secret=(k)=>k.privateKey.export({type:"pkcs8",format:"pem"});
const now=Date.parse("2026-10-18T12:00:20.000Z");
const oneId="11111111-1111-4111-8111-111111111111";
const twoId="22222222-2222-4222-8222-222222222222";

function entry(publisherId,source,price,sequence=1) {
  return normalizeAttestation({publisherId,symbol:"BTC-USD",source,price,sequence,
    sourceTime:"2026-10-18T12:00:18.000Z"},{now});
}
function signed(record,key) {
  return {...record,signature:signAttestation(record,secret(key)),publicKey:pub(key),active:true};
}
test("domain-separated Ed25519 oracle signature round trip",()=>{
  const r=entry(oneId,"coinbase",100);
  const sig=signAttestation(r,secret(first));
  assert.ok(attestationBytes(r).toString().startsWith("mushee-mm/oracle/attestation/v1\n"));
  assert.equal(verifyAttestation(r,sig,pub(first)),true);
  assert.equal(verifyAttestation(r,sig,pub(attacker)),false);
  assert.equal(verifyAttestation({...r,price:101},sig,pub(first)),false);
  assert.equal(verifyAttestation({...r,sequence:2},sig,pub(first)),false);
});
test("quorum requires distinct publishers and distinct underlying venues",()=>{
  const good=buildConsensus([
    signed(entry(oneId,"coinbase",100),first),
    signed(entry(twoId,"kraken",100.1),second)
  ],{now});
  assert.equal(good.status,"ATTESTED");
  assert.equal(good.price,100.05);
  assert.equal(good.validPublisherCount,2);
  const bad=buildConsensus([
    signed(entry(oneId,"coinbase",100),first),
    signed(entry(twoId,"coinbase",100.1),second)
  ],{now});
  assert.equal(bad.status,"INSUFFICIENT_QUORUM");
  assert.equal(bad.price,null);
});
test("outlier price produces disputed status and suppresses price",()=>{
  const result=buildConsensus([
    signed(entry(oneId,"coinbase",100),first),
    signed(entry(twoId,"kraken",105),second)
  ],{now});
  assert.equal(result.status,"DISPUTED");
  assert.equal(result.price,null);
});
test("revoked and forged publisher cannot form quorum",()=>{
  const valid=signed(entry(oneId,"coinbase",100),first);
  const forged=signed(entry(twoId,"kraken",100),attacker);
  forged.publicKey=pub(second);
  const output=buildConsensus([valid,forged],{now});
  assert.equal(output.status,"INSUFFICIENT_QUORUM");
  assert.equal(output.rejected[0].reason,"INVALID_SIGNATURE_OR_INACTIVE");
  const revoked={...signed(entry(twoId,"kraken",100),second),active:false};
  assert.equal(buildConsensus([valid,revoked],{now}).status,"INSUFFICIENT_QUORUM");
});
test("invalid observations rejected",()=>{
  assert.throws(()=>normalizeAttestation({...entry(oneId,"coinbase",100),price:0},{now}),AttestationError);
  assert.throws(()=>normalizeAttestation({...entry(oneId,"coinbase",100),symbol:"FAKE-USD"},{now}),AttestationError);
  assert.throws(()=>normalizeAttestation({...entry(oneId,"coinbase",100),sourceTime:"2026-10-18T11:00:00.000Z"},{now}),AttestationError);
});
