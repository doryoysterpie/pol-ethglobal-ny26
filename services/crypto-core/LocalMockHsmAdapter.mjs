// LocalMockHsmAdapter: offline simulation of external HSM share custody. Hackathon v0.
//
// HONEST FRAMING: this is NOT an HSM and provides NO hardware key isolation. It wraps the LEA share
// with a dummy in-process AES-256-GCM key (crypto.randomBytes) purely to exercise the adapter
// plumbing — async timing, base64 encode/decode loops, GCM auth-failure handling — locally and for
// free, BEFORE any GCP spend (local -> paid-cloud). The dummy key lives in the
// same process as the share it "protects", so this provides zero real custody separation. Do not
// use with real PII. The real isolation arrives only with GcpHsmAdapter + a Cloud HSM-protected key.
//
// Satisfies the IHsmAdapter contract (see IHsmAdapter.mjs).

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class LocalMockHsmAdapter {
  /**
   * @param {object} [cfg]
   * @param {Buffer} [cfg.dummyKey] 32-byte dummy AES key (default: random per instance)
   * @param {number} [cfg.delayMs]  artificial async delay to simulate network round-trips (default 50)
   */
  constructor(cfg = {}) {
    this._dummyKey = cfg.dummyKey ?? randomBytes(32); // dummy — NOT hardware-isolated
    if (!Buffer.isBuffer(this._dummyKey) || this._dummyKey.length !== 32) {
      throw new Error('dummyKey must be a 32-byte Buffer');
    }
    this._delayMs = cfg.delayMs ?? 50;
    this.kind = 'local-mock';
  }

  /**
   * Wrap a base64 share string. Returns an HsmCiphertext object (base64 fields).
   * @param {string} base64Payload
   * @returns {Promise<{adapter:string, iv:string, ciphertext:string, authTag:string}>}
   */
  async encryptShare(base64Payload) {
    if (typeof base64Payload !== 'string') {
      throw new TypeError('encryptShare expects a base64 share string');
    }
    await delay(this._delayMs); // simulate network async
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this._dummyKey, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(base64Payload, 'utf8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      adapter: this.kind,
      iv: iv.toString('base64'),
      ciphertext: ct.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Unwrap, returning the original base64 share string. Throws on GCM auth failure.
   * @param {{iv:string, ciphertext:string, authTag:string}} ciphertext
   * @returns {Promise<string>}
   */
  async decryptShare(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'object') {
      throw new TypeError('decryptShare expects an HsmCiphertext object');
    }
    const { iv, ciphertext: ct, authTag } = ciphertext;
    await delay(this._delayMs); // simulate network async
    const decipher = createDecipheriv('aes-256-gcm', this._dummyKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64')),
      decipher.final(), // throws on auth-tag mismatch
    ]);
    return pt.toString('utf8'); // the original base64 share string
  }
}

export default LocalMockHsmAdapter;
