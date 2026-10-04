import { X509Certificate, createHash, createPrivateKey, randomUUID, sign, constants, type KeyObject } from 'node:crypto';
import { TARGET_TENANT_ID } from '../src/configuration.js';

// Public pins from the existing controller registration. No caller-supplied destinations.
export const CLOUD_CLIENT_ID = 'af64b0c6-261c-45a0-b653-a71d382edb92';
export const CLOUD_API_ID = 'f8fc0efe-38ac-489a-b2b4-98d1afc9505b';
export const CLOUD_TOKEN_URL = `https://login.microsoftonline.com/${TARGET_TENANT_ID}/oauth2/v2.0/token`;
export const CLOUD_STATUS_URL = 'https://vmcontroller.mw-credit.com/api/vm01/status';
export const CLOUD_SCOPE = `api://${CLOUD_API_ID}/.default`;
export const PRIVATE_KEY_VARIABLE = 'VM01_CONTROLLER_PRIVATE_KEY_PEM';
export const CERTIFICATE_VARIABLE = 'VM01_CONTROLLER_CERTIFICATE_PEM';
const VM_ID = '0af4bbf5-ce75-43d7-931f-9e8c4a13dfe9';
const REQUEST_ID = /^\d{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$(?![\s\S])/i;
const TIMEOUT_MS = 15000;
const RESPONSE_LIMIT = 65536;
const phases = new Set(['dispatching', 'accepted', 'accepted_unverified', 'desired_state_observed', 'completed', 'rejected', 'unknown', 'noop']);
const powerStates = new Set(['running', 'stopped', 'deallocated', 'starting', 'stopping', 'deallocating', 'unknown']);
const provisioningStates = new Set(['Succeeded', 'Failed', 'Canceled', 'Creating', 'Updating', 'Deleting', 'Migrating', 'Unknown']);

export class CloudClientError extends Error {
  constructor(public readonly code: 'invalid_arguments' | 'credential_unavailable' | 'credential_invalid' | 'certificate_not_current' | 'token_transport_failed' | 'token_rejected' | 'token_response_invalid' | 'status_transport_failed' | 'status_rejected' | 'status_response_invalid', public readonly httpStatus?: number) {
    super(code); this.name = 'CloudClientError';
  }
}
interface Credential { privateKey: KeyObject; thumbprint: string; expiresAt: number }
// Dependency injection is for offline fixtures; the CLI always uses these production defaults.
interface Dependencies { fetch: typeof fetch; now: () => number; loadCredential: (env: NodeJS.ProcessEnv, now: number) => Credential }
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
export function loadCertificateCredential(env: NodeJS.ProcessEnv, now: number): Credential {
  const keyPem = env[PRIVATE_KEY_VARIABLE]; const certPem = env[CERTIFICATE_VARIABLE];
  if (!keyPem || !certPem) throw new CloudClientError('credential_unavailable');
  try {
    if (keyPem.length > 16384 || certPem.length > 16384 || !/^-----BEGIN PRIVATE KEY-----\r?\n/.test(keyPem) || !/^-----BEGIN CERTIFICATE-----\r?\n/.test(certPem)) throw new Error();
    const certificate = new X509Certificate(certPem);
    const startsAt = Date.parse(certificate.validFrom); const expiresAt = Date.parse(certificate.validTo);
    if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) throw new Error();
    if (startsAt > now || expiresAt <= now + 300000) throw new CloudClientError('certificate_not_current');
    const privateKey = createPrivateKey({ key: keyPem, format: 'pem', type: 'pkcs8' });
    if (privateKey.asymmetricKeyType !== 'rsa' || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072 || !certificate.checkPrivateKey(privateKey)) throw new Error();
    return { privateKey, expiresAt, thumbprint: createHash('sha256').update(certificate.raw).digest('base64url') };
  } catch (error) {
    if (error instanceof CloudClientError) throw error;
    throw new CloudClientError('credential_invalid');
  }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error();
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > RESPONSE_LIMIT)) { await response.body.cancel(); throw new Error(); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > RESPONSE_LIMIT) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
async function requestJson(transport: typeof fetch, url: string, init: RequestInit, stage: 'token' | 'status'): Promise<Record<string, unknown>> {
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try { response = await transport(url, { ...init, redirect: 'error', cache: 'no-store', signal: abort.signal }); }
    catch { throw new CloudClientError(stage === 'token' ? 'token_transport_failed' : 'status_transport_failed'); }
    // Fetch rejects redirects. The additional check also rejects redirected custom transports.
    if (response.redirected || (response.url && response.url !== url)) { await response.body?.cancel().catch(() => {}); throw new CloudClientError(stage === 'token' ? 'token_transport_failed' : 'status_transport_failed'); }
    if (response.status !== 200) { await response.body?.cancel().catch(() => {}); throw new CloudClientError(stage === 'token' ? 'token_rejected' : 'status_rejected', response.status); }
    try { const value = record(await boundedJson(response)); if (!value) throw new Error(); return value; }
    catch { throw new CloudClientError(stage === 'token' ? 'token_response_invalid' : 'status_response_invalid', response.status); }
  } finally { clearTimeout(timer); }
}
function statusProjection(data: Record<string, unknown>, now: number, requestId?: string): Record<string, unknown> {
  const observation = record(data.observation); const actions = record(data.actions);
  if (data.vm !== 'VM-01' || data.error !== undefined || !observation || observation.vmId !== VM_ID || typeof observation.powerState !== 'string' || !powerStates.has(observation.powerState) || typeof observation.provisioningState !== 'string' || !provisioningStates.has(observation.provisioningState) || !timestamp(observation.observedAt) || now - Date.parse(observation.observedAt) > 120000 || Date.parse(observation.observedAt) > now + 30000 || !Number.isSafeInteger(data.generation) || Number(data.generation) < 0 || typeof data.stateVersion !== 'string' || !/^[0-9a-f]{64}$/.test(data.stateVersion) || !actions || !['start', 'restart', 'deallocate'].every(action => typeof actions[action] === 'boolean')) throw new CloudClientError('status_response_invalid');
  let operation: Record<string, unknown> | undefined;
  if (data.operation !== undefined) {
    const op = record(data.operation);
    if (!op || typeof op.requestId !== 'string' || !REQUEST_ID.test(op.requestId) || (requestId && op.requestId !== requestId) || typeof op.action !== 'string' || !['start', 'restart', 'deallocate'].includes(op.action) || typeof op.phase !== 'string' || !phases.has(op.phase) || !timestamp(op.createdAt) || !timestamp(op.updatedAt)) throw new CloudClientError('status_response_invalid');
    // Omit free-form reasons, tracking URLs and every unexpected response property.
    operation = { requestId: op.requestId, action: op.action, phase: op.phase, createdAt: op.createdAt, updatedAt: op.updatedAt };
  } else if (requestId) throw new CloudClientError('status_response_invalid');
  return { vm: 'VM-01', observation: { vmId: VM_ID, powerState: observation.powerState, provisioningState: observation.provisioningState, observedAt: observation.observedAt }, stateVersion: data.stateVersion, generation: data.generation, actions: { start: actions.start, restart: actions.restart, deallocate: actions.deallocate }, ...(operation ? { operation } : {}), executorReady: null };
}
export function createCloudClient(env: NodeJS.ProcessEnv = process.env, dependencies: Partial<Dependencies> = {}): { status(requestId?: string): Promise<Record<string, unknown>> } {
  const deps: Dependencies = { fetch: globalThis.fetch, now: Date.now, loadCredential: loadCertificateCredential, ...dependencies };
  return {
    async status(requestId?: string) {
      if (requestId !== undefined && !REQUEST_ID.test(requestId)) throw new CloudClientError('invalid_arguments');
      const now = deps.now(); let credential: Credential;
      try { credential = deps.loadCredential(env, now); } catch (error) { if (error instanceof CloudClientError) throw error; throw new CloudClientError('credential_invalid'); }
      const seconds = Math.floor(now / 1000);
      let assertion: string;
      try {
        const header = Buffer.from(JSON.stringify({ alg: 'PS256', typ: 'JWT', 'x5t#S256': credential.thumbprint })).toString('base64url');
        const claims = Buffer.from(JSON.stringify({ aud: CLOUD_TOKEN_URL, iss: CLOUD_CLIENT_ID, sub: CLOUD_CLIENT_ID, jti: randomUUID(), iat: seconds, nbf: seconds, exp: seconds + 300 })).toString('base64url');
        const input = `${header}.${claims}`;
        assertion = `${input}.${sign('sha256', Buffer.from(input), { key: credential.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('base64url')}`;
      } catch { throw new CloudClientError('credential_invalid'); }
      const body = new URLSearchParams({ client_id: CLOUD_CLIENT_ID, scope: CLOUD_SCOPE, grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion });
      const token = await requestJson(deps.fetch, CLOUD_TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body }, 'token');
      if (token.token_type !== 'Bearer' || typeof token.access_token !== 'string' || !/^[A-Za-z0-9._~-]{1,16384}$(?![\s\S])/.test(token.access_token) || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in < 60) throw new CloudClientError('token_response_invalid');
      const url = new URL(CLOUD_STATUS_URL); if (requestId) url.searchParams.set('requestId', requestId);
      const status = await requestJson(deps.fetch, url.href, { method: 'GET', headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' } }, 'status');
      return { ...statusProjection(status, deps.now(), requestId), certificate: { expiresAt: new Date(credential.expiresAt).toISOString(), renewalDue: credential.expiresAt - deps.now() <= 30 * 86400000 } };
    }
  };
}
export function parseStatusArguments(args: readonly string[]): string | undefined {
  if (args.length === 1 && args[0] === 'status') return undefined;
  if (args.length === 3 && args[0] === 'status' && args[1] === '--request-id' && REQUEST_ID.test(args[2]!)) return args[2];
  throw new CloudClientError('invalid_arguments');
}
