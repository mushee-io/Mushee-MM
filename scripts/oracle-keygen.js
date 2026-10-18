import { generateKeyPairSync } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
const name=process.argv.find(x=>x.startsWith("--out="))?.slice(6);
if(!name || !/^[a-zA-Z0-9_-]{2,40}$/.test(name)) {
  console.error("Usage: npm run oracle:keygen -- --out=publisher-name");
  process.exitCode=1;
} else {
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const pem=publicKey.export({type:"spki",format:"pem"});
  const secret=privateKey.export({type:"pkcs8",format:"pem"});
  await mkdir("./.keys",{recursive:true,mode:0o700});
  await writeFile(join(".keys",name+".pem"),secret,{mode:0o600,flag:"wx"});
  await writeFile(join(".keys",name+".pub.pem"),pem,{mode:0o644,flag:"wx"});
  console.log("Created separate Ed25519 publisher keys under .keys; never commit private key.");
}
