import {getPool,closePool,hasDatabase} from "../lib/storage.js";
import {createDraftInvoice,parseBillingMonth} from "../lib/billing.js";
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--"))
  .map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
const command=process.argv[2];
const tenantId=args.tenantId,month=args.month;
const int=v=>/^\d+$/.test(v||"")?Number(v):NaN;
const validateId=()=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(tenantId||"");
if(!hasDatabase() || !validateId() || !["configure","draft"].includes(command)) {
  console.error("Usage: npm run billing -- configure --tenantId=UUID --baseCents=10000 --included=100000 --overagePerThousandCents=20 --terms=ContractRef");
  console.error("Or: npm run billing -- draft --tenantId=UUID --month=2026-09");
  process.exitCode=1;
} else try {
  const db=getPool();
  if(command==="configure") {
    const base=int(args.baseCents),included=int(args.included),overage=int(args.overagePerThousandCents);
    if(![base,included,overage].every(x=>Number.isSafeInteger(x) && x>=0) ||
      !args.terms || args.terms.length>200)throw Error("INVALID_CONTRACT_PRICING");
    await db.query(
      "INSERT INTO tenant_billing_pricing(tenant_id,base_fee_cents,included_requests,overage_per_thousand_cents,terms_reference) " +
      "VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET " +
      "base_fee_cents=EXCLUDED.base_fee_cents,included_requests=EXCLUDED.included_requests," +
      "overage_per_thousand_cents=EXCLUDED.overage_per_thousand_cents,terms_reference=EXCLUDED.terms_reference,updated_at=now()",
      [tenantId,base,included,overage,args.terms]
    );
    console.log("Configured internal billing terms for tenant",tenantId,"(not a payment)");
  } else {
    parseBillingMonth(month);
    const result=await createDraftInvoice(tenantId,month);
    console.log(JSON.stringify(result,null,2));
  }
} catch(error) {
  console.error("Billing operation failed:",error.message);
  process.exitCode=1;
} finally {await closePool();}
