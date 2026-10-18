# Mushee MM — Independent publisher node guide

This is an **experimental** signed-oracle protocol, not yet an independently operated network or production financial benchmark. Separate operators need their own infrastructure, access to the underlying venue, cryptographic keys and client credentials.

## Operator setup

1. With a provisioned PostgreSQL database, run `npm install && npm run migrate` on the coordinator.
2. On each publisher machine run `npm run oracle:keygen -- --out=operator-a`. It creates an Ed25519 private and public key under `.keys/`; NEVER commit the private key.
3. Register the public key using `npm run oracle:register -- --name=OperatorA --publicKey=.keys/operator-a.pub.pem --sources=coinbase`. Record the returned UUID.
4. Create a restricted publishing API key with `npm run tenant -- --name=OperatorA --scopes=publish --limit=120`. Store the private key and API token securely.
5. Configure the publisher process using the variables below, and run `npm run publisher`.

    PUBLISHER_ID=<registered UUID>
    PUBLISHER_PRIVATE_KEY_FILE=./.keys/operator-a.pem
    PUBLISHER_API_KEY=<scoped API token>
    PUBLISHER_SOURCE=coinbase
    ORACLE_SUBMIT_ENDPOINT=https://YOUR_API_HOST/api/v1/oracle/reports
    PUBLISHER_MARKETS=BTC-USD,ETH-USD,SOL-USD
    PUBLISHER_INTERVAL_MS=5000
    PUBLISHER_HEALTH_PORT=3002

Provision a second **independent** operator for the Kraken feed with separate credentials and infrastructure. A single owner running two processes is not meaningfully decentralised.

## Network protocol

Reports are signed with Ed25519 over a domain-separated canonical message: `mushee-mm/oracle/attestation/v1` followed by a newline and JSON containing fields in order: `publisherId`, `symbol`, `source`, `price`, `sequence`, `sourceTime`.

- Submit with `POST /api/v1/oracle/reports` and a key scoped to `publish`.
- Read with `GET /api/v1/oracle/consensus?symbol=BTC-USD` and a key scoped to `price`.
- The coordinator verifies the signature, operator registration, source permissions, freshness and strictly increasing sequence.
- The read endpoint requires a two-operator/two-source quorum. `ATTESTED` returns a median price. `DISPUTED` and `INSUFFICIENT_QUORUM` suppress the price with HTTP 409.
- Timestamp recency is 30 seconds at submission and at consensus read. Server clocks must be synchronised.

**Security caveats:** A valid publisher signature proves the registered publisher signed a claim, NOT that an exchange itself signed or licensed the underlying data. This is not a smart-contract oracle, staking protocol, decentralised consensus chain, settlement benchmark, or independently security-audited network. Continuous collector uptime, lawful data redistribution, external operator recruitment and onchain verification remain separate work.