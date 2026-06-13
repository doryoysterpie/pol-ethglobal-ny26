# Claude Code — Prompt 2: Reconcile the Custody-Primitive Story (RSA-OAEP, not secp256k1)

Continue on `feat/hsm-live-reprove` (or branch from it) so all pre-submission doc work accumulates for one consolidated merge to `main`. Do not merge or push — that stays gated.

Per standing discipline: honest current-state language; docs must match the code and the committed evidence; correct documentation errors on sight (this is a documentation-consistency error).

## The problem
The live evidence now committed (`docs/evidence/hsm-live-verification-2026-06-12.txt`, gated test `test:hsm:live`) proves the **LEA-share custody primitive is RSA-3072 OAEP** (`<your-rsa-oaep-key>`, `asymmetricDecrypt` in-HSM). README §7 and ARCHITECTURE §3 already describe this correctly. But:

- `HACKATHON_SUBMISSION.md` states the integration "was verified against a real HSM-protected secp256k1 key" — wrong primitive for the custody claim.
- the internal architecture docs in the production repo describe the hackathon HSM primitive as secp256k1 — same error.

secp256k1 (`<your-secp256k1-key>`, now DESTROYED and staying that way) was only ever the **secondary signing key** that established the "Ed25519 is not available at HSM protection level" finding. It does **not** perform custody. So any doc attributing custody to secp256k1 now contradicts the code *and* the committed transcript — the exact inconsistency a judge following submission → code → evidence would hit in the bounty-critical area.

## What to do

1. **Fix `HACKATHON_SUBMISSION.md`.** Correct the custody-primitive description: custody is RSA-3072 OAEP (client-side public-key wrap → in-HSM `asymmetricDecrypt`) on `<your-rsa-oaep-key>`. Where the secp256k1 key is mentioned at all, frame it accurately and secondarily: it was the signing key used to establish that Ed25519 isn't supported at HSM level — a finding, not the custody mechanism. Point the verification claim at the reproducible test + transcript.

2. **Fix the internal architecture docs** (in the production repo). Same correction: the hackathon HSM custody primitive is RSA-3072 OAEP, not secp256k1. Note secp256k1 as the secondary signing key / Ed25519-finding artifact if it's worth keeping at all. Update the §8 description so the internal docs agree with the ny26 README/ARCHITECTURE and the evidence file.
   - Note: this edits a file in the *other* repo (the production repo, not `pol-ethglobal-ny26`). Make the architecture-doc edit in the production-repo working tree, on an appropriate branch there, and report it separately — do not entangle the two repos' git state. If touching the production repo is out of scope for this session, instead **report the exact §8 text to change** so I can land it myself, and note it as an open architecture-doc-reconciliation item.

3. **Sweep for other instances.** Grep both repos' committed docs for "secp256k1" and for custody/HSM claims, and confirm every remaining mention is accurate (signing-key-and-Ed25519-finding context only; never as the custody primitive). Report all hits and their disposition.

4. **Verify internal consistency after edits.** Confirm README §7, ARCHITECTURE §3, `HACKATHON_SUBMISSION.md`, the evidence transcript, and the gated test all tell the same custody story (RSA-OAEP) and the same secondary-key story (secp256k1 = signing, destroyed, Ed25519-finding). No doc should claim custody via secp256k1 anywhere.

5. **Honest-language pass on the edited docs.** While in these files, re-run the banned-phrase check on what you changed ("production-ready," "enterprise-grade," "unbreakable," "uncrackable," "post-quantum secure" on Ed25519 code) so the fix doesn't reintroduce drift.

## Report
- Diff summary of `HACKATHON_SUBMISSION.md` changes.
- the internal architecture docs: either the diff (if edited in the production-repo tree) or the exact proposed replacement text (if reporting only).
- All "secp256k1" / custody-claim hits found and how each was resolved.
- Confirmation that README / ARCHITECTURE / submission / transcript / test are now mutually consistent.
- Branch state (still local, not pushed, not merged).

## What NOT to do
- Do not merge or push — pre-submission work accumulates for one consolidated, gated merge.
- Do not revive or reference secp256k1 as a custody primitive anywhere.
- Do not entangle the production repo and `pol-ethglobal-ny26` git states; handle the architecture-doc edit separately and report it.
- Do not touch the live v2 key or the HSM evidence in this prompt — this is docs only.
