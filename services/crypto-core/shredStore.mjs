// Shielded record vault with crypto-shredding. Hackathon v0 demo.
//
// Adapter over a local JSON-file collection (the mock `encrypted_student_records` store).
// Self-contained; depends only on the ThresholdKMS for key derivation and the M-of-N destroy
// ceremony.
//
// Properties:
//  - Authenticated encryption at rest: AES-256-GCM (12-byte IV, 16-byte auth tag).
//  - Zero indexable PII: records are keyed by a blinded sha256(studentId + pepper); no plaintext
//    student id or name is ever written.
//  - Per-record crypto-shred: destroying the ephemeral key-derivation nonce (plus the KMS
//    M-of-N destroy ceremony) makes the record unrecoverable from retained state.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const nullHex = (byteLen) => '00'.repeat(byteLen); // 0x00… overwrite of a byteLen-byte field

export class ShredStore {
  /**
   * @param {import('./thresholdKMS.mjs').ThresholdKMS} kms
   * @param {string} file path to the JSON collection
   */
  constructor(kms, file) {
    this.kms = kms;
    this.file = file;
    this.records = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }

  _persist() { writeFileSync(this.file, JSON.stringify(this.records, null, 2)); }

  /** Blinded lookup key — the only student-derived value written to the store. */
  blindedKey(studentId) { return sha256hex(`${studentId}:${this.kms.pepper}`); }

  /**
   * Encrypt + store a record under its blinded key. Returns a non-PII envelope summary.
   * Overwrites (re-issues) any existing ACTIVE record for the same student.
   */
  putRecord(studentId, plaintextPayload) {
    const idHash = this.blindedKey(studentId);
    const lifecycleNonce = randomBytes(32);              // ephemeral, never exported
    const key = this.kms.deriveStudentKey(studentId, lifecycleNonce);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const plaintext = Buffer.from(JSON.stringify(plaintextPayload), 'utf8');
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();               // 16 bytes
      const now = Math.floor(Date.now() / 1000);
      const prev = this.records[idHash];
      this.records[idHash] = {
        student_id_hash: idHash,
        encrypted_payload: ciphertext.toString('hex'),
        iv: iv.toString('hex'),                          // 12 bytes
        auth_tag: authTag.toString('hex'),               // 16 bytes
        lifecycle_nonce: lifecycleNonce.toString('hex'), // 32 bytes — destroyed on shred
        key_status: 'ACTIVE',
        // Audit tracking: binds this record to the KMS key state + its on-chain anchor.
        auditMetadata: {
          kmsKeyVersionId: this.kms.keyVersionId,
          lastAnchoredBlock: prev?.auditMetadata?.lastAnchoredBlock ?? 0, // 0 = not yet anchored
          stateRootVersion: (prev?.auditMetadata?.stateRootVersion ?? 0) + 1,
        },
        created_at: prev?.created_at ?? now,
        updated_at: now,
      };
      this._persist();
      return { student_id_hash: idHash, key_status: 'ACTIVE', ciphertext_bytes: ciphertext.length };
    } finally {
      key.fill(0); // scrub derived key from memory regardless of success/failure
    }
  }

  /**
   * Record that this record's audit-batch root was anchored on-chain at `blockNumber` — the
   * concrete record↔anchor tie. Updates auditMetadata.lastAnchoredBlock and bumps stateRootVersion.
   * Called after the batch carrying this record's access events is anchored (e.g. by onchain_anchor).
   */
  recordAnchor(studentId, blockNumber) {
    const rec = this.records[this.blindedKey(studentId)];
    if (!rec) throw new Error('record not found');
    rec.auditMetadata.lastAnchoredBlock = blockNumber;
    rec.auditMetadata.stateRootVersion += 1;
    rec.updated_at = Math.floor(Date.now() / 1000);
    this._persist();
    return rec.auditMetadata;
  }

  /**
   * Decrypt + return the plaintext payload. Throws if the record is missing, has been
   * crypto-shredded, or fails GCM authentication (key or ciphertext altered).
   */
  getRecord(studentId) {
    const rec = this.records[this.blindedKey(studentId)];
    if (!rec) throw new Error('record not found');
    if (rec.key_status === 'SHREDDED') throw new Error('record crypto-shredded — unrecoverable');
    const key = this.kms.deriveStudentKey(studentId, Buffer.from(rec.lifecycle_nonce, 'hex'));
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(rec.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(rec.auth_tag, 'hex'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(rec.encrypted_payload, 'hex')),
        decipher.final(), // throws on auth-tag mismatch
      ]);
      return JSON.parse(plaintext.toString('utf8'));
    } finally {
      key.fill(0);
    }
  }

  /** Step 1 of the shred ceremony: get the destroy request shareholders must sign. */
  requestShred(studentId) {
    if (!this.records[this.blindedKey(studentId)]) throw new Error('record not found');
    return this.kms.destroyRequest(studentId);
  }

  /**
   * Step 2: complete the crypto-shred. Requires the KMS M-of-N destroy ceremony to pass
   * (>= threshold valid shareholder signatures over request.message). On success it:
   *   1) invalidates the key path in the KMS (future derivation refused),
   *   2) overwrites lifecycle_nonce, encrypted_payload, auth_tag with null bytes (0x00…),
   *   3) flips key_status to "SHREDDED".
   * After this the record is unrecoverable from retained state.
   * @returns {object} shred event payload (for the audit log)
   */
  cryptoShredRecord(studentId, request, signatures) {
    const idHash = this.blindedKey(studentId);
    const rec = this.records[idHash];
    if (!rec) throw new Error('record not found');
    if (rec.key_status === 'SHREDDED') return this._shredEvent(idHash, 'ALREADY_SHREDDED', null);
    if (request.keyIdentifier !== idHash) throw new Error('destroy request does not match this record');

    // 1) M-of-N ceremony — throws if fewer than threshold valid approvals.
    const destroyReceipt = this.kms.destroyKeyIdentifier(request, signatures);

    // 2) overwrite secret-bearing fields with null bytes; 3) flip status.
    const ctLen = Buffer.from(rec.encrypted_payload, 'hex').length;
    rec.encrypted_payload = nullHex(ctLen);
    rec.lifecycle_nonce = nullHex(32);
    rec.auth_tag = nullHex(16);
    rec.key_status = 'SHREDDED';
    rec.auditMetadata.stateRootVersion += 1; // the shred is itself an auditable state transition
    rec.updated_at = Math.floor(Date.now() / 1000);
    this._persist();

    return this._shredEvent(idHash, 'SHREDDED', destroyReceipt, rec.auditMetadata);
  }

  _shredEvent(idHash, status, destroyReceipt, auditMetadata = null) {
    return {
      event: 'RECORD_SHREDDED',
      student_id_hash: idHash,
      key_status: status,
      destroy_receipt: destroyReceipt,
      audit_metadata: auditMetadata,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}
