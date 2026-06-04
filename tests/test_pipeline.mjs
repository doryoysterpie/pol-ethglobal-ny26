// End-to-end crypto-shred + dual-anchor demo (hackathon v0). `node tests/test_pipeline.mjs`.
//   encrypt -> audit-log -> Merkle batch -> anchor (mock receipt) -> crypto-shred (3-of-5)
//   -> prove the record is unrecoverable FROM RETAINED STATE.
//
// HONEST CLAIM: after crypto-shred, the record is unrecoverable from what the system retains.
// The ephemeral 32-byte lifecycle nonce that key derivation requires is destroyed (null bytes)
// and the KMS refuses to derive for the destroyed identifier — so not even the operator holding
// the master secret can reconstruct the key. A party who exfiltrated the nonce BEFORE the shred
// is out of scope (the nonce is treated as never-exported) — we don't claim protection there.
//
// Real on-chain anchoring is PoLAuditRegistry.anchorAuditBatch on Besu (contracts/besu; local
// rig at contracts/besu/local). Here the anchor step is a mock receipt so the demo is zero-dep.

import { hkdfSync, createDecipheriv } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { ThresholdKMS } from '../services/crypto-core/thresholdKMS.mjs';
import { ShredStore } from '../services/crypto-core/shredStore.mjs';
import { AuditLogger } from '../services/audit-log/audit_logger.mjs';

const line = (s = '') => console.log(s);
let pass = 0, fail = 0;
const check = (label, cond) => { (cond ? pass++ : fail++); line(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };

function mockAnchor(batchId, merkleRoot) {
  return {
    batchId,
    merkleRoot,
    txHash: `0xMOCK${Buffer.from(`${batchId}:${merkleRoot}`).toString('hex').slice(0, 56)}`,
    anchoredAt: Math.floor(Date.now() / 1000),
    note: 'mock receipt — real path: PoLAuditRegistry.anchorAuditBatch on Besu',
  };
}

const vaultFile = `.demo-pipeline-${Date.now()}-vault.json`;
const kms = new ThresholdKMS({ pepper: 'institution-pepper-demo' });
const store = new ShredStore(kms, vaultFile);
const audit = new AuditLogger(kms.pepper);

const studentId = 'jordan-lee-OEN-123-456-789';
const transcript = { learner: 'Jordan Lee', course: 'MATH1003', grade: 'A', credits: 3, accredited: true };

try {
  line('== 1. ENCRYPT + STORE (blinded key, AES-256-GCM) ==');
  const stored = store.putRecord(studentId, transcript);
  audit.log({ actorId: 'registrar-1', action: 'WRITE_RECORD', targetStudentId: studentId });
  check('stored under a blinded sha256 hash', /^[0-9a-f]{64}$/.test(stored.student_id_hash));
  const vaultRaw = readFileSync(vaultFile, 'utf8');
  check('no plaintext student id anywhere in the vault file', !vaultRaw.includes(studentId));
  check('no plaintext learner name in the vault file', !vaultRaw.includes('Jordan Lee'));

  line('\n== 2. READ while ACTIVE (decrypts + GCM-authenticates) ==');
  const got = store.getRecord(studentId);
  audit.log({ actorId: 'employer-x', action: 'READ_RECORD', targetStudentId: studentId });
  check('decrypts to the original transcript', JSON.stringify(got) === JSON.stringify(transcript));

  line('\n== 3. AUDIT BATCH -> Merkle root -> ANCHOR (mock) ==');
  const batch = audit.compileBatch();
  check('Merkle root is bytes32 hex', /^0x[0-9a-f]{64}$/.test(batch.root));
  const receipt = mockAnchor(1, batch.root);
  check('anchor receipt carries the exact batch root', receipt.merkleRoot === batch.root);
  line(`   batchId=${receipt.batchId} root=${batch.root.slice(0, 18)}… logs=${batch.count} (${receipt.note})`);

  line('\n== 4. capture retained ciphertext, then CRYPTO-SHRED ==');
  const preShred = JSON.parse(readFileSync(vaultFile, 'utf8'))[store.blindedKey(studentId)];
  const captured = { ct: preShred.encrypted_payload, iv: preShred.iv, tag: preShred.auth_tag };
  // 4a. threshold enforcement: 2-of-5 must be DENIED
  const req0 = store.requestShred(studentId);
  let twoDenied = false;
  try {
    store.cryptoShredRecord(studentId, req0,
      ['operator', 'lea-school'].map((n) => kms.signDestroy(n, req0)));
  } catch { twoDenied = true; }
  check('crypto-shred DENIED with only 2-of-5 approvals', twoDenied);
  // 4b. 3-of-5 approved
  const req = store.requestShred(studentId);
  const approvals = ['operator', 'lea-school', 'academic-advisor'].map((n) => kms.signDestroy(n, req));
  const shredEvent = store.cryptoShredRecord(studentId, req, approvals);
  audit.log({ actorId: 'operator', action: 'SHRED_RECORD', targetStudentId: studentId });
  check('crypto-shred APPROVED with 3-of-5', shredEvent.key_status === 'SHREDDED'
    && shredEvent.destroy_receipt.approvals.length >= 3);

  line('\n== 5. PROVE UNRECOVERABLE (from retained state) ==');
  let readThrew = false;
  try { store.getRecord(studentId); } catch { readThrew = true; }
  check('getRecord refuses after shred', readThrew);

  let deriveThrew = false;
  try { kms.deriveStudentKey(studentId, Buffer.alloc(32, 7)); } catch { deriveThrew = true; }
  check('KMS refuses derivation for the destroyed identifier (even with master secret)', deriveThrew);

  const postShred = JSON.parse(readFileSync(vaultFile, 'utf8'))[store.blindedKey(studentId)];
  check('lifecycle_nonce overwritten with null bytes', /^0+$/.test(postShred.lifecycle_nonce));
  check('encrypted_payload overwritten with null bytes', /^0+$/.test(postShred.encrypted_payload));

  // The operator retains master secret + id + the ciphertext/iv/tag scraped earlier, but only
  // the NULL nonce survives in the store. Re-deriving with the null nonce yields a wrong key,
  // so the captured ciphertext cannot be decrypted.
  let recovered = false;
  try {
    const idHashBuf = Buffer.from(store.blindedKey(studentId), 'hex');
    const wrongKey = Buffer.from(hkdfSync('sha256', kms.masterSecret, idHashBuf, Buffer.alloc(32, 0), 32));
    const d = createDecipheriv('aes-256-gcm', wrongKey, Buffer.from(captured.iv, 'hex'));
    d.setAuthTag(Buffer.from(captured.tag, 'hex'));
    Buffer.concat([d.update(Buffer.from(captured.ct, 'hex')), d.final()]); // throws: wrong key
    recovered = true;
  } catch { recovered = false; }
  check('master secret + retained (null) nonce CANNOT decrypt the captured ciphertext', !recovered);

  line(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
} finally {
  try { rmSync(vaultFile); } catch { /* best-effort cleanup */ }
}
