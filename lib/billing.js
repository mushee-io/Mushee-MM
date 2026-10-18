/**
 * Institutional billing draft calculations. NO credit card collection,
 * payment processor, tax compliance or accounts-receivable automation.
 * All monetary arithmetic uses integer cents.
 */
import {getPool,hasDatabase} from "./storage.js";

export function parseBillingMonth(month) {
  if(typeof month!=="string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw Error("INVALID_BILLING_MONTH");
  }
  const start=new Date(month+"-01T00:00:00.000Z");
  if(!Number.isFinite(start.getTime()))throw Error("INVALID_BILLING_MONTH");
  const next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
  return {month,start:start.toISOString(),end:next.toISOString()};
}
export function calculateBill({requests,baseFeeCents,includedRequests,overagePerThousandCents}) {
  if(![requests,baseFeeCents,includedRequests,overagePerThousandCents].every(
    v=>Number.isSafeInteger(v) && v>=0))throw Error("INVALID_BILLING_CONFIG");
  const overageRequests=Math.max(0,requests-includedRequests);
  const overageUnits=Math.ceil(overageRequests/1000);
  const overageCents=overageUnits*overagePerThousandCents;
  const totalCents=baseFeeCents+overageCents;
  if(!Number.isSafeInteger(totalCents))throw Error("BILL_AMOUNT_OVERFLOW");
  return {
    currency:"USD",requests,includedRequests,overageRequests,
    billableOverageUnits:overageUnits,baseFeeCents,overageCents,totalCents
  };
}
export async function previewBill(tenantId,month) {
  if(!hasDatabase() || !tenantId)throw Error("BILLING_DATABASE_REQUIRED");
  const period=parseBillingMonth(month);
  const db=getPool();
  const r=await db.query(
    "SELECT t.id,t.name,t.plan,b.base_fee_cents,b.included_requests,b.overage_per_thousand_cents, " +
    "(SELECT COALESCE(sum(u.request_count),0)::bigint FROM api_usage_minute u " +
    "WHERE u.tenant_id=t.id AND u.window_start >= $2::timestamptz AND u.window_start < $3::timestamptz) AS requests " +
    "FROM tenants t LEFT JOIN tenant_billing_pricing b ON b.tenant_id=t.id " +
    "WHERE t.id=$1",[tenantId,period.start,period.end]
  );
  if(r.rowCount!==1)throw Error("TENANT_NOT_FOUND");
  const data=r.rows[0];
  if(data.base_fee_cents==null)throw Error("BILLING_NOT_CONFIGURED");
  const bill=calculateBill({
    requests:Number(data.requests),baseFeeCents:data.base_fee_cents,
    includedRequests:Number(data.included_requests),
    overagePerThousandCents:data.overage_per_thousand_cents
  });
  return {
    tenantId:data.id,tenantName:data.name,plan:data.plan,
    periodStart:period.start,periodEnd:period.end,month:period.month,...bill,
    status:"PREVIEW_ONLY",paid:false,
    disclaimer:"Estimate from metered REST requests and stream connections. Excludes per-stream-message usage, VAT, discounts, applicable taxes and invoicing."
  };
}
export async function createDraftInvoice(tenantId,month) {
  const period=parseBillingMonth(month);
  if(Date.parse(period.end)>Date.now())throw Error("BILLING_PERIOD_NOT_CLOSED");
  const preview=await previewBill(tenantId,month);
  const result=await getPool().query(
    "INSERT INTO billing_drafts(tenant_id,month,period_start,period_end,requests,base_fee_cents,overage_cents,total_cents) " +
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,month) DO NOTHING RETURNING id",
    [tenantId,month,period.start,period.end,preview.requests,
      preview.baseFeeCents,preview.overageCents,preview.totalCents]
  );
  return {...preview,draftId:result.rows[0]?.id||null,created:result.rowCount===1,
    status:"DRAFT_NOT_ISSUED",paid:false};
}
export async function listBillingDrafts(tenantId) {
  if(!hasDatabase())throw Error("BILLING_DATABASE_REQUIRED");
  const r=await getPool().query(
    "SELECT month,requests,base_fee_cents AS \"baseFeeCents\", " +
    "overage_cents AS \"overageCents\",total_cents AS \"totalCents\", " +
    "created_at AS \"createdAt\" FROM billing_drafts WHERE tenant_id=$1 ORDER BY month DESC LIMIT 24",
    [tenantId]
  );
  return {
    status:"DRAFTS_ONLY",currency:"USD",drafts:r.rows,
    disclaimer:"Unissued internal draft invoices; no charges or collections have been made."
  };
}
