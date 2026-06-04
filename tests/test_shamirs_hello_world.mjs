// TEMPORARY validation harness (hackathon v0) — `node tests/test_shamirs_hello_world.mjs`.
//
// Proves the shamirs-secret-sharing integration in services/crypto-core/thresholdKMS.mjs does what
// we claim, with byte-level evidence (no lossy string coercion of a 256-bit key):
//   1. split a 256-bit AES master key into 5 shares,
//   2. reconstruct EXACTLY from 3 shares (byte-identical to the original),
//   3. fail to reconstruct from 2 shares (KMS guard THROWS; and the raw Shamir math silently
//      yields a WRONG value — fewer-than-threshold does not error at the math layer),
//   4. derive the same per-record key whether shares are passed explicitly (3) or defaulted,
//   5. log byte lengths of inputs and outputs throughout.
//
// This is a throwaway integration check, not part of the committed suite (test_pipeline.mjs is the
// E2E). Delete or keep per founder's call before commit.

import { randomBytes } from 'node:crypto';
import { combine as rawCombine } from 'shamirs-secret-sharing';
import { ThresholdKMS } from '../services/crypto-core/thresholdKMS.mjs';

let pass = 0, fail = 0;
const check = (label, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };
const hexLen = (b) => `${b.length} bytes`;

// --- Setup: a known 256-bit AES master key so we can assert byte-exact reconstruction ----------
const masterKey = randomBytes(32);
console.log('== INPUT ==');
console.log(`master key: ${hexLen(masterKey)} | isBuffer=${Buffer.isBuffer(masterKey)} | ${masterKey.toString('hex').slice(0, 16)}…`);
check('master key is exactly 256 bits (32 bytes)', masterKey.length === 32);

const kms = new ThresholdKMS({ masterSecret: masterKey, pepper: 'hello-world-pepper' });

// The constructor copies + scrubs its own master; the caller's buffer must be untouched.
check('constructor did NOT clobber the caller-supplied master buffer', masterKey.length === 32 && !/^0+$/.test(masterKey.toString('hex')));

// --- 1. Split into 5 shares ---------------------------------------------------------------------
console.log('\n== 1. SPLIT (3-of-5) ==');
const shares = kms.exportShares();
check('produced exactly 5 shares', shares.length === 5);
const shareBytes = shares.map((s) => Buffer.from(s, 'base64').length);
console.log(`share serialization: base64 strings len=${shares[0].length}; decoded byte-lengths=[${shareBytes.join(', ')}]`);
check('all shares decode to a stable, equal byte length (deterministic format)', new Set(shareBytes).size === 1);

// --- 2. Reconstruct from exactly 3 --------------------------------------------------------------
console.log('\n== 2. RECONSTRUCT from 3 shares ==');
const three = [shares[0], shares[2], shares[4]];
const recon3 = kms.reconstructMasterSecret(three);
console.log(`reconstructed: ${hexLen(recon3)} | ${recon3.toString('hex').slice(0, 16)}…`);
check('reconstruction from 3 shares is 32 bytes', recon3.length === 32);
check('reconstruction from 3 shares is BYTE-IDENTICAL to the original master', Buffer.compare(recon3, masterKey) === 0);
recon3.fill(0); // close the reconstruction window

// --- 3. Fail to reconstruct from 2 --------------------------------------------------------------
console.log('\n== 3. FAIL from 2 shares ==');
let guardThrew = false;
try { kms.reconstructMasterSecret([shares[0], shares[1]]); } catch { guardThrew = true; }
check('KMS guard THROWS when only 2-of-5 shares are supplied', guardThrew);
// Honest crypto note: the raw Shamir math does NOT throw on < threshold — it returns a wrong value.
const wrong = Buffer.from(rawCombine([shares[0], shares[1]].map((s) => Buffer.from(s, 'base64'))));
console.log(`raw combine(2): ${hexLen(wrong)} | ${wrong.toString('hex').slice(0, 16)}… (silently wrong, by design)`);
check('raw 2-share combine does NOT equal the master (silent wrong value, not an error)', Buffer.compare(wrong, masterKey) !== 0);

// --- 4. Derive a per-record key: explicit 3 shares vs defaulted ---------------------------------
console.log('\n== 4. DERIVE per-record key (reconstruction-window model) ==');
const studentId = 'hello-world-student-001';
const lifecycleNonce = randomBytes(32);
const keyExplicit = kms.deriveStudentKey(studentId, lifecycleNonce, three);
const keyDefault = kms.deriveStudentKey(studentId, lifecycleNonce); // defaults to KMS-held shares
console.log(`derived key (explicit 3 shares): ${hexLen(keyExplicit)} | derived key (default shares): ${hexLen(keyDefault)}`);
check('derived per-record key is a 256-bit AES key (32 bytes)', keyExplicit.length === 32);
check('same key whether shares are passed explicitly (3) or defaulted', Buffer.compare(keyExplicit, keyDefault) === 0);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
