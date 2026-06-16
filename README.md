# Proof of Learning — Threshold Custody & Crypto-Shred Demo

**ETHGlobal New York 2026 hackathon submission.** Apache-2.0. Unaudited v0.

A demonstration of how an education-records system can be built so that **the
operator can never unilaterally read or destroy a student's records** — and so
that destroying a record (a "right to be forgotten" request) is a verifiable,
multi-party ceremony that leaves a tamper-evident, dual-anchored audit trail,
with an institutional key share held in **Google Cloud HSM**.

> This repo demonstrates an architectural *pattern*. Proof of Learning's
> production architecture is governed by separately maintained decision records
> and may use different primitives. Nothing here is ready for production or audited,
> and no real student data is used.

---

## 1. What this is

Three working pieces, wired into one end-to-end ceremony:

1. **Threshold custody** — a student record's key is protected by a master secret
   split with real **Shamir M-of-N** (default 3-of-5). No single party can read or
   destroy the record alone.
2. **HSM-backed institutional share** — one share (the institutional / LEA share)
   is wrapped by **Google Cloud HSM**, so a real institution can be a key holder
   without trusting the operator's servers with its key material.
3. **Crypto-shred + dual-anchored audit log** — a destroy request requires an
   M-of-N signature ceremony; on success the record is rendered unrecoverable from
   retained state, and the access/destroy history is Merkle-batched and anchored
   on-chain (with two independent external anchors in the production design).

## 2. The problem

Learning management systems (Canvas and its peers) centralize transcripts,
special-education records, disciplinary notes, and directly identifying data in
one place. A single breach of that central store exposes all of it — and education
records have lifetime-plus sensitivity. The structural issue is custody: the
platform operator typically *can* read everything, so a compromise of the operator
is a compromise of every record. This demo shows an architecture where that is not
true by construction.

## 3. The architectural pattern

- **Encrypt at rest, indexed by a blinded hash.** Records are AES-256-GCM
  encrypted; the store is keyed by `sha256(studentId + institutionalPepper)`, so no
  plaintext identifier or name is ever written.
- **Threshold custody of the key.** The institutional master secret is split with
  Shamir M-of-N. The per-record key is derived only by transiently reconstructing
  the master from M shares, then zeroing it. One share is held in a hardware
  security module.
- **Crypto-shred as an M-of-N ceremony.** Destroying a record requires ≥ threshold
  distinct shareholder signatures. On success the ephemeral key-derivation nonce is
  overwritten with zero bytes, the key path is invalidated, and the record becomes
  unrecoverable *from what the system retains*.
- **Dual-anchored audit log.** Every access/destroy event is logged with blinded
  hashes, Merkle-batched, and the root is anchored on-chain. The production design
  anchors each root to **two independent external destinations**
  (OpenTimestamps→Bitcoin and Guardtime KSI) so one destination failing does not
  break verifiability.

## 4. What we built — and when

> **Continuity note.** The threshold-custody foundation below — real Shamir M-of-N,
> the crypto-shred ceremony, and the anchor contracts — **predates this event** (built
> and green at 48/0 before June 12). The **in-window deliverable (June 12–14)** was the
> hardware-custody proof demonstrated live on a real Google Cloud HSM key, its
> committed reproducible evidence, and this public release.

**Foundation (predates the event):**

- Real **Shamir M-of-N** custody replacing a mock master-secret KMS.
- The **Google Cloud HSM adapter** (`GcpHsmAdapter`, RSA-OAEP share-wrapping).
- The full **crypto-shred ceremony**, end-to-end with threshold enforcement (2-of-5
  denied, 3-of-5 approved) and a proof that retained state cannot recover a shredded
  record — even for an operator holding the master secret.
- Solidity audit-batch and commitment-anchor contracts with a dependency-free Foundry
  test suite.

**Shipped in-window (June 12–14):**

- **Live Google Cloud HSM custody proof** — the adapter's RSA-OAEP wrap → in-HSM
  `asymmetricDecrypt` roundtrip, reproduced on a real HSM-protected key and composed
  with the Shamir 3-of-5 / 2-of-5 floor.
- **Committed evidence** — the gated `npm run test:hsm:live` run (9/0), recorded in the
  transcript at [`docs/evidence/hsm-live-verification-2026-06-12.txt`](./docs/evidence/hsm-live-verification-2026-06-12.txt). The demonstration key has since been torn down; to re-run, provision your own HSM key.
