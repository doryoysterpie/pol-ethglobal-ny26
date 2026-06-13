# AI planning files

These are the actual prompts used to drive this sprint with an AI coding agent
(Claude Code), included per ETHGlobal's "add your plan files to the repo" guidance and
to answer the "explain how you used AI" judging question honestly.

## How AI was used

AI **accelerated implementation and documentation** under a founder-defined
discipline. It did **not** generate or vet the idea — the architecture is the founder's
Verifiable Frameworks methodology (threshold custody, dual-anchored audit logging,
selective disclosure), and the threshold-custody foundation predates this event. The
in-window deliverable was the live hardware-custody proof, its reproducible evidence,
and the public release.

The discipline encoded in these prompts:

- **Gated, stop-and-confirm prompts.** Every irreversible action — cloud spend,
  creating a key version, merging, publishing the repo, destroying the key — was a hard
  stop requiring explicit founder go-ahead. The AI staged and reported; the founder
  decided.
- **Honest current-state language.** No "production-ready / unbreakable /
  post-quantum-secure" claims; v0 and unaudited stated throughout; working-vs-stubbed
  named explicitly.
- **Verify against ground truth.** Claims were checked against the actual working tree,
  real test runs, and real cloud responses — not assumed. The live HSM proof is backed
  by a committed, reproducible transcript (`docs/evidence/`), not prose.
- **Strict scope.** The AI did only what each prompt authorized; out-of-scope
  observations were surfaced, not acted on.

## The prompts (in order)

- `prompt-0-repo-assessment.md` — read-only ground-truth assessment before any change.
- `prompt-1a-hsm-verify-gate.md` — free reachability check of the Cloud HSM keys,
  gating the one billable action.
- `prompt-1b-hsm-reprove.md` — provision one key version, reprove the live HSM custody
  path, commit a gated integration test + evidence transcript.
- `prompt-2-doc-reconciliation.md` — correct a custody-primitive documentation error
  (RSA-OAEP, not secp256k1) across the docs.
- `prompt-3-publish-teardown.md` — pre-publish secret scrub plus staged publish/teardown.
- `prompt-4-finalist-rules.md` — fold in the finalist rules (publish before judging,
  add plan files, live deployment through judging).

## Genericized

These files are genericized: real Google Cloud identifiers and references to the
founder's private production repository have been replaced with placeholders
(`<your-project>`, `<production-repo>`, etc.). The evidence transcript in
`docs/evidence/` remains the one authentic record of the live verification.

Hackathon v0, unaudited.
