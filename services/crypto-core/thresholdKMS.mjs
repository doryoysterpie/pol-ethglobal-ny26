// Institutional Threshold KMS (supporting confidentiality construction). Hackathon v0, unaudited.
//
// HONEST FRAMING: a DEMO / SCAFFOLD, not a production KMS, and not audited. It models institutional
// custody — destructive key operations require an M-of-N (default 3-of-5) shareholder quorum, so no
// single party can shred (or re-enable) a record unilaterally.
//
// WHAT IS REAL in this build: the institutional MASTER SECRET is split with real Shamir M-of-N
// (default 3-of-5) via `shamirs-secret-sharing` (CSPRNG-generated coefficients, GF(2^8),
// Buffer-native) and is reconstructed at derive-time — it is NOT retained whole as a field. The
// Ed25519 destroy-authorization multi-signature CHECK is also real.
// WHAT IS STILL MOCKED for the demo: (a) this KMS process holds all N shares itself, so it can
// reconstruct unilaterally — real custody distributes the N shares to the holders and needs M of
// them to cooperate (modeled by passing shares explicitly to deriveStudentKey); (b) the holders'
// signing identities are local Ed25519 keypairs. Do not use with real PII.
//
// RECONSTRUCTION-WINDOW RESIDUAL (named honestly): reconstructing the master puts it whole in
// operator process memory for the derive window, then it is zeroed. This build does NOT remove that
// window; eliminating it would require migrating to a true threshold-ElGamal scheme. Honest
// current-state language applies.
//
// NAMING NOTE: this encrypted store + crypto-shred is a supporting confidentiality construction for
// data at rest; it is distinct from selective disclosure, which is a separate concern.

import {
  hkdfSync, randomBytes, generateKeyPairSync,
  sign as edSign, verify as edVerify, createHash,
} from 'node:crypto';
import sss from 'shamirs-secret-sharing';

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

function makeShareholder(name) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { name, privateKey, publicKey };
}

export class ThresholdKMS {
  /**
   * @param {object} [cfg]
   * @param {Buffer} [cfg.masterSecret] 32-byte institutional master secret (mock; HSM-backed shares in prod)
   * @param {string} [cfg.pepper] institutional pepper used for blinded key identifiers
   * @param {string[]} [cfg.shareholderNames] exactly 5 shareholder names
   * @param {number} [cfg.threshold] Ed25519 destroy-ceremony approvals required (default 3)
   * @param {number} [cfg.shamirThreshold] master-secret shares required to reconstruct (default = threshold)
   */
  constructor(cfg = {}) {
    // Copy the input so we never clobber the caller's buffer when we scrub our own copy below.
    const master = Buffer.from(cfg.masterSecret ?? randomBytes(32));
    if (master.length !== 32) {
      throw new Error('masterSecret must be a 32-byte Buffer');
    }
    this.pepper = cfg.pepper ?? randomBytes(16).toString('hex');
    const names = cfg.shareholderNames ?? [
      'operator', 'lea-school', 'academic-advisor', 'provincial-trustee', 'parent-trustee',
    ];
    if (names.length !== 5) throw new Error('threshold scaffold expects exactly 5 shareholders');
    // Destroy-ceremony multisig threshold (Ed25519). Distinct mechanism from the Shamir custody
    // threshold below, though both default to 3-of-5.
    this.threshold = cfg.threshold ?? 3;
    if (this.threshold < 1 || this.threshold > names.length) throw new Error('invalid threshold');
    this.shareholders = names.map(makeShareholder);
    this._destroyed = new Set(); // destroyed (crypto-shredded) key identifiers

    // Shamir custody of the institutional master secret: N = shareholder count, M = shamirThreshold.
    this.shamirThreshold = cfg.shamirThreshold ?? this.threshold; // default 3-of-5
    if (this.shamirThreshold < 2 || this.shamirThreshold > names.length) {
      throw new Error('invalid shamirThreshold');
    }
    // Split into N shares (real Shamir, CSPRNG coefficients) and DISCARD the whole master — it is
    // never retained as a field; it exists only transiently when reconstructed. v0 NOTE: this KMS
    // holds all N shares for the demo; real custody distributes them to the holders.
    this._shares = sss.split(master, { shares: names.length, threshold: this.shamirThreshold })
      .map((s) => Buffer.from(s));
    master.fill(0); // scrub the plaintext master; from here on it must be reconstructed

    // Opaque KMS key-version handle (prod: a Cloud HSM key-version resource id). Bound into each
    // record's auditMetadata so a record is tied to the key state that derived it; leaks no secret.
    this.keyVersionId = cfg.keyVersionId ?? `mkv-${randomBytes(6).toString('hex')}`;

    // --- External HSM custody of the LEA share (optional seam) --------------------------------
    // The LEA share is the one slated for external HSM custody (GCP Cloud HSM later). The toggle
    // selects which adapter the ASYNC custody path uses; the adapter module is loaded LAZILY via
    // dynamic import (see _ensureHsm) so GcpHsmAdapter — and its uninstalled @google-cloud/kms
    // dependency — is never resolved unless USE_REAL_GCP_HSM=true. The existing SYNCHRONOUS paths
    // (deriveStudentKey, masterSecret getter) are unchanged and never touch the HSM.
    this._useRealGcpHsm = process.env.USE_REAL_GCP_HSM === 'true';
    this._leaShareIndex = Math.max(0, names.indexOf('lea-school'));
    this._gcpCfg = cfg.gcp; // optional explicit GCP config; else GcpHsmAdapter reads GCP_* env
    this._hsmReady = null;  // lazily-resolved Promise<{ adapter, leaCiphertext }>
  }

