import {verifyFirebaseClaims} from '../lib/firebase-claims.mjs';
/** The seam must be Firebase Admin verifyIdToken; never decode browser claims as verification. */
export function createProductionPrincipalVerifier(verifyIdToken, config, now = () => Date.now()) {
  const verify=verifyFirebaseClaims({verifyIdToken,projectId:config.projectId,now});
  return async authorization => {
    const result=await verify(authorization);
    if(!result.ok||config.issuer!==`https://securetoken.google.com/${config.projectId}`)return result.ok?{ok:false,status:401,code:'session_invalid'}:result;
    if (result.subject !== config.ownerUid || result.email !== config.ownerEmail) return { ok: false, status: 403, code: 'access_denied' };
    return { ok: true };
  };
}
