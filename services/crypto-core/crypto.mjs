// Cryptographic primitives.
// v0 uses Ed25519 (Node built-in, zero-dep) for issuer signatures and SHA-256 for
// commitments/disclosures. Post-quantum migration path: SPHINCS+/SLH-DSA for signatures,
// swapped in this module only; nothing above changes. A named seam, not a gap.

import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey } from 'node:crypto';

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64url = (s) => Buffer.from(s, 'base64url');
export const j = (obj) => b64url(Buffer.from(JSON.stringify(obj)));
export const unj = (s) => JSON.parse(fromB64url(s).toString('utf8'));

export const sha256 = (data) => createHash('sha256').update(data).digest();
export const sha256hex = (data) => createHash('sha256').update(data).digest('hex');

/** Generate an issuer (registrar) keypair + a did:key-style identifier. */
export function generateIssuerKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }); // { kty:'OKP', crv:'Ed25519', x }
  const did = `did:key:ed25519:${jwk.x}`;
  return { privateKey, publicKey, jwk, did };
}

/** Holder keypair (same primitive as issuer; bound into the credential via `cnf`). */
export const generateHolderKey = generateIssuerKey;

/** Resolve a did:key:ed25519 back to a verify-capable public key. */
export function publicKeyFromDid(did) {
  const x = did.split(':').pop();
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

/** Build a verify-capable public key from a raw OKP/Ed25519 JWK (holder `cnf.jwk`). */
export function publicKeyFromJwk(jwk) {
  return createPublicKey({ key: jwk, format: 'jwk' });
}

export const sign = (privateKey, dataStr) =>
  b64url(edSign(null, Buffer.from(dataStr), privateKey));

export const verify = (publicKey, dataStr, sigB64url) =>
  edVerify(null, Buffer.from(dataStr), publicKey, fromB64url(sigB64url));
