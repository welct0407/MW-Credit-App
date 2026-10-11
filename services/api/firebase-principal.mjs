import { DEV_PROJECT, OWNER_EMAIL } from './dev-read-config.mjs';
/** verifyIdToken must be Firebase Admin's cryptographic verifier, never a browser-supplied principal. */
export function createFirebasePrincipalVerifier(verifyIdToken, { ownerUid, identityMode, now = () => Date.now() }) {
  return async authorization => {
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization) || authorization.length > 16384) return { ok: false, status: 401, code: 'sign_in_required' };
    let claims;
    try { claims = await verifyIdToken(authorization.slice(7), true); }
    catch { return { ok: false, status: 401, code: 'session_invalid' }; }
    const seconds = Math.floor(now() / 1000);
    if (!claims || claims.aud !== DEV_PROJECT || claims.iss !== `https://securetoken.google.com/${DEV_PROJECT}` || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || !Number.isFinite(claims.exp) || claims.exp <= seconds || !Number.isFinite(claims.iat) || claims.iat > seconds || !Number.isFinite(claims.auth_time) || claims.auth_time > seconds || claims.email_verified !== true || claims.firebase?.sign_in_provider !== 'google.com' || claims.firebase?.tenant !== undefined) return { ok: false, status: 401, code: 'session_invalid' };
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!['email-bootstrap', 'uid-pinned'].includes(identityMode) || (identityMode === 'uid-pinned' && (typeof ownerUid !== 'string' || !ownerUid || claims.sub !== ownerUid)) || email !== OWNER_EMAIL) return { ok: false, status: 403, code: 'access_denied' };
    return { ok: true, subject: claims.sub, email };
  };
}
