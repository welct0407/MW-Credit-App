import { createFirebasePrincipalVerifier } from '../api/firebase-principal.mjs';

/** Candidate factory only: caller supplies Firebase Admin verifyIdToken, never unverified browser claims. */
export function createCommandPrincipalVerifier({ verifyIdToken, ownerUid, now }) {
  if (typeof verifyIdToken !== 'function' || typeof ownerUid !== 'string' || !ownerUid.trim() || ownerUid !== ownerUid.trim() || ownerUid.length > 128) throw new Error('Pinned command identity required');
  return createFirebasePrincipalVerifier(verifyIdToken, { ownerUid, identityMode: 'uid-pinned', ...(now ? { now } : {}) });
}
