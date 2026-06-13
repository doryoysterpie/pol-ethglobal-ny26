# Claude Code — Prompt 1a: Verify GCP HSM Keys Are Reachable (GATE)

Paste this first of the HSM sequence. It is a **reachability check, not a build**. Goal: determine whether the real Cloud HSM keys the docs reference still exist and are usable, *before* investing sprint time in reproving the live path. This is a gate: the outcome decides whether Prompt 1b (reprove) runs as-written, or pivots to reprovision/reframe.

Per standing discipline: verify against ground truth; do not spend on new cloud resources without explicit confirmation; report don't assume.

## Context
- Repo: `pol-ethglobal-ny26` (separate Apache-2.0 artifact; the threshold-custody + crypto-shred build is already done and green at 48/0).
- The `GcpHsmAdapter.mjs` uses RSA-3072 OAEP: `encryptShare` wraps the LEA share client-side with the public key; `decryptShare` unwraps inside the HSM via `asymmetricDecrypt`. SDK is loaded by dynamic import gated on `USE_REAL_GCP_HSM === 'true'`.
- Docs reference: key ring + keys `<your-rsa-oaep-key>` (RSA-OAEP, the custody key) and `<your-secp256k1-key>` (secp256k1 signing key) in region `<your-region>`.
- The keys may have been torn down. We do not know. Find out cheaply.

## Steps

1. **Confirm gcloud/auth state without spending.** Check whether `gcloud` is authenticated and which project is active. Report the project ID. Do NOT create anything.

2. **Check whether the key ring and keys still exist.** Using `gcloud kms keys list` / `keyrings list` (read-only describe calls — these do not incur key-version cost; only *active key versions* bill, and listing does not create them). Report, for each of the two documented keys:
   - Does it exist? Protection level (confirm HSM)? Purpose/algorithm (confirm `<your-rsa-oaep-key>` is RSA-3072 `ASYMMETRIC_DECRYPT` OAEP)?
   - Are there active (enabled, non-destroyed) key versions? (This is the line item that bills.)
   - Region/location.

3. **Confirm install feasibility.** Confirm `@google-cloud/kms` can be installed (`npm install @google-cloud/kms` is allowed here — it's a dev dependency install, not cloud spend). Install it. Confirm it resolves and the dynamic import path in `GcpHsmAdapter.mjs` will find it. Do NOT call GCP yet.

4. **Report a GATE decision**, one of:
   - **GREEN — keys live and reachable:** the RSA-OAEP custody key exists with an enabled version, ADC works, SDK installed. → Prompt 1b can reprove as-written.
   - **YELLOW — keys exist but unusable:** key ring/keys present but no enabled version / wrong algorithm / auth fails. → Report exactly what's wrong; 1b will need a reprovision sub-step (which is new spend — gated on founder go-ahead).
   - **RED — keys gone:** torn down / project changed. → 1b pivots to either reprovision-from-scratch (new spend, gated) or reframe the claim to env-gated-not-currently-live. Founder decides.

## What NOT to do
- Do not create, enable, or rotate any key or key version (that's billable spend — gated on explicit go-ahead).
- Do not make a live cryptographic call to the HSM yet — that's Prompt 1b. This prompt only establishes *whether* you can.
- Installing the `@google-cloud/kms` npm package is fine; calling GCP is not, yet.
- Report the gate color and stop. Wait for me before running 1b.
