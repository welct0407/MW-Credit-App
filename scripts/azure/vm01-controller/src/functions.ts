import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { configuration } from './configuration.js';
import { AzureArm } from './arm.js';
import { BlobLedger } from './ledger.js';
import { Controller } from './controller.js';
import { entraVerifier } from './authorization.js';
import { createApiHandler, securityHeaders } from './http.js';
const config = configuration();
const handler = createApiHandler(config, new Controller(config, new BlobLedger(config), new AzureArm(config)), entraVerifier(config));
async function api(request: HttpRequest): Promise<HttpResponseInit> {
  const headers = new Headers(); request.headers.forEach((value, key) => headers.append(key, value));
  const response = await handler(new Request(request.url, { method: request.method, headers, ...(request.body ? { body: request.body, duplex: 'half' } : {}) } as RequestInit));
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}
for (const action of ['status', 'start', 'restart', 'deallocate']) app.http(`vm01-${action}`, { route: `api/vm01/${action}`, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'], authLevel: 'anonymous', handler: api });
const assets: Record<string, { file: string; contentType: string }> = {
  '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/auth/callback': { file: 'auth-callback.html', contentType: 'text/html; charset=utf-8' },
  '/assets/auth-callback.js': { file: 'auth-callback.js', contentType: 'text/javascript; charset=utf-8' },
  '/assets/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/assets/style.css': { file: 'style.css', contentType: 'text/css; charset=utf-8' }
};
app.http('vm01-static', { route: '{*path}', methods: ['GET'], authLevel: 'anonymous', handler: async request => {
  const url = new URL(request.url);
  if (url.origin !== config.origin || (url.search && url.pathname !== '/auth/callback')) return { status: 404, headers: securityHeaders };
  if (url.pathname === '/assets/config.js') return { status: 200, headers: { ...securityHeaders, 'content-type': 'text/javascript; charset=utf-8' }, body: `window.VM01_CONFIGURATION=${JSON.stringify({ tenantId: config.tenantId, browserClientId: config.browserClientId, apiClientId: config.apiClientId, origin: config.origin })};` };
  const asset = assets[url.pathname];
  if (!asset) return { status: 404, headers: securityHeaders };
  const headers = url.pathname === '/auth/callback' ? { ...securityHeaders, 'content-security-policy': securityHeaders['content-security-policy']!.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : securityHeaders;
  return { status: 200, headers: { ...headers, 'content-type': asset.contentType }, body: await readFile(fileURLToPath(new URL(`../web/${asset.file}`, import.meta.url))) };
} });
