# Mushee Market Data Network (MDN)

AI-ready, blockchain-independent institutional market-data API from Mushee. **Milestone 1** is an executable MVP built around actual public spot-market feeds. Long term: licensed multi-asset data, enterprise SLA-backed feeds, independently attested oracle updates and differentiated AI market intelligence.

**Status: development MVP. Not a production-grade oracle, licensed data redistribution service, regulated benchmark or decentralised validator network. Do not use it to settle positions or liquidate collateral.**

## Implemented now

- BTC/USD, ETH/USD and SOL/USD spot tickers from Coinbase Exchange and Kraken. Indicative median reference prices, source coverage and disagreement indicators.
- Real order-book snapshots from both venues. Indicative multi-venue VWAP and slippage calculations for user-specified USD notional; no fabricated execution liquidity.
- Real Coinbase historical OHLCV candles with configurable intervals.
- Historical volatility, changes and statistical anomaly flags. Optional AI text commentary via a server-side OpenAI-compatible provider. AI never generates price values.
- REST JSON, bounded inputs, upstream timeouts, short-lived cache, optional shared API key, unit and HTTP tests.
- Responsive public dashboard and deployment configuration for Vercel.

## Local development

Requires Node 20+ and no third-party npm packages.

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

**Paid model calls require BOTH AI_API_KEY and API_KEY.** AI provider failures fall back to the honest statistical-only result. Do not expose API_KEY or AI_API_KEY in public browser code.

## Deploy to Vercel

Import the repository into Vercel. The landing page lives at public/index.html and requests under /api/v1/* map to api/index.js via vercel.json. Set any secrets in Vercel's environment variable dashboard, not in Git.

No paid data-provider credentials are needed for the public crypto sandbox. Exchange APIs may be blocked or throttled in some cloud regions; source availability is reflected in responses. There is no simulated price fallback.

## Important limitations

1. Public Coinbase/Kraken data does NOT imply commercial redistribution rights or enterprise SLAs. Licence external datasets before charging institutional customers for them.
2. There is **no decentralised oracle consensus yet**. Multiple independent data sources are not equivalent to independently governed validator nodes.
3. The cross-venue liquidity calculations ignore exchange fees, venue entitlements, actual order routing, latency, and live market impact. Do not use as an executable price guarantee.
4. The in-process TTL cache is not a persistent data store, nor a distributed rate limiter. Before launching a public paid API, add shared quotas, tenant-specific API keys, usage accounting, revocation and billing.
5. Equities, forex, RWA, derivatives and commodity data are **not integrated yet**. They require sourcing, redistribution contracts, entitlements and additional engineering.
6. Production deployment requires independent testing, security auditing, independent market-data validation, feed freshness checks, resilient collectors, on-call processes, and clear methodologies.

## Roadmap

- **M1 (this branch):** live crypto spot API, order books, historical data, early analytics, optional AI commentary, tests, public dashboard and Vercel scaffold.
- **M2:** streaming ingress/egress, durable tick history, market surveillance, source sequence-gap checking, multiregion collection, enterprise auth/usage billing.
- **M3:** validated proprietary liquidity models and differentiated AI risk datasets with transparent backtesting.
- **M4:** independent oracle publishers and validator operators, signed update commitments, onchain proof verification, slashing/disputes and governance.
- **M5:** commercially licensed equities, FX, commodities, rates, derivatives and RWA datasets.

This repo is named Mushee-MM and the service is branded **Mushee Market Data Network**.
