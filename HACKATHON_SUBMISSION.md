# Hackathon Submission — ETHGlobal New York 2026

## What this is

A demonstration of the **threshold-custody pattern** used by Proof of Learning: an
institution can hold a share of the key that protects a student's records, with a
share backed by **Google Cloud HSM**, so the operator can never unilaterally
decrypt — and a record can be **crypto-shredded** through an M-of-N ceremony that
leaves a tamper-evident, dual-anchored audit trail.

This repository is a self-contained 72-hour artifact. It demonstrates an
architectural *pattern*; Proof of Learning's production architecture is governed
by separately maintained decision records and may use different primitives.

## Bounty target

**Google Cloud — and only Google Cloud.** The submission is built specifically
around Google Cloud HSM as the hardware trust anchor for an institutional key
share: a Cloud HSM-protected key gives a real institution a custody role without
requiring it to trust the operator's infrastructure with key material. The
`GcpHsmAdapter` (in `services/crypto-core/`) integrates Cloud KMS directly: it
wraps the institutional share client-side with the key's public half and unwraps it
inside the HSM via `asymmetricDecrypt`, so only the private-key decrypt happens in
hardware. The integration was verified end-to-end against a real HSM-protected
**RSA-3072 OAEP** key (`pol-lea-share-encrypt-hsm`) in `northamerica-northeast1` —
reproducible via `USE_REAL_GCP_HSM=true npm run test:hsm:live`, with a committed
transcript at [`docs/evidence/hsm-live-verification-2026-06-12.txt`](./docs/evidence/hsm-live-verification-2026-06-12.txt).
We are not pursuing other bounties.

> Note on the algorithm: the HSM-backed **custody** share is wrapped with
> **RSA-3072 OAEP** — KMS exposes no asymmetric *encrypt* API, so the share is
> wrapped client-side with the public key and unwrapped in-HSM via
> `asymmetricDecrypt`. Separately, while provisioning we confirmed Google Cloud HSM
> does **not** offer Ed25519 at HSM protection level; its supported signing curve is
> **secp256k1** (also Ethereum's). That secp256k1 key was a secondary signing-key
> finding — **not** the custody primitive. Both choices are demonstration-scoped;
> Proof of Learning's production signature scheme is governed by its own decision
> records.

## How to run

```bash
npm install          # installs shamirs-secret-sharing (zero cloud deps)
npm run demo         # the end-to-end crypto-shred ceremony
npm test             # the full offline suite (Shamir + HSM adapter + ceremony)
```

Everything above runs **offline** with a local mock HSM. Enabling the real Google
Cloud HSM path is an explicit opt-in:

```bash
npm install @google-cloud/kms
export USE_REAL_GCP_HSM=true
export GCP_PROJECT_ID=... GCP_LOCATION_ID=... GCP_KEY_RING_ID=... GCP_CRYPTO_KEY_ID=...
# then run the via-HSM derivation path
```

Solidity contracts (audit-batch anchoring) build and test with Foundry:

```bash
cd contracts/besu && forge test
```

## Demo video

- Link: _to be added at submission time_
- Length: 3–5 minutes (problem → architecture → live ceremony → repo + bounty)

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the diagram in the repository root.

## What this does NOT claim

- It is **not** ready for production and **not** audited.
- It does **not** demonstrate Proof of Learning's full education-records platform,
  its production signature scheme, its production HSM vendor commitment, or any
  regulatory-compliance posture.
- It uses no real student data.

## Team

- _Add team member names / roles / handles here before submission._

## License

[Apache-2.0](./LICENSE).
