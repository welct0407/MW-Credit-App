import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Action, Configuration, Principal } from './types.js';
import { fail } from './errors.js';
export type TokenVerifier = (token: string) => Promise<JWTPayload>;
export function entraVerifier(config: Configuration): TokenVerifier {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`), { timeoutDuration: 5000 });
  return async token => (await jwtVerify(token, jwks, { issuer, audience: config.apiClientId, algorithms: ['RS256'], clockTolerance: 30, requiredClaims: ['exp', 'iat', 'nbf', 'oid', 'tid', 'azp'] })).payload;
}
export async function authenticate(headers: Headers, config: Configuration, verify: TokenVerifier): Promise<Principal> {
  const authorization = headers.get('authorization');
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 16384) fail(401, 'bearer_token_required');
  let claims: JWTPayload;
  try { claims = await verify(authorization.slice(7)); } catch { return fail(401, 'invalid_access_token'); }
  if (claims.ver !== '2.0' || claims.tid !== config.tenantId || claims.aud !== config.apiClientId || typeof claims.oid !== 'string' || typeof claims.azp !== 'string') fail(403, 'caller_not_allowed');
  if (typeof claims.scp === 'string') {
    if (claims.idtyp === 'app' || claims.azp !== config.browserClientId || !config.browserUserIds.includes(claims.oid) || !claims.scp.split(' ').includes('vm01.control')) fail(403, 'browser_not_allowed');
    return { kind: 'browser', oid: claims.oid, clientId: claims.azp, roles: [] };
  }
  if (!config.cloudClientId || claims.idtyp !== 'app' || claims.azp !== config.cloudClientId || claims.oid !== config.cloudPrincipalId || !Array.isArray(claims.roles) || !claims.roles.every(x => typeof x === 'string')) fail(403, 'application_not_allowed');
  return { kind: 'application', oid: claims.oid, clientId: claims.azp, roles: claims.roles as string[] };
}
export function authorize(principal: Principal, operation: Action | 'status'): void {
  const role = `VM01.${operation[0]!.toUpperCase()}${operation.slice(1)}`;
  if (principal.kind === 'application' && !principal.roles.includes(role)) fail(403, 'operation_not_allowed');
}
export function validateOrigin(headers: Headers, config: Configuration): void {
  const origin = headers.get('origin');
  if ((origin !== null && origin !== config.origin) || headers.get('sec-fetch-site') === 'cross-site') fail(403, 'foreign_origin');
}
