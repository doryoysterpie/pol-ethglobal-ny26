// IThresholdKMS: the custody contract that ./thresholdKMS.mjs satisfies.
// Type-only module (JSDoc @typedef; ZERO runtime — `export {}` makes it a module). Editors and
// `tsc --checkJS` consume these; they lift to .ts verbatim if a TS workspace is added.
//
// CUSTODY RULE: destructive key operations require an M-of-N (default 3-of-5) shareholder quorum —
// no single party can destroy a key (or derive after destroy). The master secret is split with real
// Shamir M-of-N (`shamirs-secret-sharing`) and reconstructed at derive-time; that reconstruction
// window is a named residual, resolved later by migrating to a threshold-ElGamal scheme. Destroy
// authorization uses real Ed25519 multi-sig; production custody is real threshold MPC/HSM with
// distributed shares.

/**
 * @typedef {Object} DestroyRequest
 * @property {string} keyIdentifier  blinded id = sha256(studentId + pepper); no plaintext id stored
 * @property {string} requestId      unique per ceremony
 * @property {string} message        exact bytes shareholders sign: `DESTROY:<keyIdentifier>:<requestId>`
 */

/**
 * @typedef {Object} ShareholderSignature
 * @property {string} shareholder  shareholder name (one of the N)
 * @property {string} signature    base64 Ed25519 signature over DestroyRequest.message
 */

/**
 * @typedef {Object} DestroyReceipt
 * @property {string}   keyIdentifier
 * @property {string[]} approvals   distinct shareholders whose signatures verified (count >= threshold)
 * @property {string}   threshold   e.g. "3-of-5"
 * @property {number}   destroyedAt unix seconds
 */

/**
 * The Institutional Threshold KMS custody contract. Satisfied by `ThresholdKMS` in ./thresholdKMS.mjs.
 *
 * @typedef {Object} IThresholdKMS
 * @property {(studentId: string) => string} keyIdentifier
 *   Blinded, non-reversible key identifier. No plaintext id is ever persisted.
 * @property {(studentId: string, lifecycleNonce: Buffer, shares?: (string|Buffer)[]) => Buffer} deriveStudentKey
 *   Reconstruct the master from M-of-N shares (defaults to KMS-held shares; pass M holder shares
 *   to model cooperation), then HKDF-SHA256(master, salt=keyIdentifier, info=lifecycleNonce) ->
 *   32-byte AES key; the reconstructed master is zeroed after use. The 32-byte lifecycleNonce is
 *   the ephemeral, irreproducible component — destroy it and the key is unrecoverable from retained
 *   state. THROWS if the identifier has been destroyed or fewer than M shares are supplied.
 * @property {() => string[]} exportShares
 *   The N master-secret shares as stable base64 strings (fixed length; index intrinsic), ordered to
 *   match the shareholder roster. Distribution payload; the LEA share is later GCP-HSM-backed.
 * @property {(shares: (string|Buffer)[]) => Buffer} reconstructMasterSecret
 *   Reconstruct the 32-byte master from >= M shares (THROWS below M). Returned buffer is the whole
 *   master in memory — caller zeroes after use (reconstruction-window residual).
 * @property {Buffer} masterSecret
 *   Getter — transiently reconstructs the master from KMS-held shares (never stored as a field).
 * @property {(studentId: string) => DestroyRequest} destroyRequest
 *   Step 1 of the destroy ceremony — the payload shareholders sign.
 * @property {(shareholderName: string, request: DestroyRequest) => ShareholderSignature} signDestroy
 *   One shareholder's Ed25519 signature (models one MPC party).
 * @property {(request: DestroyRequest, signatures: ShareholderSignature[]) => DestroyReceipt} destroyKeyIdentifier
 *   Step 2 — invalidates the key path. REQUIRES >= threshold distinct valid signatures; else THROWS.
 *   This is the gate the crypto-shred is bound to (see IShredStore.executeCryptoShred).
 * @property {(studentId: string) => boolean} isDestroyed
 * @property {string} keyVersionId  opaque KMS key-version handle (prod: a Cloud HSM key-version
 *   resource id); bound into each record's auditMetadata. Leaks no secret material.
 */

export {}; // type-only
