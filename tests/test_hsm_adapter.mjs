// HSM adapter bridge test (hackathon v0) — `node tests/test_hsm_adapter.mjs`.
//
// Formally proves the external-HSM custody seam that thresholdKMS.mjs uses for the LEA share:
//   A. LocalMockHsmAdapter directly: async encrypt/decrypt round-trip, the ~50ms simulated network
//      delay, ciphertext shape, and GCM auth-failure handling on a tampered payload.
//   B. ThresholdKMS async sibling path: deriveStudentKeyViaHsm / reconstructMasterSecretViaHsm
//      route the LEA share through encrypt/decrypt and yield the SAME 32-byte key/master as the
//      synchronous path; the GCP adapter stays dormant (kind === 'local-mock'); lazy init wraps the
//      LEA share exactly once (idempotent); and a crypto-shredded identifier is refused on the
//      async path too.
//
// This guards the bridge to the real GcpHsmAdapter — the mock must behave like the contract the
// real adapter will satisfy. Hackathon v0, unaudited.

import { randomBytes } from 'node:crypto';
import { ThresholdKMS } from '../services/crypto-core/thresholdKMS.mjs';
import { LocalMockHsmAdapter } from '../services/crypto-core/LocalMockHsmAdapter.mjs';

let pass = 0, fail = 0;
const check = (label, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };

// flip one byte of a base64 blob so GCM authentication must fail
const tamperB64 = (b64) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 0xff; return b.toString('base64'); };

// ---- A. LocalMockHsmAdapter in isolation -------------------------------------------------------
console.log('== A. LocalMockHsmAdapter ==');
const adapter = new LocalMockHsmAdapter();
check('adapter advertises kind = local-mock', adapter.kind === 'local-mock');

const sharePayload = randomBytes(82).toString('base64'); // shape of a real Shamir share (82 bytes)
const tEnc0 = Date.now();
const ct = await adapter.encryptShare(sharePayload);
const encMs = Date.now() - tEnc0;
console.log(`   encryptShare took ~${encMs}ms; ciphertext fields: ${Object.keys(ct).join(', ')}`);
check('encryptShare incurs the ~50ms simulated network delay (>= 45ms)', encMs >= 45);
check('ciphertext object has {adapter, iv, ciphertext, authTag}', ['adapter', 'iv', 'ciphertext', 'authTag'].every((k) => k in ct));
check('ciphertext is not the plaintext (actually encrypted)', ct.ciphertext !== sharePayload);

const tDec0 = Date.now();
const back = await adapter.decryptShare(ct);
const decMs = Date.now() - tDec0;
check('decryptShare incurs the ~50ms simulated network delay (>= 45ms)', decMs >= 45);
check('decryptShare round-trips to the original base64 payload', back === sharePayload);

let tamperThrew = false;
try { await adapter.decryptShare({ ...ct, ciphertext: tamperB64(ct.ciphertext) }); } catch { tamperThrew = true; }
check('decryptShare THROWS on tampered ciphertext (GCM auth failure)', tamperThrew);

// ---- B. ThresholdKMS async HSM custody path ----------------------------------------------------
console.log('\n== B. ThresholdKMS via-HSM path ==');
const kms = new ThresholdKMS({ pepper: 'hsm-adapter-test' });
check('hsmKind() is local-mock — GcpHsmAdapter/@google-cloud/kms dormant', (await kms.hsmKind()) === 'local-mock');

const sid = 'student-hsm-bridge-001';
const nonce = randomBytes(32);
const viaHsm = await kms.deriveStudentKeyViaHsm(sid, nonce);
const sync = kms.deriveStudentKey(sid, nonce);
check('deriveStudentKeyViaHsm returns a 32-byte AES key', Buffer.isBuffer(viaHsm) && viaHsm.length === 32);
check('via-HSM key == sync key (LEA share survived encrypt/decrypt)', Buffer.compare(viaHsm, sync) === 0);

const masterViaHsm = await kms.reconstructMasterSecretViaHsm();
check('reconstructMasterSecretViaHsm == the synchronous masterSecret getter', Buffer.compare(masterViaHsm, kms.masterSecret) === 0);
check('reconstructed master is 32 bytes', masterViaHsm.length === 32);

// Idempotent lazy init: first derive pays encrypt(50)+decrypt(50); second pays decrypt(50) only.
const kms2 = new ThresholdKMS({ pepper: 'hsm-idempotency' });
const n2 = randomBytes(32);
const f0 = Date.now(); await kms2.deriveStudentKeyViaHsm('s-first', n2); const firstMs = Date.now() - f0;
const s0 = Date.now(); await kms2.deriveStudentKeyViaHsm('s-second', n2); const secondMs = Date.now() - s0;
console.log(`   first via-HSM derive ~${firstMs}ms (encrypt+decrypt); second ~${secondMs}ms (decrypt only, share wrapped once)`);
check('first derive pays encrypt+decrypt (>= ~90ms)', firstMs >= 90);
check('second derive reuses the once-wrapped LEA share (>= 45ms and faster than first)', secondMs >= 45 && secondMs < firstMs);

// Crypto-shred consistency: the async path must refuse a destroyed identifier too.
const kms3 = new ThresholdKMS({ pepper: 'hsm-shred' });
const sid3 = 'student-to-shred';
const req = kms3.destroyRequest(sid3);
const sigs = ['operator', 'lea-school', 'academic-advisor'].map((n) => kms3.signDestroy(n, req));
kms3.destroyKeyIdentifier(req, sigs);
let refused = false;
try { await kms3.deriveStudentKeyViaHsm(sid3, randomBytes(32)); } catch { refused = true; }
check('async HSM derive refuses a crypto-shredded identifier', refused);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
