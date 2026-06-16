# Architecture

This document describes the threshold-custody pattern demonstrated in this
repository. It is the **hackathon demonstration scope** — an architectural pattern
shown end-to-end in a 72-hour artifact. Proof of Learning's production architecture
is governed by separately maintained decision records and is not reproduced here.

Two ground rules hold throughout:

- **Only hashes/commitments go on-chain — never personal data.**
- **The operator can never unilaterally read or destroy a record.** Custody is
  split; reading or destroying requires cooperation of a threshold of holders.

---

## 1. Components

| Component | File(s) | Role |
|---|---|---|
| Threshold KMS | `services/crypto-core/thresholdKMS.mjs`, `IThresholdKMS.mjs` | Splits the institutional master secret with Shamir M-of-N; derives per-record keys; runs the M-of-N destroy ceremony. |
| HSM adapters | `GcpHsmAdapter.mjs`, `LocalMockHsmAdapter.mjs`, `IHsmAdapter.mjs` | Wrap one key share with an external custodian. Local mock for offline dev; Google Cloud HSM for the real hardware boundary. |
| Shred store | `services/crypto-core/shredStore.mjs`, `IShredStore.mjs` | Encrypted-at-rest record vault; performs the crypto-shred bound to the KMS ceremony. |
| Audit logger | `services/audit-log/audit_logger.mjs` | Blinded access/destroy log; Merkle-batches entries into a `bytes32` root. |
| Anchor service | `services/anchor-service/anchor.mjs` | `LocalMerkleAnchor` + `DualAnchor` — commits a root to two independent destinations; verification requires both. |
| Contracts | `contracts/besu/src/*.sol` | `PoLAuditRegistry` (anchors audit-batch roots) and `CommitmentAnchor` (anchors credential commitments). On-chain, hash-only, first-write-wins. |

## 2. Data flow

### Store

1. A record is serialized and encrypted with **AES-256-GCM**.
2. The encryption key is derived as
   `HKDF-SHA256(master, salt = blindedId, info = lifecycleNonce)`, where:
   - `master` is the institutional master secret, reconstructed transiently from
     M Shamir shares and zeroed immediately after use;
   - `blindedId = sha256(studentId + institutionalPepper)` is the only
     student-derived value ever written;
   - `lifecycleNonce` is a fresh 32-byte random value, **never exported** — it is
     the "cryptographic fuse."
3. The record is stored under `blindedId`. No plaintext id or name touches disk.

### Read

Reconstruct the key (M shares + `lifecycleNonce`), AES-GCM-decrypt, and verify the
auth tag. A missing record, a shredded record, or a tampered ciphertext throws.

### Audit + anchor

Every access/destroy event is appended to the audit log with blinded actor/target
hashes. Logs are Merkle-batched into a `bytes32` root; the root is anchored
on-chain via `PoLAuditRegistry.anchorAuditBatch`. In the production design the same
root is also committed to **two independent external anchors** so a single anchor
failing does not break verifiability.

### Crypto-shred (the ceremony)

1. A destroy request is created for a record's blinded key identifier.
2. **≥ threshold (default 3-of-5) distinct shareholders** sign the request (real
   Ed25519 signatures). Fewer than the threshold is rejected.
3. On success: the KMS invalidates the key path (future derivation refused), and
   the store overwrites the `lifecycleNonce`, ciphertext, and auth tag with zero
   bytes, flipping status to `SHREDDED`.
4. The record is now **unrecoverable from retained state** — even an operator who
   still holds the master secret and a previously-scraped ciphertext cannot
   reconstruct the key, because the irreproducible `lifecycleNonce` is gone.

`tests/test_pipeline.mjs` proves exactly this, including the negative case
(2-of-5 denied) and the "master secret + retained null nonce still cannot decrypt"
assertion.

## 3. The HSM-backed share

The institutional / LEA share is wrapped by an external custodian through a single
small interface (`IHsmAdapter`: `encryptShare` / `decryptShare`):

- `LocalMockHsmAdapter` simulates the custodian with an in-process key + artificial
  latency. It provides **no** hardware isolation — it exists only to exercise the
  async/encoding/error paths offline and for free.
- `GcpHsmAdapter` performs the same operations against **Google Cloud KMS**, where
  the key's *HSM protection level* (configured in GCP) provides the hardware
  boundary. It is loaded only via dynamic import when `USE_REAL_GCP_HSM=true`, so
  the offline baseline never resolves `@google-cloud/kms`.

Two keys were provisioned at HSM protection level (resource names elided here; the
actual names are in the evidence transcript), both verified end-to-end:

- **The RSA-3072 OAEP key** (`rsa-decrypt-oaep-3072-sha256`, asymmetric *decrypt*) —
  the key `GcpHsmAdapter` actually uses. KMS exposes no asymmetric *encrypt* API, so
  `encryptShare` wraps the share **client-side** with the public key and `decryptShare`
  unwraps it **inside the HSM** via `asymmetricDecrypt`; only the private-key decrypt
  happens in hardware, which is exactly the custody property we want. The committed
  transcript (`docs/evidence/hsm-live-verification-2026-06-12.txt`) records this roundtrip
  and its Shamir 3-of-5 / 2-of-5 integration; the demonstration key has since been torn
  down, so to reproduce, provision your own HSM key and run `USE_REAL_GCP_HSM=true npm run
  test:hsm:live`.
- **A secp256k1 key** (`EC_SIGN_SECP256K1_SHA256`, asymmetric *signing*) — verified by
  a sign→verify roundtrip. This is the key that established that **Ed25519 is not
  available at HSM protection level on GCP** (rejected at create) and that **secp256k1**
  (also Ethereum's curve) is the HSM-supported signing curve.

Both are demonstration-scoped; the production signature scheme is governed separately
(ADR-0003).

## 4. On-chain anchoring

`PoLAuditRegistry` stores `batchId → merkleRoot`, operator-gated, first-write-wins,
emitting an event per anchor. `CommitmentAnchor` does the same for credential
commitments. Both store only 32-byte hashes — never personal data. They target a
permissioned, zero-gas Besu (IBFT 2.0) dev-net; a local 3-node rig is in
`contracts/besu/local/`. Tests are dependency-free Foundry (`forge test`).

## 5. Honest seams (what is mocked, and why it's labelled)

This is a v0 demonstration. The following are stated openly in the code:

- **All shares live in one process.** The KMS models M-of-N custody but holds all N
  shares itself, so it *can* reconstruct unilaterally. Real custody distributes
  shares to independent holders; the API already accepts shares passed in
  explicitly to model that.
- **The reconstruction window.** Deriving a key briefly reconstructs the whole
  master in process memory before zeroing it. Eliminating this window requires a
  true threshold scheme (e.g. threshold ElGamal) and is out of scope here.
- **On-chain anchoring is mocked in the offline demo.** `test_pipeline.mjs` uses a
  mock anchor receipt so the demo is zero-dependency; the real path is the Besu
  contract.
- **Signatures use Ed25519.** A post-quantum migration path (SPHINCS+/SLH-DSA) is
  named as a single-module seam but not implemented.

## 6. What this architecture does not include

The production education-records platform (authentication, data layer, credential
issuance / selective disclosure), the production HSM-vendor and signature-scheme
commitments, the witnessed enrollment and parent-consent ceremonies, and any
regulatory-compliance posture are **out of scope** for this demonstration and are
governed by Proof of Learning's own decision records.
