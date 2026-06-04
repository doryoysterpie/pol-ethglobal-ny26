# Security Policy

## Status

This repository is a **hackathon demonstration (v0) and is unaudited.** It is not
a production system and must not be used to store real personal data, education
records, or any sensitive information. The README lists explicitly what this demo
does and does not provide.

## Reporting a vulnerability

If you find a security issue in this code, please report it privately rather than
opening a public issue:

- Open a [GitHub security advisory](https://github.com/doryoysterpie/pol-ethglobal-ny26/security/advisories/new), or
- Contact the repository owner via their GitHub profile.

Please include a description of the issue, steps to reproduce, and the affected
file(s) and commit. During the hackathon window we aim to acknowledge reports
within a few days; responses outside the event may take longer.

## Scope

In scope: the cryptographic and smart-contract code under `services/` and
`contracts/`.

**Out of scope — not a vulnerability:** the hardcoded key
`0xac0974…ff80` in `contracts/besu/local/` is the well-known public
Foundry/Anvil test key #0. It is used only on a throwaway, zero-gas **local**
Besu chain, funds nothing of value, and is known to everyone. Do not report it.

## Documented cryptographic limitations (by design)

These are demonstration limitations stated openly, not undisclosed flaws:

- The threshold KMS holds all key shares in a single process — it *models* M-of-N
  custody but does not yet distribute shares to independent holders.
- The local HSM adapter provides **no** hardware key isolation; real isolation
  comes only from a Cloud HSM-protected key (see `services/crypto-core/GcpHsmAdapter.mjs`).
- A key-reconstruction window exists at derive time, named explicitly in
  `services/crypto-core/thresholdKMS.mjs`.
- Signatures use Ed25519 (development primitive); a post-quantum migration path is
  named in `services/crypto-core/crypto.mjs` but not implemented here.
