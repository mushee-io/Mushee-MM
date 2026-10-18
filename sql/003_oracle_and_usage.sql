CREATE TABLE IF NOT EXISTS oracle_publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 140),
  public_key_pem text NOT NULL,
  sources text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(sources)>0 AND sources <@ ARRAY['coinbase','kraken']::text[])
);
CREATE TABLE IF NOT EXISTS oracle_publisher_cursors (
  publisher_id uuid NOT NULL REFERENCES oracle_publishers(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  last_sequence bigint NOT NULL CHECK(last_sequence>0),
  PRIMARY KEY (publisher_id,symbol)
);
CREATE TABLE IF NOT EXISTS oracle_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_id uuid NOT NULL REFERENCES oracle_publishers(id),
  symbol text NOT NULL,
  source text NOT NULL,
  price numeric(28,10) NOT NULL CHECK(price>0),
  sequence bigint NOT NULL,
  source_time timestamptz NOT NULL,
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(publisher_id,symbol,sequence)
);
CREATE INDEX IF NOT EXISTS idx_oracle_symbol_source_time ON oracle_reports(symbol,source_time DESC);
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_valid_scopes;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_valid_scopes CHECK (
  cardinality(scopes) >= 1 AND
  scopes <@ ARRAY['price','depth','history','intelligence','stream','publish','account']::text[]
);
