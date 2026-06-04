// IShredStore + ShredStoreRecord: the storage / crypto-shred contract that
// ./shredStore.mjs satisfies. Type-only JSDoc module (ZERO runtime). Concrete impl: ./shredStore.mjs.
//
// AT-REST DISCIPLINE: zero plaintext PII; blinded index only; AES-256-GCM; one ephemeral
// lifecycle nonce per record (the "cryptographic fuse") that crypto-shred overwrites with
// zero-bytes. Crypto-shred is BOUND to the IThresholdKMS M-of-N quorum (see executeCryptoShred).

/** @typedef {import('./IThresholdKMS.mjs').DestroyRequest} DestroyRequest */
/** @typedef {import('./IThresholdKMS.mjs').ShareholderSignature} ShareholderSignature */

/**
 * Encrypted payload. NOTE: persisted as hex strings in the JSON store (Buffers in memory) —
 * the user-supplied schema used Buffers; hex is the at-rest serialization.
 * @typedef {Object} EncryptedData
 * @property {string} ciphertext  AES-256-GCM ciphertext (hex)
 * @property {string} iv          12-byte IV (hex)
 * @property {string} authTag     16-byte GCM auth tag (hex)
 */

/**
 * Audit tracking — EMITTED by shredStore.mjs on every record. Ties a record to the
 * KMS key state (kmsKeyVersionId) and the on-chain anchor (lastAnchoredBlock, set via recordAnchor();
 * stateRootVersion bumps on every state transition: store, anchor, shred).
 * @typedef {Object} AuditMetadata
 * @property {string} kmsKeyVersionId    KMS key/version that derived this record's key
 * @property {number} lastAnchoredBlock  block in which this record's audit-batch root was anchored
 * @property {number} stateRootVersion   monotonically increasing batch / state-root version
 */

/**
 * A record at rest. Field names reconciled to the user's schema; (impl field) notes the current
 * on-disk key where it differs.
 * @typedef {Object} ShredStoreRecord
 * @property {string} blindedIndex    primary key = sha256(studentId + institutionalPepper). (impl: student_id_hash)
 * @property {EncryptedData} encryptedData  (impl: flat encrypted_payload / iv / auth_tag)
 * @property {string} lifecycleNonce  32-byte ephemeral salt (hex). Zero-overwritten on crypto-shred.
 * @property {('ACTIVE'|'SHREDDED')} keyStatus  (impl: key_status)
 * @property {number} createdAt       (impl: created_at)
 * @property {number} updatedAt       (impl: updated_at)
 * @property {AuditMetadata} auditMetadata  populated on every record (see above).
 */

/**
 * @typedef {Object} ShredResult
 * @property {boolean} success
 * @property {string}  shreddedIndex     the blindedIndex shredded
 * @property {number}  overwrittenBytes  bytes zero-overwritten (nonce + ciphertext + authTag)
 */

/**
 * The shielded vault + crypto-shred contract. Satisfied by `ShredStore` in ./shredStore.mjs.
 * Method names follow the user's interface; (impl) notes the concrete method where it differs.
 *
 * @typedef {Object} IShredStore
 * @property {(studentId: string, plaintextPayload: any) => {student_id_hash:string, key_status:string, ciphertext_bytes:number}} storeRecord
 *   Encrypt + persist under the blinded index; no plaintext PII written. (impl: putRecord)
 * @property {(studentId: string) => any} getRecord
 *   Decrypt + GCM-authenticate; THROWS if missing, SHREDDED, or tampered. (Keyed by studentId so the
 *   blinded index + key can be derived; a pure blindedIndex variant is a possible refinement.)
 * @property {(studentId: string) => DestroyRequest} requestShred
 *   Step 1 — the KMS destroy request shareholders sign.
 * @property {(studentId: string, request: DestroyRequest, signatures: ShareholderSignature[]) => ShredResult} executeCryptoShred
 *   Step 2 (impl: cryptoShredRecord). REQUIRES the M-of-N quorum: forwards `signatures` to
 *   IThresholdKMS.destroyKeyIdentifier (THROWS if < threshold), THEN zero-overwrites lifecycleNonce
 *   + ciphertext + authTag and flips keyStatus to "SHREDDED". The quorum binding is non-negotiable —
 *   a blindedIndex-only shred with no approval would bypass custody and is rejected by design.
 */

export {}; // type-only
