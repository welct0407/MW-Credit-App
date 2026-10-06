export class StatusCheckError extends Error {
  constructor(public readonly stage: 'token' | 'transport' | 'response', public readonly status?: number) { super(stage); }
}

export async function responseData(response: Response): Promise<Record<string, unknown>> {
  let data: unknown;
  try { data = await response.json(); } catch { throw new StatusCheckError('response', response.status); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new StatusCheckError('response', response.status);
  return data as Record<string, unknown>;
}

const publicErrors = new Set(['bearer_token_required', 'invalid_access_token', 'caller_not_allowed', 'browser_not_allowed', 'application_not_allowed', 'operation_not_allowed', 'foreign_origin', 'unexpected_host', 'route_not_found', 'method_not_allowed', 'invalid_query', 'vm_observation_unavailable', 'controller_ledger_unavailable', 'controller_unavailable']);
export function statusFailure(status: number, code: unknown): string {
  const detail = typeof code === 'string' && publicErrors.has(code) ? `; ${code}` : '';
  return `Status request failed (HTTP ${status}${detail}). Actions are disabled.`;
}
export function statusException(error: unknown): string {
  if (error instanceof StatusCheckError) {
    if (error.stage === 'token') return 'Access token acquisition failed. Sign in again. Actions are disabled.';
    if (error.stage === 'transport') return 'Status request could not complete. Actions are disabled.';
    return `Status response was empty or invalid (HTTP ${error.status}). Actions are disabled.`;
  }
  return 'Status check failed. Actions are disabled.';
}
