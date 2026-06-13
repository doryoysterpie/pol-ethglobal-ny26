# Claude Code — Prompt 1b (REVISED): Reprove Live HSM Path + Commit Gated Evidence

**Gate 1a returned YELLOW** (key resources exist, correct algorithm/protection, but both versions DESTROYED past the restore window). Founder has **authorized one new RSA-3072 key version** on the existing `<your-rsa-oaep-key>` key — a deliberate sub-dollar spend in service of the bounty thesis and continuity deliverable. This is the only billable action authorized. Do not create keys, key rings, or additional versions beyond this one.

This work is the meaningful in-window capability for the continuity submission: the threshold-custody foundation predates June 12; the live hardware-custody proof + reproducible evidence + public release is what ships this weekend.

Per standing discipline: honest current-state language; never claim a rung you didn't run; the live version is provisioned now and **destroyed right after the demo** (teardown lives in Prompt 3 / the checklist — not here).

## Critical ordering: verify auth BEFORE you spend

Do these in order. Step 1 is free and gates the billable Step 2. If Step 1 fails, STOP and report — do not create the version while auth is broken; that wastes the spend and leaves you debugging IAM mid-reprove.

### Step 1 — Verify the ADC principal can use the key (FREE, do first)
- Confirm the active ADC principal (expected `<your-adc-account>`) holds the permission to decrypt with this key — `cloudkms.cryptoKeyVersions.useToDecrypt` on `<your-rsa-oaep-key>` (or the equivalent role, e.g. `roles/cloudkms.cryptoKeyDecrypter` / `cryptoOperator`). Use a permission/IAM-policy read (`gcloud kms keys get-iam-policy` and/or `gcloud iam ... test-permissions`-style read), which does not create or enable anything and does not bill.
- If the principal lacks the permission: STOP. Report the exact missing role. Granting it is a free one-time IAM change, but it's a founder-visible action — surface it, don't silently self-grant.
- Only proceed to Step 2 if the principal can decrypt.

### Step 2 — Create ONE new key version (the authorized billable action)
- Create a single new version on the existing `<your-rsa-oaep-key>` RSA-3072 OAEP key. Do not create a new key — the resource already has the correct algorithm and HSM protection level. One version only.
- Confirm it reaches ENABLED state and report the version number and creation timestamp.
- Do **not** touch the `<your-secp256k1-key>` secp256k1 key — leave it DESTROYED. The adapter doesn't use it for custody (it's the secondary signing key from the Ed25519-not-HSM-supported finding); reviving it costs another charge for zero bounty value and would reinforce the wrong custody-primitive story that Prompt 2 fixes.

### Step 3 — Single live roundtrip, before writing the test
- With `USE_REAL_GCP_HSM=true` and env vars set (`GCP_PROJECT_ID=<your-project>`, `GCP_LOCATION_ID=<your-region>`, `GCP_KEY_RING_ID=<your-key-ring>`, `GCP_CRYPTO_KEY_ID=<your-rsa-oaep-key>`, `GCP_CRYPTO_KEY_VERSION=<new version>`), exercise `GcpHsmAdapter.encryptShare` → `decryptShare` on a throwaway test share. Confirm the roundtrip returns the original bytes. Report actual output. If it fails, STOP and report — do not paper over it.

### Step 4 — Wire into the full threshold flow once live
- LEA share HSM-wrapped, then 3-of-5 reconstruction via `reconstructMasterSecretViaHsm()` with the live unwrap in the path. Confirm it reconstructs AND that 2-of-5 still fails. This proves HSM custody integrates with the real Shamir floor, not just an isolated crypto call.

### Step 5 — Commit a gated integration test
- Add `test:hsm:live` (or a `USE_REAL_GCP_HSM`-gated block in `test_hsm_adapter.mjs`) running Steps 3–4 against live GCP when the flag is set; clearly skipped otherwise with a logged "skipped: set USE_REAL_GCP_HSM=true to run". The offline baseline must stay **48/0** and must not run or break the live test under plain `npm test`.

### Step 6 — Capture a transcript as committed evidence
- Save actual run output (timestamp, key resource path, new version number, roundtrip success, 3-of-5 pass / 2-of-5 fail) to `docs/evidence/hsm-live-verification-2026-06-1X.txt`. Resource names are not secrets and are fine to include; do NOT capture credentials, ADC contents, or full key material. This is the artifact a judge reads when they can't provision their own HSM.

### Step 7 — Update claim language to match the new evidence
- README §7 / ARCHITECTURE §3 can now honestly say "verified end-to-end; reproduce via `USE_REAL_GCP_HSM=true npm run test:hsm:live`, transcript at docs/evidence/…". Keep it scoped to what the test covers: the RSA-OAEP custody roundtrip + Shamir integration. Don't imply more.

## Report
- Step 1 auth result (can the principal decrypt? if not, the missing role).
- New version number + ENABLED confirmation.
- Live roundtrip output.
- 3-of-5-with-HSM pass + 2-of-5 fail confirmation.
- Offline baseline still 48/0 and live test properly gated/skipped without the flag.
- Path to committed transcript.
- Confirm the new version is **left ENABLED through the demo** (teardown is post-demo, Prompt 3 — do not destroy it here).

## What NOT to do
- Do not create the key version before Step 1 auth passes.
- Do not create any key, key ring, or more than the one authorized version.
- Do not revive or touch the secp256k1 key — leave it destroyed.
- Do not tear down the new RSA version here — it stays live through the demo.
- Do not let the live test pollute the offline 48/0 baseline or run under plain `npm test`.
- Do not overstate beyond what the transcript shows.
- Do not commit credentials, ADC contents, or private key material.
