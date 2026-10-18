# Mushee EVM Oracle Verifier — Contract Prototype

`contracts/MusheeOracle.sol` is an **experimental** EVM price-attestation contract. The compiler test verifies bytecode generation and ABI presence; it is NOT a security audit or a deployed contract test.

## How it differs from the Node publisher protocol

The Node network uses Ed25519 publisher signatures and PostgreSQL replay counters. Ethereum virtual machines do not natively verify Ed25519 using `ecrecover`, so this Solidity contract intentionally uses a separate EVM-compatible secp256k1 publisher keyset with EIP-191 signatures.

To publish a report, operators must independently inspect the signed offchain reference feed and sign the same `{chainId,contract,symbol,priceE8,observedAt,sequence}` commitment. `submit` checks two distinct registered EVM publishers assigned to different feed-source categories, signature canonicality, timestamp freshness and monotonically increasing sequence per symbol.

Use `reportHash` from the deployed contract as the 32-byte message passed to a wallet's `signMessage(bytes)` method. The contract then hashes with the standard EIP-191 32-byte prefix before recovery. **Do not pass the hex string as UTF-8 text**; sign the 32 raw digest bytes.

## Governance and security boundaries

- The owner currently whitelists publisher addresses and sets source categories. This is centralised governance, not permissionless decentralisation.
- Duplicate source categories do not satisfy quorum.
- The contract does not attest that exchanges actually produced the underlying prices. Cryptographic publisher honesty is not the same as exchange-source authenticity.
- No price deviation calculation occurs onchain because signers agree to the SAME proposal; the offchain protocol MUST reject divergent inputs first.
- No gas-cost benchmarking, chain deployment, fuzzing, invariant tests, external audit, oracle token, staking/slashing or emergency price-stop mechanism is included.
- NEVER deploy into collateral-liquidation paths until source provenance, economic security, access control and replay protection have been independently audited.

## Deploy prerequisites

Select a testnet and deploy with two independently controlled publisher EVM keys. Validate chain IDs, freshness, price decimals, sequence gaps, standard signatures, replay and reorg response. Write deployment scripts and integration tests before a public rollout.