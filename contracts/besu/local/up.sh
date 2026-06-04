#!/usr/bin/env bash
# Bring up the LOCAL 3-node IBFT Besu network (dev convenience / CI target).
# Generates fresh keys + genesis, wires the bootnode enode, then `docker compose up`.
# NOT the DO dev-net. See README.md in this dir. (bash 3.2 compatible — macOS default.)
set -euo pipefail
cd "$(dirname "$0")"
IMAGE=hyperledger/besu:24.12.2

echo "[1/4] (re)generate genesis + validator keys ..."
rm -rf networkfiles data .env
# besu prints a benign 'Output directory already exists' line under colima bind-mounts; the
# generated output is verified self-consistent (validators encoded in extraData). Ignore it.
docker run --rm -v "$PWD:/data" "$IMAGE" operator generate-blockchain-config \
  --config-file=/data/ibft-config.local.json --to=/data/networkfiles --private-key-file-name=key \
  >/dev/null 2>&1 || true
test -f networkfiles/genesis.json || { echo "genesis generation failed"; exit 1; }

echo "[2/4] assign 3 key dirs -> node1/2/3 (sorted = deterministic) ..."
KEYDIRS=()
while IFS= read -r d; do KEYDIRS+=("$d"); done < <(ls -d networkfiles/keys/*/ | sort)
[ "${#KEYDIRS[@]}" -eq 3 ] || { echo "expected 3 validator keys, got ${#KEYDIRS[@]}"; exit 1; }
for i in 1 2 3; do mkdir -p "data/node$i"; cp "${KEYDIRS[$((i-1))]}key" "data/node$i/key"; done

echo "[3/4] compute bootnode (node1) enode -> .env ..."
NODE1_PUB=$(tr -d '\n' < "${KEYDIRS[0]}key.pub" | sed 's/^0x//')
echo "BOOTNODE_ENODE=enode://${NODE1_PUB}@172.28.0.11:30303" > .env   # besu1 static IP (besu --bootnodes needs IP, not hostname)
cat .env

echo "[4/4] docker compose up ..."
docker compose up -d
echo "Up. RPC: besu1 http://localhost:8545 | besu2 :8546 | besu3 :8547"
echo "Check consensus: cast block-number --rpc-url http://localhost:8545"
