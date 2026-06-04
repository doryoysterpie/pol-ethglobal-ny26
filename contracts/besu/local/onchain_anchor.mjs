// LIVE dual-anchor integration: off-chain audit Merkle batch -> REAL anchorAuditBatch on
// (1) the local Besu rig and (2) OPTIONALLY a public EVM testnet — proving the identical root
// lands on both. The local leg runs now (zero-gas). The public leg is ENV-GATED and executes
// only when a FUNDED public account is supplied; we never fabricate a public-testnet receipt.
//
// Prereqs: local Besu up (./up.sh) + `npm install` here (ethers).
// Public leg (optional): set
//   PUBLIC_RPC            = an EVM testnet RPC URL
//   PUBLIC_PRIVATE_KEY    = a FUNDED testnet key (read from env ONLY — never hardcode/commit)
//   PUBLIC_REGISTRY_ADDR  = (optional) pre-deployed PoLAuditRegistry; else this deploys one
//   PUBLIC_LABEL          = (optional) human label for logs
//
// NOTE on bounties: as of the ETHGlobal NY 2026 roster, Base/Arbitrum are NOT sponsors, and no
// track rewards "anchor a root to our L2". This public leg is a chain-agnostic PORTABILITY demo
// (works against any EVM RPC), not a bounty qualifier. See HACKATHON_SUBMISSION.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ethers } from 'ethers';
import { AuditLogger } from '../../../services/audit-log/audit_logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_RPC = process.env.RPC ?? 'http://localhost:8545';
// Publicly-known Anvil dev key #0, funded in the LOCAL genesis only. Never real funds.
const LOCAL_DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const artifact = JSON.parse(
  readFileSync(join(__dirname, '../out/PoLAuditRegistry.sol/PoLAuditRegistry.json'), 'utf8'),
);

let pass = 0, fail = 0;
const check = (label, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); };

// Deploy (or attach) PoLAuditRegistry on a chain, anchor `root` under `batchId`, read it back.
async function anchorLeg({ label, rpc, privateKey, registryAddr, zeroGas, batchId, root }) {
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  const wallet = new ethers.Wallet(privateKey, provider);
  // local Besu is zero-gas (legacy tx, gasPrice 0); public chains use normal fee estimation.
  const txOpts = zeroGas ? { gasPrice: 0n, gasLimit: 3_000_000n } : {};
  const callOpts = zeroGas ? { gasPrice: 0n, gasLimit: 250_000n } : {};

  let registry;
  if (registryAddr) {
    registry = new ethers.Contract(registryAddr, artifact.abi, wallet);
  } else {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    const deployed = await factory.deploy(wallet.address, txOpts);
    await deployed.waitForDeployment();
    registry = deployed;
  }
  const addr = await registry.getAddress();
  const tx = await registry.anchorAuditBatch(batchId, root, callOpts);
  const receipt = await tx.wait();
  const onchainRoot = await registry.dailyLogRoots(batchId);
  const parsed = receipt.logs
    .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === 'AuditLogged');
  console.log(`[${label}] chainId=${net.chainId} registry=${addr}`);
  console.log(`[${label}] anchorAuditBatch tx=${receipt.hash} block=${receipt.blockNumber} status=${receipt.status}`);
  return { label, chainId: net.chainId, addr, registry, callOpts, receipt, onchainRoot, eventRoot: parsed?.args?.merkleRoot };
}

// --- 1. OFF-CHAIN: build an audit batch -> bytes32 Merkle root ------------------------------
const audit = new AuditLogger('institution-pepper-demo');
audit.log({ actorId: 'registrar-1', action: 'WRITE_RECORD', targetStudentId: 's-1' });
audit.log({ actorId: 'employer-x', action: 'READ_RECORD', targetStudentId: 's-1' });
audit.log({ actorId: 'operator', action: 'SHRED_RECORD', targetStudentId: 's-1' });
const batch = audit.compileBatch();
const batchId = 1n;
console.log(`off-chain batch: ${batch.count} logs -> root ${batch.root}`);
check('off-chain Merkle root is bytes32', /^0x[0-9a-f]{64}$/.test(batch.root));

// --- 2. LOCAL Besu leg (real, runs now) -----------------------------------------------------
const local = await anchorLeg({
  label: 'LOCAL besu', rpc: LOCAL_RPC, privateKey: LOCAL_DEV_KEY, zeroGas: true, batchId, root: batch.root,
});
check('[local] tx mined with status=1', local.receipt.status === 1);
check('[local] on-chain dailyLogRoots[1] == off-chain root', local.onchainRoot.toLowerCase() === batch.root.toLowerCase());
check('[local] AuditLogged event root matches', local.eventRoot?.toLowerCase() === batch.root.toLowerCase());
// first-write-wins on-chain
let localReverted = false;
try { await (await local.registry.anchorAuditBatch(batchId, batch.root, local.callOpts)).wait(); }
catch { localReverted = true; }
check('[local] re-anchoring batchId=1 reverts (first-write-wins)', localReverted);

// --- 3. PUBLIC EVM leg (env-gated; no fabricated receipt) -----------------------------------
const PUB_RPC = process.env.PUBLIC_RPC;
const PUB_KEY = process.env.PUBLIC_PRIVATE_KEY;
if (PUB_RPC && PUB_KEY) {
  const label = process.env.PUBLIC_LABEL ?? 'PUBLIC testnet';
  console.log(`\n-- public leg: ${label} --`);
  const pub = await anchorLeg({
    label, rpc: PUB_RPC, privateKey: PUB_KEY,
    registryAddr: process.env.PUBLIC_REGISTRY_ADDR, zeroGas: false, batchId, root: batch.root,
  });
  check(`[public] tx mined with status=1`, pub.receipt.status === 1);
  check(`[public] on-chain dailyLogRoots[1] == off-chain root`, pub.onchainRoot.toLowerCase() === batch.root.toLowerCase());
  check('DUAL-ANCHOR MIRROR: local root == public root (byte-for-byte)',
    local.onchainRoot.toLowerCase() === pub.onchainRoot.toLowerCase());
  console.log(`mirrored on ${label}: tx ${pub.receipt.hash} block ${pub.receipt.blockNumber}`);
} else {
  console.log('\n-- public leg: NOT CONFIGURED (no fabricated receipt) --');
  console.log('   To mirror the identical root onto a public chain, set:');
  console.log('     PUBLIC_RPC=<evm-testnet-rpc>  PUBLIC_PRIVATE_KEY=<funded-testnet-key>');
  console.log('     [PUBLIC_REGISTRY_ADDR=<pre-deployed>]  [PUBLIC_LABEL="Chain Sepolia"]');
  console.log('   (Requires a faucet-funded account — operator step. Local leg above is real.)');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed — local on-chain link proven` +
  (PUB_RPC && PUB_KEY ? ' + public mirror' : ' (public leg pending a funded account)'));
process.exitCode = fail === 0 ? 0 : 1;
