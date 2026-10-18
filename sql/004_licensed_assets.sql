CREATE TABLE IF NOT EXISTS licensed_entitlements (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_class text NOT NULL CHECK(asset_class IN ('equity','fx','commodity','bond','derivative','rwa')),
  symbol text NOT NULL CHECK(length(symbol) BETWEEN 1 AND 40),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,asset_class,symbol)
);
