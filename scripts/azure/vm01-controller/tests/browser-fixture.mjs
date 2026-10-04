import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { securityHeaders, createApiHandler } from '../dist/src/http.js';
import { fixture, ids } from './helpers.mjs';
const stub = `export const BrowserCacheLocation={MemoryStorage:'memory'};export class PublicClientApplication{async initialize(){}async loginPopup(){return{account:{username:'fixture@example.invalid'}}}async acquireTokenSilent(){return{accessToken:'fixture-only'}}async acquireTokenPopup(){return{accessToken:'fixture-only'}}async logoutPopup(){}}`;
const bundle = await build({ entryPoints: ['web/app.ts'], bundle: true, write: false, format: 'esm', target: 'es2023', plugins: [{ name: 'fixture-msal', setup(builder) { builder.onResolve({ filter: /^@azure\/msal-browser$/ }, () => ({ path: 'fixture-msal', namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: stub, loader: 'js' })); } }] });
export async function withBrowser(run, overrides = {}) {
  const f = fixture(overrides); if (!overrides.operationPollingEnabled) f.arm.outcome = { status: 200 };
  const errors = [], pageErrors = [], patternErrors = [], requests = [];
  const hooks = { before: null, after: null };
  let origin, handler, browser;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const input = new Request(url, { method: request.method, headers: request.headers, ...(body.length ? { body } : {}) });
        requests.push({ method: request.method, url: url.href, body: body.length ? JSON.parse(body) : null });
        let result = await hooks.before?.(input) ?? await handler(input);
        result = await hooks.after?.(result, input) ?? result;
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
      }
      const callback = url.pathname === '/auth/callback';
      const headers = { ...securityHeaders, ...(callback ? { 'content-security-policy': securityHeaders['content-security-policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : {}) };
      const asset = ({ '/': ['index.html', 'text/html'], '/assets/style.css': ['style.css', 'text/css'], '/auth/callback': ['auth-callback.html', 'text/html'], '/assets/auth-callback.js': ['auth-callback.js', 'text/javascript'] })[url.pathname];
      if (url.pathname === '/assets/config.js') { response.writeHead(200, { ...headers, 'content-type': 'text/javascript' }); response.end(`window.VM01_CONFIGURATION=${JSON.stringify({ ...f.config, origin })};`); }
      else if (url.pathname === '/assets/app.js') { response.writeHead(200, { ...headers, 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0].text); }
      else if (asset) { response.writeHead(200, { ...headers, 'content-type': asset[1] }); response.end(await readFile(`dist/web/${asset[0]}`)); }
      else { response.writeHead(404); response.end(); }
    } catch (error) { errors.push(error); response.writeHead(500); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  const cfg = { ...f.config, origin };
  handler = createApiHandler(cfg, f.controller, async () => ({ ver: '2.0', tid: cfg.tenantId, aud: ids.api, oid: ids.user, azp: ids.browser, scp: 'vm01.control' }));
  try {
    const windows = process.platform === 'win32';
    browser = await chromium.launch({ executablePath: process.env.VM01_TEST_CHROMIUM ?? '/usr/bin/chromium', headless: true, chromiumSandbox: windows, args: windows ? [] : ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => pageErrors.push(error));
    page.on('console', entry => { if (/pattern attribute|Invalid regular expression/i.test(entry.text())) patternErrors.push(entry.text()); });
    await page.addInitScript(now => { window.fixtureNow = now; Date.now = () => window.fixtureNow; }, f.now());
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.locator('#sign-in').click();
    await page.waitForFunction(() => !document.querySelector('[data-action=restart]').disabled);
    await run({ page, f, origin, requests, hooks });
    assert.deepEqual(pageErrors, []); assert.deepEqual(patternErrors, []); assert.deepEqual(errors, []);
  } finally { try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); } }
}
export const pending = page => page.evaluate(() => sessionStorage.getItem('vm01-pending-request'));
export async function check(page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/vm01/status');
  await page.locator('#retry').click(); await response;
}
export async function confirmAction(page, action = 'deallocate') {
  await page.locator(`[data-action=${action}]`).click();
  await page.locator('#saved').check(); await page.locator('#held').check();
  await page.locator('#approval').fill('fixture-approval');
  await page.locator('#confirm-submit').click();
}
