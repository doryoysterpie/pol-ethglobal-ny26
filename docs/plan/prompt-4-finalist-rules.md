# Claude Code — Prompt 4: Finalist-Rules Adjustment

The ETHGlobal finalist rules change the order and add one requirement. Fold these in. Per standing discipline: honest current-state language, no secret commits, irreversible actions (publish flip, teardown) stay gated on explicit go-ahead.

Repo: `pol-ethglobal-ny26`, `main` (merge `97963a2` already landed, pushed). Still PRIVATE. v2 ENABLED.

## What the rules changed
- **"Open source, deployed, and live" is a FINALIST PREREQUISITE** (stated 3×). The publish flip moves to **BEFORE judging**, not after. Was previously parked post-presentation — that ordering would have failed finalist eligibility.
- **"Add your plan files to the repo"** is a required item. The AI planning prompts must be committed (scrubbed first).
- **"Live deployment required"** — v2 stays ENABLED through judging (mandatory now, not optional). Teardown is still AFTER, but after *judging*, not after the presentation.

## Step 1 — Commit the plan files (NEW requirement)
- Create `docs/plan/` and add the AI planning prompts from this sprint (Prompt 0 assessment, 1a/1b HSM gate + reprove, Prompt 2 doc reconciliation, Prompt 3 publish/teardown, this Prompt 4).
- **Scrub before committing:** these prompts contain the real GCP identifiers (`<your-project>`, `<your-key-ring>`, `<your-rsa-oaep-key>`, `<your-secp256k1-key>`, `<your-region>`) that were genericized everywhere else. Genericize them here too (`<your-project>`, `<your-key-ring>`, etc.) so committing plan files doesn't reintroduce the identifiers just cleaned out. The evidence transcript remains the one authentic record; plan files get genericized.
- Add a short `docs/plan/README.md` framing the AI-use story honestly: AI accelerated implementation and documentation under a founder-defined discipline (gated prompts, stop-and-confirm, honest-current-state, verify-against-ground-truth). This supports the "explain how you used AI" judging question.
- Re-run the banned-phrase + secret scan on the new files before commit. Commit on `main`.

## Step 2 — Pre-publish final check (GATED prep, no flip yet)
- Re-confirm: secret scrub clean (tree + history, incl. new plan files), 48/0 baseline, `test:hsm:live` gated/skips clean, demo-video URL — report whether the placeholder in `HACKATHON_SUBMISSION.md` is filled (founder pastes the link; do not invent it).
- Report readiness for the flip. Do not flip yet.

## Step 3 — Publish flip to PUBLIC (GATED, now BEFORE judging)
- On explicit founder go-ahead, flip `pol-ethglobal-ny26` to public:
  ```
  gh repo edit doryoysterpie/pol-ethglobal-ny26 --visibility public --accept-visibility-change-consequences
  ```
- This is irreversible. Confirm Step 2 clean and founder sign-off first. Report the public URL.
- **v2 stays ENABLED — do NOT tear down. Live deployment is a finalist requirement through judging.**

## Step 4 — Teardown (GATED, now AFTER judging — not after presentation)
- Do NOT run until founder confirms judging is fully complete (not just the presentation — the rules require live deployment through finalist judging).
- On confirmation: destroy v2, confirm no enabled versions remain, billing stops.
  ```
  gcloud kms keys versions destroy 2 --key=<your-rsa-oaep-key> \
    --keyring=<your-key-ring> --location=<your-region>
  ```

## Revised order (report this back as the checklist)
1. Commit scrubbed plan files (Step 1)
2. Founder pastes demo-video URL
3. Pre-publish check (Step 2)
4. **Publish flip — BEFORE judging** (Step 3, gated)
5. Select finalist + partner tracks on dashboard (founder, off-repo)
6. Pre-flight live test morning-of; present; v2 stays live through judging
7. **Teardown v2 — AFTER judging** (Step 4, gated)

## What NOT to do
- Do not flip public or tear down without explicit per-gate go-ahead.
- Do not tear down v2 before judging is complete — live deployment is required through judging.
- Do not commit the real GCP identifiers in the plan files — genericize them.
- Do not invent the demo-video URL or Team content.
- Do not touch the production repo (architecture-doc reconciliation still carried).
