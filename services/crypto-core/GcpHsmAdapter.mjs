// GcpHsmAdapter: real external share custody via Google Cloud KMS. Hackathon v0.
//
// DORMANT BY DEFAULT. This file is only ever loaded via dynamic import in thresholdKMS.mjs when
// USE_REAL_GCP_HSM=true. Until then `@google-cloud/kms` is NOT installed and this module is never
// resolved, so the offline baseline never touches it. Enabling it is a deliberate step
// (local mock -> paid cloud) that requires an explicit, separate decision:
//   1. npm install @google-cloud/kms
//   2. provide GCP credentials (Application Default Credentials via gcloud, or workload identity)
//   3. set USE_REAL_GCP_HSM=true plus the GCP_* env vars below. GCP_CRYPTO_KEY_ID must name an
//      asymmetric-DECRYPT RSA-OAEP key at HSM protection level; GCP_CRYPTO_KEY_VERSION defaults "1"
//   4. create that key first: rsa-decrypt-oaep-3072-sha256, purpose asymmetric-encryption, HSM
//
// WRAP MODEL: KMS has no asymmetric "encrypt" API. `encryptShare` wraps the share locally with the
// key's PUBLIC key (RSA-OAEP); `decryptShare` unwraps INSIDE the HSM via `asymmetricDecrypt`. Only
// the private-key decrypt happens in hardware — which is exactly the property we want (the operator
// can wrap a share for the institution, but only the HSM can unwrap it).
//
// HONEST FRAMING: hardware key isolation comes from the GCP key's protection level (HSM), configured
// in GCP — not from this client. Unaudited v0. Real student data is out of scope for this demo;
// this adapter only proves the HSM integration path.
//
// Satisfies the IHsmAdapter contract (see IHsmAdapter.mjs).

import { KeyManagementServiceClient } from '@google-cloud/kms';
import crypto from 'node:crypto';

export class GcpHsmAdapter {
  /**
   * @param {object} [cfg]
   * @param {string} [cfg.projectId]    default: process.env.GCP_PROJECT_ID
   * @param {string} [cfg.locationId]   default: process.env.GCP_LOCATION_ID
   * @param {string} [cfg.keyRingId]    default: process.env.GCP_KEY_RING_ID
   * @param {string} [cfg.cryptoKeyId]  default: process.env.GCP_CRYPTO_KEY_ID  (asymmetric-decrypt RSA-OAEP)
   * @param {string} [cfg.keyVersion]   default: process.env.GCP_CRYPTO_KEY_VERSION ?? '1'
   */
  constructor(cfg = {}) {
    this.projectId = cfg.projectId ?? process.env.GCP_PROJECT_ID;
    this.locationId = cfg.locationId ?? process.env.GCP_LOCATION_ID;
    this.keyRingId = cfg.keyRingId ?? process.env.GCP_KEY_RING_ID;
    this.cryptoKeyId = cfg.cryptoKeyId ?? process.env.GCP_CRYPTO_KEY_ID;
    this.keyVersion = cfg.keyVersion ?? process.env.GCP_CRYPTO_KEY_VERSION ?? '1';
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
    this._pub = null; // cached { pem, oaepHash }
  }

  _keyVersionName() {
    return this._client.cryptoKeyVersionPath(
      this.projectId, this.locationId, this.keyRingId, this.cryptoKeyId, this.keyVersion,
    );
  }

  /** Fetch + cache the public key once. OAEP digest is encoded in the algorithm name. */
  async _publicKey() {
    if (!this._pub) {
      const [pk] = await this._client.getPublicKey({ name: this._keyVersionName() });
      const algo = String(pk.algorithm);
      const oaepHash = /SHA512/.test(algo) ? 'sha512' : /SHA1/.test(algo) ? 'sha1' : 'sha256';
      this._pub = { pem: pk.pem, oaepHash };
    }
    return this._pub;
  }

  /**
   * Wrap a base64 share string with the HSM key's PUBLIC key (RSA-OAEP), client-side.
   * @param {string} base64Payload
   * @returns {Promise<{adapter:string, ciphertext:string}>}
   */
  async encryptShare(base64Payload) {
    if (typeof base64Payload !== 'string') {
      throw new TypeError('encryptShare expects a base64 share string');
    }
    const { pem, oaepHash } = await this._publicKey();
    const ciphertext = crypto.publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
      Buffer.from(base64Payload, 'utf8'),
    );
    return { adapter: this.kind, ciphertext: ciphertext.toString('base64') };
  }

  /**
   * Unwrap inside the HSM via asymmetricDecrypt, returning the original base64 share string.
   * @param {{ciphertext:string}} ciphertext
   * @returns {Promise<string>}
   */
  async decryptShare(ciphertext) {
    if (!ciphertext || typeof ciphertext.ciphertext !== 'string') {
      throw new TypeError('decryptShare expects an HsmCiphertext object with a base64 ciphertext');
    }
    const [result] = await this._client.asymmetricDecrypt({
      name: this._keyVersionName(),
      ciphertext: Buffer.from(ciphertext.ciphertext, 'base64'),
    });
    return Buffer.from(result.plaintext).toString('utf8');
  }
}

export default GcpHsmAdapter;
