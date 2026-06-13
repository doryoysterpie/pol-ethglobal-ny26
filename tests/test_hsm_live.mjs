// LIVE Google Cloud HSM integration test (hackathon v0, unaudited) — gated, opt-in.
//
// This is the reproducible evidence behind the HSM claim. It is DELIBERATELY EXCLUDED from the
// offline `npm test` baseline: it makes real GCP Cloud KMS calls (getPublicKey + asymmetricDecrypt)
// and therefore needs `npm install @google-cloud/kms`, Application Default Credentials, and an
// ENABLED key version. With USE_REAL_GCP_HSM unset it prints a skip line and exits 0, so it can
// never pollute or break the 48/0 offline baseline.
//
// Run it:
//   npm install @google-cloud/kms
//   USE_REAL_GCP_HSM=true \
//   GCP_PROJECT_ID=<your-project> GCP_LOCATION_ID=<your-region> \
//   GCP_KEY_RING_ID=<your-key-ring> GCP_CRYPTO_KEY_ID=<your-rsa-oaep-key> \
//   GCP_CRYPTO_KEY_VERSION=<enabled version> npm run test:hsm:live
//
// What it proves: (A) the GcpHsmAdapter RSA-OAEP wrap -> in-HSM asymmetricDecrypt roundtrip on a
// real HSM-protected key; (B) that this live unwrap composes with real Shamir M-of-N — a 3-of-5
// reconstruction routing the LEA share through the HSM equals the synchronous master, and the
// 2-of-5 floor still refuses even when handed a genuinely HSM-unwrapped share.

import { randomBytes } from 'node:crypto';

if (process.env.USE_REAL_GCP_HSM !== 'true') {
  console.log('skipped: set USE_REAL_GCP_HSM=true to run the live GCP HSM test');
  console.log('  (needs `npm install @google-cloud/kms`, ADC creds, and an ENABLED key version;');
  console.log('   intentionally excluded from the offline `npm test` baseline — see README §7)');
  process.exit(0);
}

const need = ['GCP_PROJECT_ID', 'GCP_LOCATION_ID', 'GCP_KEY_RING_ID', 'GCP_CRYPTO_KEY_ID', 'GCP_CRYPTO_KEY_VERSION'];
const missingEnv = need.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.log(`ERROR: USE_REAL_GCP_HSM=true but missing env: ${missingEnv.join(', ')}`);
  process.exit(1);
}
console.log(`target: ${process.env.GCP_PROJECT_ID}/${process.env.GCP_LOCATION_ID}/`
  + `${process.env.GCP_KEY_RING_ID}/${process.env.GCP_CRYPTO_KEY_ID} v${process.env.GCP_CRYPTO_KEY_VERSION}`);

// Imported only past the flag guard, so a SDK-less / flag-off run never resolves @google-cloud/kms.
const { ThresholdKMS } = await import('../services/crypto-core/thresholdKMS.mjs');
const { default: GcpHsmAdapter } = await import('../services/crypto-core/GcpHsmAdapter.mjs');

let pass = 0, fail = 0;
const check = (label, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };

// ---- A. GcpHsmAdapter live RSA-OAEP roundtrip --------------------------------------------------
console.log('== A. GcpHsmAdapter live RSA-OAEP roundtrip ==');
const adapter = new GcpHsmAdapter();
check('adapter advertises kind = gcp-kms', adapter.kind === 'gcp-kms');

const share = randomBytes(82).toString('base64'); // shape of a real Shamir share (82 bytes)
const ct = await adapter.encryptShare(share);      // getPublicKey + client-side RSA-OAEP wrap
check('ciphertext object has {adapter, ciphertext}', ['adapter', 'ciphertext'].every((k) => k in ct));
check('ciphertext is not the plaintext (actually wrapped)', ct.ciphertext !== share);
const back = await adapter.decryptShare(ct);       // asymmetricDecrypt INSIDE the HSM
check('decryptShare unwraps in-HSM back to the original share bytes', back === share);

// ---- B. Threshold custody composing with the live HSM unwrap -----------------------------------
console.log('\n== B. Threshold custody with live HSM unwrap ==');
const kms = new ThresholdKMS({ masterSecret: randomBytes(32), pepper: 'hsm-live-test' });
check('hsmKind() is gcp-kms (real adapter active)', (await kms.hsmKind()) === 'gcp-kms');

const masterViaHsm = await kms.reconstructMasterSecretViaHsm(); // LEA via live HSM + (M-1) others
const masterSync = kms.masterSecret;
check('3-of-5 reconstruct (LEA share via live HSM) == synchronous master', Buffer.compare(masterViaHsm, masterSync) === 0);
check('reconstructed master is 32 bytes', masterViaHsm.length === 32);
masterViaHsm.fill(0); masterSync.fill(0);

const sid = 'student-hsm-live-001';
const nonce = randomBytes(32);
const keyViaHsm = await kms.deriveStudentKeyViaHsm(sid, nonce);
const keySync = kms.deriveStudentKey(sid, nonce);
check('deriveStudentKeyViaHsm == synchronous derive (HSM in the key path)', Buffer.compare(keyViaHsm, keySync) === 0);

// 2-of-5 floor must refuse even when handed a genuinely HSM-unwrapped LEA share (public-API only).
const leaIdx = kms.roster().findIndex((r) => r.name === 'lea-school');
const allShares = kms.exportShares();
const wrapped = await adapter.encryptShare(allShares[leaIdx]); // live wrap of the LEA share
const leaFromHsm = await adapter.decryptShare(wrapped);        // live in-HSM unwrap
const oneOther = allShares[(leaIdx + 1) % allShares.length];
let floorThrew = false;
try { kms.reconstructMasterSecret([leaFromHsm, oneOther]); } catch { floorThrew = true; }
check('2-of-5 refused even with the live HSM-unwrapped LEA share (Shamir floor holds)', floorThrew);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
