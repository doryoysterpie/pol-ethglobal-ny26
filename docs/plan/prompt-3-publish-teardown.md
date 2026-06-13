# Claude Code — Prompt 3: Pre-Submission Publish Pass + Post-Demo Teardown

Final prompt of the hackathon sprint. This preps everything for submission and public release, but **every irreversible action (merge, publish-flip, key teardown) is a gated stop-and-confirm** — running this prompt stages and reports; it does not flip anything public or destroy anything without explicit founder go-ahead at each gate.

Per standing discipline: honest current-state language; verify against ground truth; no force-push, no secret commits; publishing is irreversible (forkable), so the publish gate is hard.

Repo: `pol-ethglobal-ny26`. Branch `feat/hsm-live-reprove` carries two accumulated commits (HSM live test + evidence; submission-doc fix). The production-side architecture-doc reconciliation is **carried, not landed this weekend** — do not touch the production repo.

## Step 1 — Pre-publish secret + sensitive-data scrub (run BEFORE any merge or flip)
- Re-scan working tree AND full history of `pol-ethglobal-ny26` for secrets (keys, `.env`, credentials, ADC contents, service-account files). Prompt-0 found the tree clean; confirm nothing entered history via the two new commits or the evidence transcript.
- Confirm the committed transcript `docs/evidence/hsm-live-verification-2026-06-12.txt` contains no credentials or key material — resource names/region are fine, secrets are not.
- Report clean/findings. If anything sensitive is found, STOP — do not merge or publish.

## Step 2 — Disclosed infrastructure identifiers (founder call, surface don't decide)
- The repo + transcript disclose GCP key names (`<your-rsa-oaep-key>`, `<your-secp256k1-key>`), key ring (`<your-key-ring>`), project (`<your-project>`), and region (`<your-region>`). These are not secrets — IAM still gates use — but going public exposes them permanently.
- Report every location they appear. Present the choice: leave as-is (low risk, aids reproducibility) vs. genericize in docs (e.g. `<your-key-ring>`) while keeping the transcript authentic. **Do not decide — surface for founder sign-off.** Note that the project will be torn down anyway (Step 6), which lowers the residual risk of leaving them.

## Step 3 — Team placeholder + submission completeness
- The README "Team" section is a `_TODO_` placeholder. Report it for the founder to fill (do not invent names/credentials — honest framing: "published academic researcher," advisor bench as already framed elsewhere, no fabricated team).
- Verify the continuity-track submission requirements are satisfiable: functional MVP (the 48/0 baseline + live HSM test), architecture diagram present, public repo (pending flip), and that the README clearly delineates **what predates the event vs. what shipped June 12–14** (threshold-custody foundation predates; live hardware-custody proof + reproducible evidence + public release is the in-window deliverable). Report any gap.

## Step 4 — Final full-repo honest-language sweep
- Banned-phrase grep across all committed docs + code + comments ("production-ready," "enterprise-grade," "unbreakable," "uncrackable," "military-grade," "post-quantum secure" on Ed25519, "FERPA/COPPA-compliant" as self-declared). Prompt-0 was clean; confirm the new commits didn't introduce drift.
- Confirm the HSM claim language is scoped to what the evidence shows (RSA-OAEP custody roundtrip + Shamir integration), not broader.
- Report hits; fix obvious drift and note it; flag anything ambiguous.

## Step 5 — Consolidated merge to main (GATED)
- Summarize `feat/hsm-live-reprove` → `main`: the two commits, files touched, net diff.
- Confirm offline baseline still 48/0 and `test:hsm:live` is gated/skipped without the flag.
- **STOP and request explicit go-ahead before merging.** On go: merge (no force-push), report the merge commit. Push is pre-approved for this repo once merged, but the public-flip is separate (Step 7).

## Step 6 — Post-demo v2 HSM teardown (GATED, and this is the FIRST post-demo action)
- The live v2 key version on `<your-rsa-oaep-key>` bills until destroyed. **This teardown is the first thing to run after the demo is recorded/submitted — not last.** Surface it prominently so it isn't forgotten in post-hackathon fatigue.
- When founder confirms the demo is captured and submitted: destroy v2 (`gcloud kms keys versions destroy 2 ...`). Report the destroy confirmation and that no enabled versions remain (billing stops).
- Do NOT destroy before the founder confirms the demo + video are done — the key must stay live through the demo. Until then, this step is staged, not executed.
- The gated `test:hsm:live` remains in the repo and stays reproducible for anyone who provisions their own key — teardown removes the live GCP resource, not the test.

## Step 7 — Private → public flip (GATED, hard gate, irreversible)
- Only after Steps 1–4 pass and the founder explicitly approves: flip `pol-ethglobal-ny26` from PRIVATE to public via `gh`.
- This is irreversible (forkable the instant it's public). Confirm one final time that the secret scrub (Step 1) is clean and the founder has signed off on the disclosed-identifier question (Step 2) before flipping.
- Report the public URL once flipped.

## Report
- Scrub result (tree + history + transcript).
- Disclosed-identifier locations + the founder decision pending.
- Team placeholder + submission-completeness gaps.
- Honest-language sweep result.
- Merge summary (staged, awaiting go) → merge commit (after go).
- Teardown: staged, with the explicit reminder it runs first post-demo.
- Publish: staged, awaiting hard-gate go → public URL (after go).
- A clean ordered checklist of the remaining gated actions in the order to run them: (1) merge, (2) fill Team + decide identifiers, (3) record/submit demo, (4) **teardown v2**, (5) publish flip — or whatever order the founder prefers, but teardown-before-forgetting flagged.

## What NOT to do
- Do not merge, publish, or destroy anything without the explicit per-gate go-ahead.
- Do not touch the production repo (architecture-doc reconciliation is carried to post-hackathon).
- Do not destroy v2 before the demo is confirmed captured.
- Do not invent Team names/credentials.
- Do not decide the disclosed-identifier question unilaterally — surface it.
- Do not commit secrets, ADC contents, or key material.
- Do not force-push.
