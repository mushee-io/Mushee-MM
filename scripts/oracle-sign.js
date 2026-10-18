import { readFile } from "node:fs/promises";
import { normalizeAttestation,signAttestation } from "../lib/oracle.js";
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")).map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
const {key,publisherId,symbol,source,price,sequence}=flags;
if(!key||!publisherId||!symbol||!source||!price||!sequence) {
  console.error("Usage: npm run oracle:sign -- --key=.keys/operator.pem --publisherId=UUID --symbol=BTC-USD --source=coinbase --price=100 --sequence=1");
  process.exitCode=1;
} else {
  try {
    const report=normalizeAttestation({publisherId,symbol,source,price:Number(price),sequence:Number(sequence),sourceTime:new Date().toISOString()});
    const secret=await readFile(key,"utf8");
    console.log(JSON.stringify({...report,signature:signAttestation(report,secret)},null,2));
  } catch(e) {console.error("Sign failed:",e.message);process.exitCode=1;}
}