  /**
   * Export the N master-secret shares as a stable, storage-ready serialization: base64 strings,
   * fixed length for a given secret size, share index intrinsic to the bytes, ordered to match the
   * shareholder roster. This is the distribution payload — share i goes to holder i. The LEA share
   * is the one later backed by GCP Cloud HSM; the format is fixed so the HSM storage schema does
   * not change when the real share is wired in. Carries no plaintext master.
   * @returns {string[]} N base64-encoded shares
   */
  exportShares() {
    return this._shares.map((s) => Buffer.from(s).toString('base64'));
  }

  /** Normalize share inputs (base64 strings or Buffers) to Node Buffers for the Shamir lib. */
  _toShareBuffers(shares) {
    if (!Array.isArray(shares)) throw new Error('shares must be an array');
    return shares.map((s) => (Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'base64')));
  }

  /**
   * Reconstruct the 32-byte institutional master secret from M-of-N shares.
   *
   * RECONSTRUCTION-WINDOW RESIDUAL: the returned Buffer is the whole master in
   * process memory — callers MUST zero it (`buf.fill(0)`) as soon as they are done. Fewer than M
   * shares do NOT throw at the Shamir-math layer; they silently yield a WRONG secret. So this
   * method enforces the M-of-N floor itself and throws below the threshold.
   * @param {(string|Buffer)[]} shares >= shamirThreshold shares (base64 or Buffer)
   * @returns {Buffer} 32-byte reconstructed master secret (caller zeroes after use)
   */
  reconstructMasterSecret(shares) {
    const bufs = this._toShareBuffers(shares);
    if (bufs.length < this.shamirThreshold) {
      throw new Error(
        `KMS: cannot reconstruct master — ${bufs.length} shares supplied, ` +
        `need >= ${this.shamirThreshold}-of-${this.shareholders.length}`,
      );
    }
    return Buffer.from(sss.combine(bufs));
  }

  /**
   * The master secret is NOT stored as a field; this getter transiently reconstructs it from the
   * shares the KMS holds (v0 demo convenience + back-compat introspection). Every access re-opens
   * the reconstruction window — prefer deriveStudentKey, which zeroes the master for you.
   * @returns {Buffer} 32-byte master (caller zeroes after use)
   */
  get masterSecret() {
    return this.reconstructMasterSecret(this._shares);
  }

  /**
   * Lazily initialize external HSM custody of the LEA share (idempotent). Dynamically imports the
   * active adapter (mock unless USE_REAL_GCP_HSM=true), then encrypts the LEA share so its
   * plaintext lives inside the adapter's wrap. Async because adapters are async (network in the
   * real one). Returns { adapter, leaCiphertext }.
   *
   * v0 SEAM: the LEA share is ALSO still present in this._shares for the synchronous demo path — we
   * wrap a COPY here to exercise the plumbing. True HSM-only custody (LEA share removed from process
   * memory) is a later hardening step once the sync paths migrate to the async custody path.
   */
  async _ensureHsm() {
    if (!this._hsmReady) {
      this._hsmReady = (async () => {
        const mod = this._useRealGcpHsm
          ? await import('./GcpHsmAdapter.mjs')        // dynamic: @google-cloud/kms only resolved here
          : await import('./LocalMockHsmAdapter.mjs');
        const Adapter = mod.default;
        const adapter = this._useRealGcpHsm ? new Adapter(this._gcpCfg) : new Adapter();
        const leaShareB64 = Buffer.from(this._shares[this._leaShareIndex]).toString('base64');
        const leaCiphertext = await adapter.encryptShare(leaShareB64);
        return { adapter, leaCiphertext };
      })();
    }
    return this._hsmReady;
  }

  /** Which HSM adapter is active ('local-mock' until USE_REAL_GCP_HSM=true). Async (lazy init). */
  async hsmKind() {
    const { adapter } = await this._ensureHsm();
    return adapter.kind;
  }

  /**
   * Reconstruct the master secret with the LEA share fetched back through the external HSM adapter
   * (decryptShare), combined with (M-1) other in-process shares. This is the async custody path
   * that genuinely routes the LEA share through encrypt/decrypt — the synchronous
   * reconstructMasterSecret() never touches the HSM. Same reconstruction-window residual applies:
   * the returned Buffer is the whole master; caller zeroes it.
   * @returns {Promise<Buffer>} 32-byte master (caller zeroes after use)
   */
  async reconstructMasterSecretViaHsm() {
    const { adapter, leaCiphertext } = await this._ensureHsm();
    const leaShareB64 = await adapter.decryptShare(leaCiphertext); // LEA share back from HSM
    const others = this._shares
      .filter((_, i) => i !== this._leaShareIndex)
      .slice(0, this.shamirThreshold - 1)
      .map((s) => Buffer.from(s).toString('base64'));
    return this.reconstructMasterSecret([leaShareB64, ...others]); // LEA + (M-1) others = M
  }

  /**
   * Async sibling of deriveStudentKey that uses the HSM custody path (LEA share via decryptShare).
   * Behaviour otherwise matches deriveStudentKey: refuses for destroyed identifiers, validates the
   * nonce, HKDFs the reconstructed master, and zeroes it afterwards.
   * @param {string} studentId
   * @param {Buffer} lifecycleNonce 32-byte ephemeral nonce
   * @returns {Promise<Buffer>} 32-byte AES key
   */
  async deriveStudentKeyViaHsm(studentId, lifecycleNonce) {
    const id = this.keyIdentifier(studentId);
    if (this._destroyed.has(id)) {
      throw new Error(`KMS: key identifier crypto-shredded — derivation refused (${id.slice(0, 12)}…)`);
    }
    if (!Buffer.isBuffer(lifecycleNonce) || lifecycleNonce.length !== 32) {
      throw new Error('lifecycleNonce must be a 32-byte Buffer');
    }
    const master = await this.reconstructMasterSecretViaHsm(); // RECONSTRUCTION WINDOW opens
    try {
      const key = hkdfSync('sha256', master, Buffer.from(id, 'hex'), lifecycleNonce, 32);
      return Buffer.from(key);
    } finally {
      master.fill(0); // RECONSTRUCTION WINDOW closes
    }
  }

  /** Blinded, non-reversible identifier for a student's key. No plaintext id is ever stored. */
  keyIdentifier(studentId) {
    return sha256hex(`${studentId}:${this.pepper}`);
  }

  /** Public shareholder roster (names + public-key fingerprints) for governance display. */
  roster() {
    return this.shareholders.map((s) => ({
      name: s.name,
      pubKeyFingerprint: sha256hex(s.publicKey.export({ format: 'der', type: 'spki' })).slice(0, 16),
    }));
  }

  /**
   * Derive a per-record AES-256 key via the reconstruction-window model: reconstruct the master
   * from M-of-N shares, HKDF-SHA256 it (salt = blinded identifier, info = lifecycle nonce), then
   * ZERO the reconstructed master. Re-derivable ONLY with M shares + studentId + the exact 32-byte
   * lifecycleNonce. The lifecycleNonce is the ephemeral, irreproducible component: destroy it
   * (crypto-shred) and the key is unrecoverable from retained state. Refuses outright once the
   * identifier has been destroyed via the M-of-N ceremony.
   *
   * @param {string} studentId
   * @param {Buffer} lifecycleNonce 32-byte ephemeral nonce
   * @param {(string|Buffer)[]} [shares] M-of-N master shares; defaults to the KMS-held shares (v0
   *   demo). Pass M distinct holder shares to model real shareholder cooperation at derive-time.
   * @returns {Buffer} 32-byte AES key
   */
  deriveStudentKey(studentId, lifecycleNonce, shares = this._shares) {
    const id = this.keyIdentifier(studentId);
    if (this._destroyed.has(id)) {
      throw new Error(`KMS: key identifier crypto-shredded — derivation refused (${id.slice(0, 12)}…)`);
    }
    if (!Buffer.isBuffer(lifecycleNonce) || lifecycleNonce.length !== 32) {
      throw new Error('lifecycleNonce must be a 32-byte Buffer');
    }
    // RECONSTRUCTION WINDOW opens: master is whole in memory for the HKDF call, then zeroed.
    const master = this.reconstructMasterSecret(shares);
    try {
      // HKDF-SHA256: salt = blinded identifier, info = ephemeral lifecycle nonce.
      const key = hkdfSync('sha256', master, Buffer.from(id, 'hex'), lifecycleNonce, 32);
      return Buffer.from(key);
    } finally {
      master.fill(0); // RECONSTRUCTION WINDOW closes
    }
  }

  /** Build a destroy-request payload for a student; shareholders sign request.message. */
  destroyRequest(studentId) {
    const keyIdentifier = this.keyIdentifier(studentId);
    const requestId = randomBytes(16).toString('hex');
    return { keyIdentifier, requestId, message: `DESTROY:${keyIdentifier}:${requestId}` };
  }

  /** A single shareholder signs a destroy request (real Ed25519). Models one MPC party. */
  signDestroy(shareholderName, request) {
    const sh = this.shareholders.find((s) => s.name === shareholderName);
    if (!sh) throw new Error(`unknown shareholder: ${shareholderName}`);
    return {
      shareholder: shareholderName,
      signature: edSign(null, Buffer.from(request.message), sh.privateKey).toString('base64'),
    };
  }

  /**
   * Destroy (invalidate) a key identifier. Requires >= threshold valid, DISTINCT shareholder
   * signatures over request.message. After this, deriveStudentKey() refuses for that identifier.
   * @returns {{keyIdentifier:string, approvals:string[], threshold:string, destroyedAt:number}}
   */
  destroyKeyIdentifier(request, signatures) {
    if (!Array.isArray(signatures)) throw new Error('signatures must be an array');
    const valid = new Set();
    for (const { shareholder, signature } of signatures) {
      const sh = this.shareholders.find((s) => s.name === shareholder);
      if (!sh) continue;
      const ok = edVerify(null, Buffer.from(request.message), sh.publicKey, Buffer.from(signature, 'base64'));
      if (ok) valid.add(shareholder); // Set => distinct shareholders only
    }
    if (valid.size < this.threshold) {
      throw new Error(
        `KMS: destroy denied — ${valid.size}/${this.threshold} valid approvals ` +
        `(need ${this.threshold}-of-${this.shareholders.length})`,
      );
    }
    this._destroyed.add(request.keyIdentifier);
    return {
      keyIdentifier: request.keyIdentifier,
      approvals: [...valid],
      threshold: `${this.threshold}-of-${this.shareholders.length}`,
      destroyedAt: Math.floor(Date.now() / 1000),
    };
  }

  /** True once a student's key identifier has been crypto-shredded. */
  isDestroyed(studentId) {
    return this._destroyed.has(this.keyIdentifier(studentId));
  }
}
