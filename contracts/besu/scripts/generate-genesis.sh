#!/usr/bin/env bash
# Generate the 3-node IBFT 2.0 dev-net genesis + validator keys.
# Permissioned, zero-gas IBFT 2.0 dev-net.
#
# Requires `besu` (pinned 24.x LTS). Not runnable on a machine without besu.
set -euo pipefail

command -v besu >/dev/null || { echo "besu not installed — install Hyperledger Besu (24.x) first."; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${HERE}/networkfiles"

besu operator generate-blockchain-config \
  --config-file="${HERE}/ibft-config.json" \
  --to="${OUT}" \
  --private-key-file-name=key

echo
echo "Authoritative genesis written to: ${OUT}/genesis.json"
echo "(the sibling ../genesis.json is a REFERENCE TEMPLATE of the expected config shape.)"
echo
echo "Next: assign the three generated key dirs to the three validator nodes."
