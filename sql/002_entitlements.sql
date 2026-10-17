-- Incremental migration, executed after 001_market_data.sql.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL
  DEFAULT ARRAY['price','depth','history','intelligence','stream']::text[];
-- Existing keys retain broad permissions for backwards compatibility; rotate
-- or restrict them explicitly before selling commercial scoped access.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_valid_scopes;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_valid_scopes CHECK (
  cardinality(scopes) >= 1 AND
  scopes <@ ARRAY['price','depth','history','intelligence','stream']::text[]
);

CREATE INDEX IF NOT EXISTS idx_market_ticks_retention ON market_ticks (received_at);
