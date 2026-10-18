import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import solc from "solc";

test("EVM contract compiles without Solidity errors and exposes required methods",()=>{
  const source=readFileSync(new URL("../contracts/MusheeOracle.sol",import.meta.url),"utf8");
  const input={language:"Solidity",sources:{"MusheeOracle.sol":{content:source}},
    settings:{optimizer:{enabled:true,runs:200},outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}};
  const result=JSON.parse(solc.compile(JSON.stringify(input)));
  const errors=(result.errors||[]).filter(x=>x.severity==="error");
  assert.deepEqual(errors,[],JSON.stringify(errors));
  const contract=result.contracts?.["MusheeOracle.sol"]?.MusheeOracle;
  assert.ok(contract,"compiler returned contract");
  assert.ok(contract.evm.bytecode.object.length>1000);
  const functions=contract.abi.filter(x=>x.type==="function").map(x=>x.name);
  for(const name of ["submit","read","setPublisher","reportHash","transferOwnership"]){
    assert.ok(functions.includes(name),"missing "+name);
  }
});
