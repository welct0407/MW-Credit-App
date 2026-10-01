import { ManagedIdentityCredential } from '@azure/identity';
import type { Action, Arm, ArmOutcome, Configuration, PollOutcome, PowerState, VmObservation } from './types.js';
import { fail } from './errors.js';
import { UUID } from './configuration.js';
export interface ArmCredential { getToken(scope: string): Promise<{ token: string } | null> }
export type Fetch = typeof fetch;
export function validatedOperationUrl(value: string, config: Configuration): string {
  let url: URL;
  try { url = new URL(value); } catch { return fail(503, 'invalid_operation_url'); }
  const subscription = config.resourceId.split('/')[2]!;
  const prefix = `/subscriptions/${subscription}/providers/Microsoft.Compute/locations/southeastasia/operations/`;
  const operationId = url.pathname.slice(prefix.length);
  if (url.protocol !== 'https:' || url.hostname !== 'management.azure.com' || url.port || url.username || url.password || url.hash || !url.pathname.startsWith(prefix) || !UUID.test(operationId) || url.searchParams.size !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('api-version') ?? '') || value.includes('%')) fail(503, 'invalid_operation_url');
  return url.href;
}
export function retryAfter(value: string | null): number {
  return value && /^\d+$/.test(value) ? Math.max(15, Math.min(300, Number(value))) : 15;
}
export class AzureArm implements Arm {
  constructor(private readonly config: Configuration, private readonly credential: ArmCredential = new ManagedIdentityCredential(), private readonly fetcher: Fetch = fetch, private readonly now: () => number = Date.now) {}
  private async request(url: string, method: 'GET' | 'POST'): Promise<Response> {
    const token = await this.credential.getToken('https://management.azure.com/.default');
    if (!token) fail(503, 'managed_identity_unavailable');
    return this.fetcher(url, { method, headers: { authorization: `Bearer ${token.token}`, accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  }
  async observe(): Promise<VmObservation> {
    // Expanded instance view is one bounded GET of the fixed VM, never a list operation.
    const response = await this.request(`https://management.azure.com${this.config.resourceId}?api-version=${this.config.apiVersion}&$expand=instanceView`, 'GET');
    if (response.status !== 200) fail(503, 'vm_observation_unavailable');
    const body = await response.json() as { properties?: { vmId?: unknown; provisioningState?: unknown; instanceView?: { statuses?: { code?: unknown }[] } } };
    const properties = body.properties;
    if (!properties || typeof properties.vmId !== 'string' || !UUID.test(properties.vmId) || typeof properties.provisioningState !== 'string' || !Array.isArray(properties.instanceView?.statuses)) fail(503, 'invalid_vm_observation');
    const powerEntries = properties.instanceView.statuses.filter(x => typeof x.code === 'string' && x.code.startsWith('PowerState/'));
    const rawPower = powerEntries.length === 1 ? String(powerEntries[0]!.code).slice('PowerState/'.length) : 'unknown';
    const powerState = ['running', 'stopped', 'deallocated', 'starting', 'stopping', 'deallocating'].includes(rawPower) ? rawPower as PowerState : 'unknown';
    return { vmId: properties.vmId.toLowerCase(), provisioningState: properties.provisioningState, powerState, observedAt: new Date(this.now()).toISOString() };
  }
  async submit(action: Action): Promise<ArmOutcome> {
    if (!['start', 'restart', 'deallocate'].includes(action)) fail(400, 'invalid_action');
    const response = await this.request(`https://management.azure.com${this.config.resourceId}/${action}?api-version=${this.config.apiVersion}`, 'POST');
    const result: ArmOutcome = { status: response.status };
    const requestId = response.headers.get('x-ms-request-id');
    if (requestId && UUID.test(requestId)) result.requestId = requestId;
    if (response.status === 202) {
      const candidate = response.headers.get('Azure-AsyncOperation') ?? response.headers.get('Location');
      if (candidate) {
        // Invalid response URLs are discarded; acceptance still requires reconciliation.
        try { result.trackingUrl = validatedOperationUrl(candidate, this.config); result.trackingKind = response.headers.has('Azure-AsyncOperation') ? 'async' : 'location'; } catch { /* no raw URL persistence/logging */ }
      }
      result.retryAfter = retryAfter(response.headers.get('Retry-After'));
    }
    // Response bodies can contain credential-bearing text; deliberately do not log or return them.
    await response.body?.cancel();
    return result;
  }
  async poll(value: string, kind: 'async' | 'location' = 'async'): Promise<PollOutcome> {
    if (!this.config.operationPollingEnabled) fail(503, 'operation_polling_disabled');
    const response = await this.request(validatedOperationUrl(value, this.config), 'GET');
    if (kind === 'location' && response.status === 202) return { status: 'InProgress', retryAfter: retryAfter(response.headers.get('Retry-After')) };
    if (kind === 'location' && response.status === 204) return { status: 'Succeeded', retryAfter: 15 };
    if (response.status !== 200) fail(503, response.status === 403 ? 'operation_read_not_authorized' : 'operation_status_unavailable');
    if (kind === 'location') { await response.body?.cancel(); return { status: 'Succeeded', retryAfter: 15 }; }
    const body = await response.json() as { status?: unknown; error?: { code?: unknown } };
    if (typeof body.status !== 'string') {
      fail(503, 'invalid_operation_status');
    }
    const status = ['Succeeded', 'Failed', 'Canceled'].includes(body.status) ? body.status as PollOutcome['status'] : 'InProgress';
    const failureCode = typeof body.error?.code === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(body.error.code) ? body.error.code : undefined;
    return { status, retryAfter: retryAfter(response.headers.get('Retry-After')), ...(failureCode ? { failureCode } : {}) };
  }
}
