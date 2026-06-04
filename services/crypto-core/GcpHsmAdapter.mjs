// GcpHsmAdapter: real external share custody via Google Cloud KMS. Hackathon v0.
//
// DORMANT BY DEFAULT. This file is only ever loaded via dynamic import in thresholdKMS.mjs when
// USE_REAL_GCP_HSM=true. Until then `@google-cloud/kms` is NOT installed and this module is never
// resolved, so the offline baseline never touches it. Enabling it is a deliberate step
// (local mock -> paid cloud) that requires an explicit, separate decision:
//   1. npm install @google-cloud/kms
//   2. provide GCP credentials (GOOGLE_APPLICATION_CREDENTIALS / workload identity)
//   3. set USE_REAL_GCP_HSM=true plus the GCP_* env vars below
//   4. create the key ring + key with protection level HSM in GCP first
//
// HONEST FRAMING: hardware key isolation comes from the GCP key's protection level (HSM), configured
// in GCP — not from this client. Unaudited v0. Real student data is out of scope for this demo;
// this adapter only proves the HSM integration path.
//
// Satisfies the IHsmAdapter contract (see IHsmAdapter.mjs).

import { KeyManagementServiceClient } from '@google-cloud/kms';

export class GcpHsmAdapter {
  /**
   * @param {object} [cfg]
   * @param {string} [cfg.projectId]   default: process.env.GCP_PROJECT_ID
   * @param {string} [cfg.locationId]  default: process.env.GCP_LOCATION_ID
   * @param {string} [cfg.keyRingId]   default: process.env.GCP_KEY_RING_ID
   * @param {string} [cfg.cryptoKeyId] default: process.env.GCP_CRYPTO_KEY_ID
   */
  constructor(cfg = {}) {
    this.projectId = cfg.projectId ?? process.env.GCP_PROJECT_ID;
    this.locationId = cfg.locationId ?? process.env.GCP_LOCATION_ID;
    this.keyRingId = cfg.keyRingId ?? process.env.GCP_KEY_RING_ID;
    this.cryptoKeyId = cfg.cryptoKeyId ?? process.env.GCP_CRYPTO_KEY_ID;
    const missing = Object.entries({
      projectId: this.projectId,
      locationId: this.locationId,
      keyRingId: this.keyRingId,
      cryptoKeyId: this.cryptoKeyId,
    }).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      throw new Error(`GcpHsmAdapter: missing required config/env: ${missing.join(', ')}`);
    }
    this._client = new KeyManagementServiceClient();
    this.kind = 'gcp-kms';
  }

  _keyName() {
    return this._client.cryptoKeyPath(this.projectId, this.locationId, this.keyRingId, this.cryptoKeyId);
  }

  /**
   * Encrypt a base64 share via Cloud KMS. The key's protection level (HSM) is set in GCP.
   * @param {string} base64Payload
   * @returns {Promise<{adapter:string, ciphertext:string}>}
   */
  async encryptShare(base64Payload) {
    if (typeof base64Payload !== 'string') {
      throw new TypeError('encryptShare expects a base64 share string');
    }
    const [result] = await this._client.encrypt({
      name: this._keyName(),
      plaintext: Buffer.from(base64Payload, 'utf8'),
    });
    return { adapter: this.kind, ciphertext: Buffer.from(result.ciphertext).toString('base64') };
  }

  /**
   * Decrypt via Cloud KMS, returning the original base64 share string.
   * @param {{ciphertext:string}} ciphertext
   * @returns {Promise<string>}
   */
  async decryptShare(ciphertext) {
    if (!ciphertext || typeof ciphertext.ciphertext !== 'string') {
      throw new TypeError('decryptShare expects an HsmCiphertext object with a base64 ciphertext');
    }
    const [result] = await this._client.decrypt({
      name: this._keyName(),
      ciphertext: Buffer.from(ciphertext.ciphertext, 'base64'),
    });
    return Buffer.from(result.plaintext).toString('utf8');
  }
}

export default GcpHsmAdapter;
