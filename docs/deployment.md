# Institutional infrastructure deployment checklist

Current software is pre-production. GitHub CI exercises a disposable PostgreSQL, not a deployed live database.

## Local end-to-end environment

Run `docker compose -f compose.dev.yml up --build -d`. This uses localhost-only ports and a development-only password. On the host, the DB is on 127.0.0.1:5544; the API on :3000; streaming on :3001.

With the container running, create a scoped tenant: `docker compose -f compose.dev.yml exec api node scripts/create-tenant.js --name=LocalPilot --scopes=price,depth,history,intelligence,stream,account`.

Copy the *single-use displayed key* to a secure password manager. Do not paste secrets into an issue, logs or public frontend. Use `curl -H 'x-api-key: YOUR_KEY' 'http://localhost:3000/api/v1/ticks?symbol=BTC-USD'`. Stream data must be flowing for rows to appear.

Check collector process health at `http://localhost:3001/healthz` and source readiness at `http://localhost:3001/readyz`. Readiness requires two fresh source observations for each currently supported symbol; if it returns 503, inspect exchange reachability and logs.

Production: replace sample database and Docker credentials, enable TLS and firewall rules, add durable backups, object storage, privacy controls, managed certificate renewals, minimum privilege database roles and alerts. Never expose streaming ports without TLS/authentication.

## Hosted deployment boundaries

Deploy frontend and REST serverless app from the GitHub repository to Vercel. It does NOT operate persistent WebSocket collectors. Host collector separately (container/VPS/orchestrator) with a protected PostgreSQL connection and network controls.

Provision a dedicated database for Mushee-MM, rather than sharing another application's production cluster or database credentials. Configure DATABASE_URL only through encrypted hosting environment settings.

Run `npm run migrate` once and verify SQL schema after backups. For cloud deployment, secure tenant tokens server-side. The current market terminal cannot call paid DB-backed APIs without an explicit customer key; build an authenticated customer portal before selling.

Check model behaviour when history is insufficient. The ML endpoint will return 422 instead of a synthetic forecast if 1-minute observations are missing or not sufficiently continuous.

## Commercial prerequisites

Pricing calculations are **preview/draft only** and do not issue invoices, charge money, compute taxes, or establish agreements. Configure amounts only from signed contracts. A billing audit trail and payment processor integration require separate work.

Before selling any exchange or vendor data obtain redistribution contracts. Independently operated oracle publishers, onchain smart contracts, external security reviews, legal/regulatory assessments and SLAs are NOT live.