- **This public open-source release.**

## 5. How to run the demo

Requires Node ≥ 20.

```bash
npm install      # installs shamirs-secret-sharing only — no cloud dependency
npm run demo     # the end-to-end crypto-shred ceremony
npm test         # full offline suite: Shamir + HSM adapter + ceremony
```

The demo and tests run **entirely offline** against a local mock HSM. Enabling the
real Google Cloud HSM path is an explicit, separate step:

```bash
npm install @google-cloud/kms
export USE_REAL_GCP_HSM=true
export GCP_PROJECT_ID=...  GCP_LOCATION_ID=...  GCP_KEY_RING_ID=...  GCP_CRYPTO_KEY_ID=...
```

Smart contracts (Foundry):

```bash
cd contracts/besu && forge test
```

A local 3-node IBFT Besu rig for on-chain anchoring lives in
`contracts/besu/local/` (requires Docker).

## 6. Architecture

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │ ISSUE / STORE                                                          │
   │   record ──AES-256-GCM──▶ encrypted vault   (keyed by blinded hash)    │
   │                              ▲                                         │
   │                    per-record key                                      │
   │                              │ HKDF(master, blindedId, lifecycleNonce) │
   │            ┌─────────────────┴───────────────────┐                     │
   │            │  Threshold KMS  (Shamir M-of-N, 3/5) │                     │
   │            │   share1  share2  share3  share4  share5                  │
   │            │                     │                                      │
   │            │             ┌───────┴───────┐                             │
   │            │             │ Google Cloud  │  ◀── institutional / LEA    │
   │            │             │      HSM       │      share (hardware-held) │
   │            └─────────────┴───────────────┘                             │
   ├──────────────────────────────────────────────────────────────────────┤
   │ AUDIT                                                                  │
   │   access events ──▶ blinded log ──▶ Merkle batch ──▶ root             │
   │                                                       │                │
   │                          on-chain (PoLAuditRegistry)  ▼                │
   │            ┌──────────────────────────────────────────────────┐       │
   │            │ dual anchor:  OpenTimestamps→Bitcoin  +  KSI      │       │
   │            └──────────────────────────────────────────────────┘       │
   ├──────────────────────────────────────────────────────────────────────┤
   │ CRYPTO-SHRED  (M-of-N ceremony)                                        │
   │   destroy request ──▶ ≥3 shareholder signatures ──▶ invalidate key,    │
   │   zero the lifecycle nonce + ciphertext ──▶ record unrecoverable       │
   └──────────────────────────────────────────────────────────────────────┘
```

A polished diagram (`architecture-diagram.svg` / `.png`) accompanies this repo.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full walkthrough.

## 7. Bounty target and rationale

**Google Cloud — exclusively.** The trust model needs a hardware boundary an
institution can hold *without* trusting the operator's servers. Google Cloud HSM
provides exactly that: a key whose private material never leaves the HSM's protection
level, accessed through Cloud KMS. The `GcpHsmAdapter` wraps the institutional share
with an **RSA-3072 OAEP** HSM key — encrypting client-side with the key's public half
and unwrapping only inside the HSM via `asymmetricDecrypt`, so the operator can hand a
wrapped share to the institution but only the HSM can recover it. The wrapping key was
provisioned at HSM protection level and verified with an
end-to-end encrypt → HSM-decrypt roundtrip that also exercised the Shamir 3-of-5
reconstruction and 2-of-5 refusal in-HSM. The committed transcript
([`docs/evidence/hsm-live-verification-2026-06-12.txt`](./docs/evidence/hsm-live-verification-2026-06-12.txt))
is the record of that run; the demonstration key has since been torn down, so to
reproduce, provision your own HSM key and run `USE_REAL_GCP_HSM=true npm run test:hsm:live`.

> Note on algorithms: Google Cloud HSM does not support Ed25519 at HSM protection
> level. Share-wrapping uses RSA-OAEP (the adapter's path here); where a hardware
> *signing* key is needed, secp256k1 is the HSM-supported curve (also Ethereum's).
> These are demonstration-scoped choices; the production scheme is governed separately.

## 8. Team

Solo build. The founder is a leadership executive with 15+ years in advertising and
consulting, a dev3pack Fellow, and a published researcher (_"Is the World Ready for a
Cryptocurrency Standard?"_), with additional background in cybersecurity.

## 9. License

[Apache-2.0](./LICENSE). The explicit patent grant matters for cryptography code.
