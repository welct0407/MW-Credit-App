export class ControllerError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export function fail(status: number, code: string): never { throw new ControllerError(status, code); }
export function errorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  return error instanceof ControllerError
    ? { status: error.status, body: { error: error.code } }
    : { status: 503, body: { error: 'controller_unavailable' } };
}
