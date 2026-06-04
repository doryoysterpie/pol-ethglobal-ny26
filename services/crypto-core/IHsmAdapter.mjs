// IHsmAdapter: the external key-share custody contract shared by the HSM adapters
// (LocalMockHsmAdapter.mjs, GcpHsmAdapter.mjs). Type-only module (JSDoc @typedef; ZERO runtime —
// `export {}` makes it a module). Hackathon v0, unaudited.
//
// PURPOSE: the institutional LEA master-secret share is wrapped (encrypted) at rest by an external
// key custodian — locally SIMULATED now (LocalMockHsmAdapter), GCP Cloud HSM later (GcpHsmAdapter,
// dormant until USE_REAL_GCP_HSM=true and @google-cloud/kms is installed). Both adapters expose the
// SAME async encrypt/decrypt over a base64 share payload, so thresholdKMS.mjs can swap them behind
// one env toggle without touching its custody logic. This is the local-to-cloud seam: the mock
// proves the timing / encoding / error-handling loops locally and for free before any paid spend.

/**
 * @typedef {Object} HsmCiphertext
 * @property {string}  adapter     which adapter produced it ('local-mock' | 'gcp-kms')
 * @property {string}  ciphertext  base64 wrapped payload
 * @property {string} [iv]         base64 IV (local-mock AES-256-GCM only)
 * @property {string} [authTag]    base64 GCM auth tag (local-mock only)
 */

/**
 * The external HSM custody contract. Satisfied by LocalMockHsmAdapter and GcpHsmAdapter.
 *
 * @typedef {Object} IHsmAdapter
 * @property {(base64Payload: string) => Promise<HsmCiphertext>} encryptShare
 *   Wrap a base64 share string with the external custodian. Async (network in the real adapter).
 * @property {(ciphertext: HsmCiphertext) => Promise<string>} decryptShare
 *   Unwrap, returning the ORIGINAL base64 share string. Async. THROWS on authentication failure.
 * @property {string} kind  adapter identifier ('local-mock' | 'gcp-kms')
 */

export {}; // type-only
