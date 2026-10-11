/**
 * Pure policy over injected verifier output. This does NOT verify tokens.
 * serverVerified is a simulator input, never proof of authenticity at a network boundary.
 * No caller-controlled request object may be passed as a trusted principal in a live adapter.
 */
export function evaluateReadAccess(context = {}) {
  const { principal, config, grants, partners, nowMs } = context && typeof context === 'object' ? context : {};
  const denied = code => ({ ok: false, code });
  const nonblank = value => typeof value === 'string' && value.trim().length > 0;
  if (!config || config.mode !== 'synthetic' || !['environment', 'issuer', 'audience'].every(key => nonblank(config[key])) || !Number.isFinite(nowMs)) return denied('configuration_invalid');
  if (!principal) return denied('signed_out');
  if (principal.serverVerified !== true || principal.emailVerified !== true || !nonblank(principal.subject) || !nonblank(principal.email)) return denied('access_denied');
  if (principal.revoked !== false || principal.disabled !== false) return denied('access_denied');
  if (!Number.isFinite(principal.expiresAtMs) || principal.expiresAtMs <= nowMs) return denied('expired');
  if (!['environment', 'issuer', 'audience'].every(key => principal[key] === config[key])) return denied('access_denied');
  if (!Array.isArray(grants) || !Array.isArray(partners)) return denied('access_denied');
  const matches = grants.filter(grant => grant && grant.enabled === true && grant.subject === principal.subject && grant.environment === config.environment && Array.isArray(grant.permissions) && grant.permissions.includes('oltp.read'));
  if (matches.length !== 1) return denied('access_denied');
  const email = principal.email.trim().toLowerCase();
  const partnerMatches = partners.filter(partner => partner && nonblank(partner.loginEmail) && partner.loginEmail.trim().toLowerCase() === email);
  if (partnerMatches.length !== 1 || !nonblank(partnerMatches[0].id)) return denied('unmapped_login');
  return { ok: true, partnerId: partnerMatches[0].id, permission: 'oltp.read' };
}
