# Mushee Market Data Network (MDN)

AI-ready, blockchain-independent institutional market-data API from Mushee. **Milestone 1** delivers a live REST market-data MVP. **Milestone 2A** adds a dedicated WebSocket collector, optional PostgreSQL tick history and tenant-scoped API access. **Milestone 2B** introduces source freshness checks, scoped API access, execution-intelligence metrics and maintenance utilities. Long term: licensed multi-asset data, enterprise SLA-backed feeds, independently attested oracle updates and differentiated AI market intelligence.

**Status: development MVP. Not a production-grade oracle, licensed data redistribution service, regulated benchmark or decentralised validator network. Do not use it to settle positions or liquidate collateral.**

## Milestone 2B — Institutional data quality and permissions

- Exchange observations must be fresh (default 15 seconds). Invalid, stale or implausibly future-dated observations are excluded; if all are rejected, the API returns 503 instead of fabricating prices.
- Price disagreement above 50 basis points changes reference status to `disputed`, even with two sources. Such prices must NOT be used for liquidation or settlement.
- New `GET /api/v1/execution-intelligence?symbol=ETH-USD&side=buy&notional=100000` returns venue bid/ask spreads, total displayed bid/ask depth, book imbalance, inter-venue price dispersion, concentration, indicative VWAP/slippage and explicit caution flags.
- All execution signals are transparent **descriptive statistical heuristics**, not a trained AI model or execution guarantee.
- Database-backed API keys include scopes: `price`, `depth`, `history`, `intelligence`, `stream`. Legacy pre-migration tenant keys acquire the default full scope; review and rotate old keys before production.
- `npm run migrate` applies both schema migrations in order, including the new scopes and retention index.
- Example restricted account: `npm run tenant -- --name=Firm --plan=growth --scopes=price,history --limit=120`.
- Revoke a stored key using its 17-character prefix: `npm run revoke -- --prefix=mm_live_123456789 --dry-run`; remove `--dry-run` after verification.
- Bounded tick cleanup: `RETENTION_DAYS=30 npm run retention -- --dry-run`; omit `--dry-run` to remove one bounded batch. Run periodically on a trusted scheduler and back up records before deleting.
- Persistence now retries a bounded batch after a transient DB error; queue overflow is reported. Not exactly-once delivery or a substitute for durable messaging.

### What remains before selling to institutions

Source redistribution agreements, per-tenant invoices/billing, provider sequence-gap detection, independently benchmarked predictive models, tracing and alerting, SSL termination for the stream endpoint, distributed durable messaging, continuous multiregion operations, external security audit, and independent decentralised oracle nodes.

## Milestone 2A — streaming and institutional API foundations

The system now has **two deployable processes**. The REST API (`npm start`) serves the market terminal and HTTP endpoints. The collector (`npm run stream`) maintains live public Coinbase Exchange and Kraken WebSocket connections, broadcasts normalized ticker/reference updates to subscribed client sockets and optionally writes captured ticks to PostgreSQL.

Start both processes on Node 20+:

    npm install
    npm start
    # another terminal:
    npm run stream

Streaming listens on STREAM_PORT (default 3001). The collector serves GET /healthz, plus a WebSocket at /stream/v1/tickers. WebSocket clients must send:

    {"type":"subscribe","symbols":["BTC-USD","ETH-USD"]}

Every received exchange tick contains a venue identity and timestamps; derived reference messages state whether a single remaining source is degraded. Clients receive no fabricated prices during outages. Multi-venue price observations are indicative and exclude execution fees.

To enable durable historical ticks and tenant keys, supply DATABASE_URL for **both** the REST process and collector, then execute:

    npm run migrate
    npm run tenant -- --name="Example Institution" --plan=growth --limit=500

The tenant command prints a random API key **once**. Store it securely. All paid data requests use x-api-key or Authorization: Bearer, while /api/v1/health and /api/v1/markets remain public. The same key may be sent in the WebSocket upgrade header by server-side subscribers.

In database mode, the REST and streaming services reject missing keys and meter authenticated REST requests or stream connections into api_usage_minute using PostgreSQL's atomic upserts. The basic rate limit is per-key per-minute; **streaming messages are not individually billed or quota-metered yet**.

Recorded ticker samples can be queried with:

    GET /api/v1/ticks?symbol=BTC-USD&limit=100

This endpoint returns actual persisted WebSocket observations; when no DB is configured it reports HISTORY_NOT_CONFIGURED (HTTP 503). No old data is backfilled. The database does not create history by itself: the collector must be running and the exchanges must be reachable.

**Deployment:** Vercel can serve the REST endpoint and dashboard. For continuous exchange collection, run `npm run stream` as an independent, always-on Node service with TLS termination, health monitoring and restart policy. Vercel added beta WebSocket support in 2026, but function lifetime and process-scaling semantics do not replace a permanent collector. Each collector instance creates its own exchange subscriptions and tick inserts; coordinate or shard them before multi-instance production use.

**Operational constraints:** Do not offer institutional subscriptions before obtaining upstream commercial redistribution licences, implementing per-tenant entitlements, security review, data retention/partitioning and monitoring, and establishing SLAs. The default sandbox is open when **both** API_KEY and DATABASE_URL are empty. Always configure authentication for internet-facing streaming services.

## Implemented now

