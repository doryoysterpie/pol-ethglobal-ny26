// Integrity anchoring: two independent, widely-witnessed destinations so failure of one
// does not invalidate verification. v0 ships a LocalMerkleAnchor (runs offline, today) and
// a DualAnchor wrapper. Production destinations are a real external settlement anchor and
// OpenTimestamps->Bitcoin — typed as a seam below.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sha256 } from '../crypto-core/crypto.mjs';

const hashPair = (a, b) => sha256(Buffer.concat([Buffer.from(a, 'hex'), Buffer.from(b, 'hex')])).toString('hex');

function merkleRootAndProof(leaves, index) {
  if (leaves.length === 1) return { root: leaves[0], proof: [] };
  let level = leaves.slice();
  let idx = index;
  const proof = [];
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]); // duplicate last
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    proof.push({ dir: idx % 2 === 0 ? 'R' : 'L', hash: level[sib] });
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i], level[i + 1]));
    level = next;
    idx = Math.floor(idx / 2);
  }
  return { root: level[0], proof };
}

export function verifyInclusion(leafHex, proof, root) {
  let acc = leafHex;
  for (const step of proof) acc = step.dir === 'R' ? hashPair(acc, step.hash) : hashPair(step.hash, acc);
  return acc === root;
}

/** A single widely-witnessed destination. v0: an append-only Merkle log on disk. */
export class LocalMerkleAnchor {
  constructor(file) {
    this.file = file;
    this.leaves = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  }
  anchor(leafHex) {
    const index = this.leaves.length;
    this.leaves.push(leafHex);
    writeFileSync(this.file, JSON.stringify(this.leaves));
    const { root, proof } = merkleRootAndProof(this.leaves, index);
    return { destination: `local:${this.file}`, index, root, proof };
  }
}

/** Production destination — seam, not wired in v0. */
export class ExternalAnchorSeam {
  anchor() {
    throw new Error('ExternalAnchorSeam: production seam. Wire a real external settlement anchor here, pairing with OpenTimestamps->Bitcoin as the second independent anchor.');
  }
}

/** Dual anchor: commit to two independent destinations; verify requires both. */
export class DualAnchor {
  constructor(primary, secondary) { this.primary = primary; this.secondary = secondary; }
  anchor(leafHex) {
    return { leaf: leafHex, primary: this.primary.anchor(leafHex), secondary: this.secondary.anchor(leafHex) };
  }
  static verify(receipt) {
    return (
      receipt.leaf &&
      verifyInclusion(receipt.leaf, receipt.primary.proof, receipt.primary.root) &&
      verifyInclusion(receipt.leaf, receipt.secondary.proof, receipt.secondary.root)
    );
  }
}
