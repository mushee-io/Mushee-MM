import test from "node:test";
import assert from "node:assert/strict";
import {parseBillingMonth,calculateBill} from "../lib/billing.js";

test("billing period uses exact UTC monthly boundaries, including leap years",()=>{
  const p=parseBillingMonth("2024-02");
  assert.equal(p.start,"2024-02-01T00:00:00.000Z");
  assert.equal(p.end,"2024-03-01T00:00:00.000Z");
  assert.throws(()=>parseBillingMonth("2026-13"),/INVALID_BILLING_MONTH/);
  assert.throws(()=>parseBillingMonth("2026-2"),/INVALID_BILLING_MONTH/);
});
test("integer-cents billing rounds up each incremental thousand requests",()=>{
  assert.deepEqual(calculateBill({
    requests:100001,baseFeeCents:20000,
    includedRequests:100000,overagePerThousandCents:120
  }),{
    currency:"USD",requests:100001,includedRequests:100000,overageRequests:1,
    billableOverageUnits:1,baseFeeCents:20000,overageCents:120,totalCents:20120
  });
  assert.equal(calculateBill({
    requests:1,baseFeeCents:20000,includedRequests:1000,overagePerThousandCents:120
  }).totalCents,20000);
});
test("unsafe prices and counters cannot overflow or go negative",()=>{
  assert.throws(()=>calculateBill({
    requests:-1,baseFeeCents:0,includedRequests:0,overagePerThousandCents:1
  }),/INVALID_BILLING_CONFIG/);
  assert.throws(()=>calculateBill({
    requests:9999,baseFeeCents:Number.MAX_SAFE_INTEGER,
    includedRequests:0,overagePerThousandCents:9999
  }),/BILL_AMOUNT_OVERFLOW/);
});