- BTC/USD, ETH/USD and SOL/USD spot tickers from Coinbase Exchange and Kraken. Indicative median reference prices, source coverage and disagreement indicators.
- Real order-book snapshots from both venues. Indicative multi-venue VWAP and slippage calculations for user-specified USD notional; no fabricated execution liquidity.
- Real Coinbase historical OHLCV candles with configurable intervals.
- Historical volatility, changes and statistical anomaly flags. Optional AI text commentary via a server-side OpenAI-compatible provider. AI never generates price values.
- REST JSON, bounded inputs, upstream timeouts, short-lived cache, optional shared API key, unit and HTTP tests.
- Responsive public dashboard and deployment configuration for Vercel.

## Local development

Requires Node 20+; `npm install` installs the `pg` and `ws` runtime dependencies.

    npm install
    npm start
    # Open http://localhost:3000
    npm run check
    npm test

The local development server does not automatically load .env files. Use shell environment variables or Node's --env-file option, or set environment variables in your Vercel project.

## REST API reference

| Method & route | Query | Output |
| --- | --- | --- |
| GET /api/v1/health | none | API process liveness, not source connectivity |
| GET /api/v1/markets | none | Real supported symbols and asset classes |
| GET /api/v1/price | symbol=BTC-USD | Median reference spot price and provider details |
| GET /api/v1/orderbook | symbol=BTC-USD&depth=20 | Venue-specific order books |
| GET /api/v1/liquidity | symbol=BTC-USD&side=buy&notional=100000 | Indicative multi-venue order-book execution estimate |
| GET /api/v1/history | symbol=ETH-USD&granularity=3600&limit=48 | Real Coinbase OHLCV candles |
| GET /api/v1/intelligence | symbol=SOL-USD | Historical risk metrics and optional AI commentary |
| GET /api/v1/ticks | symbol=BTC-USD&limit=100 | Persisted streaming tick observations; DATABASE_URL required |
| GET /api/v1/execution-intelligence | symbol=ETH-USD&side=buy&notional=100000 | Descriptive liquidity and market-quality signals |

    curl 'http://localhost:3000/api/v1/price?symbol=BTC-USD'
    curl 'http://localhost:3000/api/v1/liquidity?symbol=ETH-USD&side=buy&notional=100000'
    curl 'http://localhost:3000/api/v1/intelligence?symbol=SOL-USD'

## Environment configuration

Copy variables from .env.example into your deployment environment:

- API_KEY: optional shared authentication key for the data routes; use header x-api-key or Authorization: Bearer. For a public sandbox, leave unset.
- ALLOWED_ORIGINS: comma-separated allowed browser origins. In key-protected mode, CORS is disabled by default.
- AI_API_KEY: optional *server-only* key for an OpenAI-compatible model.
- AI_BASE_URL: model provider's HTTPS OpenAI-compatible API root; defaults to https://api.openai.com/v1.
- AI_MODEL: model identifier; default gpt-4.1-mini.
- PORT: local server port; default 3000.

**Paid model calls require AI_API_KEY and API_KEY or DATABASE_URL-based authentication.** AI provider failures fall back to the honest statistical-only result. Do not expose API_KEY or AI_API_KEY in public browser code.

## Deploy to Vercel

Import the repository into Vercel. The landing page lives at public/index.html and requests under /api/v1/* map to api/index.js via vercel.json. Set any secrets in Vercel's environment variable dashboard, not in Git.

No paid data-provider credentials are needed for the public crypto sandbox. Exchange APIs may be blocked or throttled in some cloud regions; source availability is reflected in responses. There is no simulated price fallback.

## Important limitations

1. Public Coinbase/Kraken data does NOT imply commercial redistribution rights or enterprise SLAs. Licence external datasets before charging institutional customers for them.
2. There is **no decentralised oracle consensus yet**. The streaming collectors are centrally operated by Mushee and read independent upstream exchanges. Multiple independent data sources are not equivalent to independently governed validator nodes.
3. The cross-venue liquidity calculations ignore exchange fees, venue entitlements, actual order routing, latency, and live market impact. Do not use as an executable price guarantee.
4. The REST in-process TTL cache is not a durable store. Database mode adds per-key minute quotas and basic usage counters; billing, entitlement scopes, key rotation/revocation tooling, abuse control and retention automation remain to be implemented.
5. Equities, forex, RWA, derivatives and commodity data are **not integrated yet**. They require sourcing, redistribution contracts, entitlements and additional engineering.
6. Production deployment requires independent testing, security auditing, independent market-data validation, feed freshness checks, resilient collectors, on-call processes, and clear methodologies.

## Roadmap

- **M1 (this branch):** live crypto spot API, order books, historical data, early analytics, optional AI commentary, tests, public dashboard and Vercel scaffold.
- **M2A (complete):** streaming ingress/egress, optional durable tick history, tenant-scoped hashed API keys and atomic request limits. **M2B (partial):** freshness filtering, scoped API keys, indicative execution-intelligence signals, key revocation and manual retention. Remaining: sequence gaps, redundant collectors, subscription billing, observability and automated retention.
- **M3:** validated proprietary liquidity models and differentiated AI risk datasets with transparent backtesting.
- **M4:** independent oracle publishers and validator operators, signed update commitments, onchain proof verification, slashing/disputes and governance.
- **M5:** commercially licensed equities, FX, commodities, rates, derivatives and RWA datasets.

This repo is named Mushee-MM and the service is branded **Mushee Market Data Network**.
