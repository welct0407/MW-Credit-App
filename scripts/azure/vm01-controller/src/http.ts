import type { Configuration, ResponseData } from './types.js';
import { Controller } from './controller.js';
import { authenticate, type TokenVerifier, validateOrigin } from './authorization.js';
import { errorResponse, fail } from './errors.js';
export const securityHeaders: Record<string, string> = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://login.microsoftonline.com; frame-src 'self' https://login.microsoftonline.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};
export function createApiHandler(config: Configuration, controller: Controller, verify: TokenVerifier): (request: Request) => Promise<Response> {
  return async request => {
    let result: ResponseData;
    try {
      const url = new URL(request.url);
      if (url.origin !== config.origin) fail(400, 'unexpected_host');
      const match = /^\/api\/vm01\/(status|start|restart|deallocate)$/.exec(url.pathname);
      if (!match) fail(404, 'route_not_found');
      const operation = match[1]!;
      if (request.method !== (operation === 'status' ? 'GET' : 'POST')) fail(405, 'method_not_allowed');
      validateOrigin(request.headers, config);
      const principal = await authenticate(request.headers, config, verify);
      if (operation === 'status') {
        if ([...url.searchParams.keys()].some(k => k !== 'requestId') || url.searchParams.getAll('requestId').length > 1) fail(400, 'invalid_query');
        const requestId = url.searchParams.get('requestId') ?? undefined;
        if (requestId && !/^\d{13}\.[0-9a-f-]{36}$/i.test(requestId)) fail(400, 'invalid_query');
        result = await controller.status(principal, requestId);
      } else {
        if (url.search) fail(400, 'invalid_query');
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) fail(415, 'json_required');
        const declaredLength = request.headers.get('content-length');
        if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 4096)) fail(413, 'request_too_large');
        if (!request.body) fail(400, 'invalid_json');
        const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); fail(413, 'request_too_large'); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...securityHeaders, 'content-type': 'application/json' } }); }
        result = await controller.action(principal, operation as 'start' | 'restart' | 'deallocate', body);
      }
    } catch (error) { result = errorResponse(error); }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { ...securityHeaders, 'content-type': 'application/json', ...(result.retryAfter ? { 'retry-after': String(result.retryAfter) } : {}) } });
  };
}
