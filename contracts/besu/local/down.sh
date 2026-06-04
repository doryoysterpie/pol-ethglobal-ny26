#!/usr/bin/env bash
# Tear down the local 3-node IBFT network and remove generated state.
set -euo pipefail
cd "$(dirname "$0")"
docker compose down -v 2>/dev/null || true
rm -rf networkfiles data .env
echo "Local network down; generated keys/genesis/state removed."
