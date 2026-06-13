# Claude Code — Prompt 0: Hackathon Repo Status Assessment (READ-ONLY)

Paste this first. It is a **read-only assessment** — no branches, no edits, no commits, no builds beyond running existing tests to confirm they pass. The goal is to establish ground truth so the sprint can be planned against reality, not assumptions. Per standing discipline: verify against ground truth, report what you actually find (not what docs claim should be there), and flag any conflict between the two.

## Why this prompt exists

I am about to plan the hackathon sprint (real Shamir M-of-N threshold custody + GCP Cloud HSM institutional share + crypto-shred ceremony, continuity-track submission, feature shipped as open source). I cannot plan it until I know the true current state. The internal architecture docs may be stale or may describe a single monorepo when there are now separate repos. **Trust the working tree over the internal docs. Where they disagree, report the disagreement — do not silently reconcile.**

## What I need you to determine and report

### 1. Repo topology
- Am I in a single repo or are there separate PoL and hackathon repos? Report the path(s), remote(s), and whether each is public or private.
- If separate: how do they relate? Is the hackathon repo a fork, a clone, a subtree, an extraction, or independent? What is shared and what diverges?
- List all branches in each, mark which is checked out (HEAD), and show the recent commit graph (last ~15 commits per active branch, with dates).
- Confirm against the internal architecture docs, which describes a single private monorepo `<production-repo>` with hackathon work on `a-legacy-hackathon-branch`. State plainly whether reality matches that or has diverged.

### 2. GCP Cloud HSM integration — the load-bearing unknown
This is the question that determines the whole sprint, so be precise and do not overstate.
- Does an HSM adapter exist in the code? Locate it (expected names from prior notes: `IHsmAdapter`, `LocalMockHsmAdapter`, `GcpHsmAdapter`, and a path like `reconstructMasterSecretViaHsm`). Report actual paths.
- Is the `@google-cloud/kms` SDK an actual dependency (check package.json / lockfile), and is it imported and called anywhere, or only scaffolded?
- **Has a real call to GCP Cloud HSM ever succeeded in this codebase?** Look for evidence: integration tests that hit live GCP, env-var gating, committed notes, anything in history. Distinguish clearly between: (a) live HSM call confirmed working, (b) adapter written but never tested against live GCP, (c) known incompatibility and currently mock-only, (d) not started. Report which of these is true. If you cannot tell, say so — do not guess.
- Report what credentials/config a live HSM call would require and whether any of that is present (without printing any secret values).

### 3. Threshold custody — mock vs real Shamir
- Locate the current threshold KMS implementation (expected: `services/crypto-core/thresholdKMS.mjs` per the internal architecture docs).
- Is it still the mock (single master secret + HKDF derivation), or has real Shamir M-of-N been started? Report exactly what's there.
- Is the `shamirs-secret-sharing` library (or any Shamir implementation) a dependency yet? Imported? Used?
- Locate `shredStore.mjs` and the crypto-shred ceremony; report whether the end-to-end shred path currently runs.

### 4. Test and build baseline
- Identify the actual test entry points (do not assume `npm run demo` / `test_pipeline.mjs` / `forge test` — confirm what exists).
- Run the existing tests and report real pass/fail counts. Do not fix anything; just report.
- Note anything broken on the current HEAD.

### 5. Open-source readiness (continuity path requires shipping the feature publicly)
- For whatever will become the public artifact, do a first-pass scan for secrets in the working tree and history (keys, `.env`, credentials, GCP project IDs/key-ring names, real custodian or design-partner identities). Report findings; do not modify anything.
- Report current license state (LICENSE present? which?).
- Identify the natural module boundary for the threshold-custody/crypto-shred middleware if it were extracted — i.e., what files are the feature vs. what's the rest of the project.

### 6. Honest-current-state scan
- Grep committed docs/README/comments for banned phrases ("production-ready," "enterprise-grade," "unbreakable," "uncrackable," "post-quantum secure" applied to current Ed25519 code) and report hits. Do not fix; just list.

## Output format

Report back as a single status summary with a section per item above. For items 2 and 3 especially, lead with the plain-state answer (which of the enumerated cases is true) before detail. End with:
- **"Biggest unknowns / risks for a 36-hour sprint"** — your honest read of what could derail the build, HSM-incompatibility chief among them.
- **"What I did NOT find that the internal docs claim exists"** — drift list.

## What NOT to do
- No branches, no edits, no commits, no force-push, no builds beyond running existing tests.
- Do not fix, refactor, or "tidy" anything you find — report only.
- Do not print secret values even if you find them; report their presence and location.
- Do not reconcile working-tree-vs-docs conflicts silently — surface them.
