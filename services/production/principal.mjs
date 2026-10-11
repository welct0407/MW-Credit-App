/** The seam must be Firebase Admin verifyIdToken; never decode browser claims as verification. */
export function createProductionPrincipalVerifier(verifyIdToken, config, now = () => Date.now()) {
  const invalid = () => ({ ok: false, status: 401, code: 'session_invalid' });
  return async authorization => {
    if (typeof authorization !== 'string' || authorization.length > 16384 || !/^Bearer [^\s]+$/.test(authorization)) return { ok: false, status: 401, code: 'sign_in_required' };
    let claims;
    try { claims = await verifyIdToken(authorization.slice(7), true); } catch { return invalid(); }
    const seconds = Math.floor(now() / 1000);
    if (!claims || claims.aud !== config.projectId || claims.iss !== config.issuer
      || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || /[\s\u0000-\u001f\u007f]/u.test(claims.sub)
      || !Number.isSafeInteger(claims.exp) || claims.exp <= seconds
      || !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > seconds || claims.iat >= claims.exp
      || !Number.isSafeInteger(claims.auth_time) || claims.auth_time < 0 || claims.auth_time > claims.iat
      || claims.email_verified !== true || claims.firebase?.sign_in_provider !== 'google.com'
      || claims.firebase?.tenant !== undefined) return invalid();
    if (claims.sub !== config.ownerUid || typeof claims.email !== 'string' || claims.email.trim().toLowerCase() !== config.ownerEmail)
      return { ok: false, status: 403, code: 'access_denied' };
    return { ok: true };
  };
}
