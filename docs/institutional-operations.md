# Mushee MM — Production-readiness checklist

## System processes

- REST API + market terminal: `npm start` locally; configured for deployment on Vercel through `api/index.js`.
- Streaming collector: `npm run stream` on a persistent Node host; Vercel's REST deployment does not run an always-on collector.
- Independent experimental publisher: `npm run publisher`; one per separately governed, registered source operator.
- PostgreSQL: configure a dedicated `DATABASE_URL` (NEVER reuse an unrelated production application's database without isolating credentials/schemas), and run `npm run migrate`.

## Commercial readiness gates

- Obtain upstream licensing and exchange redistribution permissions, including historical-data use rights, before selling data.
- Verify direct exchange connectivity and raw tick capture in a deployed environment; confirm wall-clock alignment, source health and spot-market access.
- Keep REST API credentials in server-side secrets; provision tenant keys with least-privilege scopes.
- Terminate TLS for WebSocket services, enforce tenant quotas for streaming message delivery and retain request logs without secrets.
- Add durable queues, partitioned historical storage, retention scheduling, backups, restoring/replay testing, source sequence tracking and monitoring.
- Audit publisher identity controls, key handling, consensus rules, signature cryptography and authorization enforcement before applying financial value to data.
- Establish SLAs, support escalation, disaster recovery, independent operators, and documented methodologies.
- Do not promise predictive AI until future out-of-sample evaluation shows real performance over baselines. Existing volatility model is a statistical research baseline.

## Minimum smoke tests

    npm install
    npm run check
    npm test
    npm run migrate
    npm start
    npm run stream

Test GET `/api/v1/health` and `/api/v1/markets`; then GET `/api/v1/price?symbol=BTC-USD`, `/api/v1/ticks?symbol=BTC-USD`, and `/api/v1/models/volatility?symbol=BTC-USD` with an authorised key. The model endpoint should return `INSUFFICIENT_HISTORY` until enough continuous 1-minute data is collected, not invent a forecast.

Do not send live secret values into version control or public CI logs. No database or cloud deployment is automatically provisioned by this code change.