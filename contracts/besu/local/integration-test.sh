#!/usr/bin/env bash
# Chain-client integration test: deploy CommitmentAnchor to the local Besu network and
# exercise anchor + isAnchored + first-write-wins against the real (zero-gas) RPC.
# Run after ./up.sh + consensus is live.
#
# Uses the publicly-known Anvil dev key #0 (LOCAL throwaway, funded in the local genesis).
# NEVER used on a real network or production.
set -euo pipefail
cd "$(dirname "$0")/.."                      # contracts/besu (forge sees src/)
RPC="${RPC:-http://localhost:8545}"
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
COMMIT=123456789

echo "=== deploy CommitmentAnchor -> $RPC ==="
ADDR=$(forge create src/CommitmentAnchor.sol:CommitmentAnchor \
  --rpc-url "$RPC" --private-key "$PK" --legacy --gas-price 0 --broadcast --json \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).deployedTo))')
echo "deployed at: $ADDR"

echo "=== anchor($COMMIT) ==="
cast send "$ADDR" "anchor(uint256)" "$COMMIT" --rpc-url "$RPC" --private-key "$PK" --legacy --gas-price 0 >/dev/null

echo "=== isAnchored($COMMIT) ==="
OUT=$(cast call "$ADDR" "isAnchored(uint256)(bool,uint64,uint64)" "$COMMIT" --rpc-url "$RPC")
echo "$OUT"
echo "$OUT" | head -1 | grep -qi true || { echo "FAIL: not anchored on-chain"; exit 1; }
echo "PASS: anchored on-chain"

echo "=== isAnchored(unknown) -> false ==="
U=$(cast call "$ADDR" "isAnchored(uint256)(bool,uint64,uint64)" 999 --rpc-url "$RPC")
echo "$U" | head -1 | grep -qi false || { echo "FAIL: unknown reported anchored"; exit 1; }
echo "PASS: unknown unanchored"

echo "=== re-anchor must revert (first-write-wins) ==="
if cast send "$ADDR" "anchor(uint256)" "$COMMIT" --rpc-url "$RPC" --private-key "$PK" --legacy --gas-price 0 >/dev/null 2>&1; then
  echo "FAIL: re-anchor did not revert"; exit 1
fi
echo "PASS: re-anchor reverted"

echo "ALL INTEGRATION CHECKS PASSED (local Besu)"
