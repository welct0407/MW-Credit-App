/** Synthetic verifier-output contract only; not token verification or a live security boundary. */
export type VerifiedPrincipal = { serverVerified: boolean; subject: string; email: string; emailVerified: boolean; environment: string; issuer: string; audience: string; expiresAtMs: number; revoked: boolean; disabled: boolean };
export type AccessContext = { principal: VerifiedPrincipal | null; config: { mode: 'synthetic'; environment: string; issuer: string; audience: string }; grants: { subject: string; environment: string; enabled: boolean; permissions: string[] }[]; partners: { id: string; loginEmail: string; [key: string]: unknown }[]; nowMs: number };
export type AccessDenial = { ok: false; code: 'configuration_invalid' | 'signed_out' | 'access_denied' | 'expired' | 'unmapped_login' };
export function evaluateReadAccess(context?: AccessContext): AccessDenial | { ok: true; partnerId: string; permission: 'oltp.read' };
