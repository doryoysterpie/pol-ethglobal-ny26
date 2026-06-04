// Access-audit logger + Merkle batcher (tamper-evident disclosure log). Hackathon v0.
//
// Captures every data-access event with blinded actor/target hashes (no plaintext PII), then
// batches N logs into a strict binary Merkle tree and emits the bytes32 root that
// PoLAuditRegistry anchors on-chain. sha256 throughout; the contract only STORES the 32-byte root
// it is given, so the off-chain hash is our choice.
//
// In production the same root is dual-anchored to two independent destinations
// (OpenTimestamps→Bitcoin + Guardtime KSI); the Besu PoLAuditRegistry is one rung. Unaudited demo code.

import { createHash, randomBytes } from 'node:crypto';

const sha256 = (buf) => createHash('sha256').update(buf).digest();
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

export class AuditLogger {
  /** @param {string} pepper institutional pepper for blinded actor/target hashes */
  constructor(pepper) {
    if (!pepper) throw new Error('pepper required for blinded audit hashes');
    this.pepper = pepper;
    this.logs = [];
  }

  /**
   * Record one access event.
   * @param {{actorId:string, action:string, targetStudentId?:string}} e
   *   action e.g. WRITE_RECORD | READ_RECORD | SHRED_RECORD | ANCHOR_BATCH
   */
  log({ actorId, action, targetStudentId = null }) {
    if (!actorId || !action) throw new Error('actorId and action are required');
    const event = {
      timestamp: Math.floor(Date.now() / 1000),
      actor_id_hash: sha256hex(`${actorId}:${this.pepper}`),
      action,
      target_student_hash: targetStudentId ? sha256hex(`${targetStudentId}:${this.pepper}`) : null,
      nonce: randomBytes(16).toString('hex'),
    };
    this.logs.push(event);
    return event;
  }

  /** Canonical 32-byte leaf hash of one log entry (fixed key order for determinism). */
  static leafHash(event) {
    const canonical = JSON.stringify({
      timestamp: event.timestamp,
      actor_id_hash: event.actor_id_hash,
      action: event.action,
      target_student_hash: event.target_student_hash,
      nonce: event.nonce,
    });
    return sha256(Buffer.from(canonical, 'utf8'));
  }

  /**
   * Compile a batch of logs into a strict binary Merkle tree. Odd levels duplicate the last
   * node (standard). Returns the 0x-prefixed bytes32 root plus the leaves and per-level layers.
   * @param {object[]} [batch] logs to batch (defaults to all accumulated logs)
   * @returns {{root:string, count:number, leaves:string[], layers:string[][]}}
   */
  compileBatch(batch = this.logs) {
    if (!Array.isArray(batch) || batch.length === 0) throw new Error('cannot batch zero logs');
    let level = batch.map((e) => AuditLogger.leafHash(e)); // Buffer[]
    const hex = (b) => `0x${b.toString('hex')}`;
    const leaves = level.map(hex);
    const layers = [leaves];
    while (level.length > 1) {
      if (level.length % 2 === 1) level.push(level[level.length - 1]); // duplicate last
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(sha256(Buffer.concat([level[i], level[i + 1]])));
      }
      level = next;
      layers.push(level.map(hex));
    }
    return { root: hex(level[0]), count: batch.length, leaves, layers };
  }
}
