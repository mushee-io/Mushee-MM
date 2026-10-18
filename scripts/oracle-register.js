import { readFile } from "node:fs/promises";
import { createPublicKey } from "node:crypto";
import { getPool,closePool,hasDatabase } from "../lib/storage.js";
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")).map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
const name=flags.name?.trim(),file=flags.publicKey,sources=flags.sources?.split(",");
if(!hasDatabase() || !name || name.length>140 || !file || !sources?.length ||
   !sources.every(s=>["coinbase","kraken"].includes(s))) {
  console.error("Usage: npm run oracle:register -- --name=OperatorOne --publicKey=.keys/operator.pub.pem --sources=coinbase");
  process.exitCode=1;
} else {
  try {
    const pem=await readFile(file,"utf8");
    if(createPublicKey(pem).asymmetricKeyType!=="ed25519") throw Error("Ed25519 required");
    const r=await getPool().query("INSERT INTO oracle_publishers(name,public_key_pem,sources) VALUES($1,$2,$3) RETURNING id",[name,pem,sources]);
    console.log("Registered publisher ID",r.rows[0].id);
  } catch(e){console.error("Registration failed:",e.message);process.exitCode=1;}
  finally{await closePool();}
}
