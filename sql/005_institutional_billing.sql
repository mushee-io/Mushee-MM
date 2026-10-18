-- Operator-configured commercial pricing; never invent a customer's contract.
CREATE TABLE IF NOT EXISTS tenant_billing_pricing (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  base_fee_cents bigint NOT NULL CHECK(base_fee_cents>=0),
  included_requests bigint NOT NULL CHECK(included_requests>=0),
  overage_per_thousand_cents bigint NOT NULL CHECK(overage_per_thousand_cents>=0),
  terms_reference text CHECK(length(terms_reference)<=200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month text NOT NULL CHECK(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  requests bigint NOT NULL CHECK(requests>=0),
  base_fee_cents bigint NOT NULL CHECK(base_fee_cents>=0),
  overage_cents bigint NOT NULL CHECK(overage_cents>=0),
  total_cents bigint NOT NULL CHECK(total_cents>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,month),
  CHECK(period_end>period_start)
);
CREATE INDEX IF NOT EXISTS idx_billing_tenant_month ON billing_drafts(tenant_id,month DESC);
