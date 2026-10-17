-- Execute with npm run migrate. PostgreSQL 14+ compatible.
-- Stored secrets: API keys are SHA-256 digests of cryptographically random tokens;
-- tokens are issued once by the admin CLI and NEVER stored in plaintext.

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 140),
  plan text NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'growth', 'enterprise')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 140),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  rate_limit_per_minute integer NOT NULL DEFAULT 120
    CHECK (rate_limit_per_minute BETWEEN 1 AND 20000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);

CREATE TABLE IF NOT EXISTS api_usage_minute (
  key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (key_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_window ON api_usage_minute (tenant_id, window_start DESC);

CREATE TABLE IF NOT EXISTS market_ticks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL CHECK (symbol IN ('BTC-USD','ETH-USD','SOL-USD')),
  provider text NOT NULL CHECK (provider IN ('coinbase','kraken')),
  last_price numeric(28, 10) NOT NULL CHECK (last_price > 0),
  bid_price numeric(28, 10),
  ask_price numeric(28, 10),
  source_time timestamptz,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_recent ON market_ticks (symbol, id DESC);
CREATE INDEX IF NOT EXISTS idx_ticks_provider_recent ON market_ticks (provider, symbol, id DESC);

-- An operator should configure partitioning, retention, backups and storage
-- monitoring before high-volume collection is enabled.
