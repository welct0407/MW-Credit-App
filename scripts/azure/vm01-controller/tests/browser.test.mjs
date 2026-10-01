import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { securityHeaders, createApiHandler } from '../dist/src/http.js';
import { fixture, ids } from './helpers.mjs';
const stub = `export const BrowserCacheLocation={MemoryStorage:'memory'};export class PublicClientApplication{async initialize(){}async loginPopup(){return{account:{username:'fixture@example.invalid'}}}async acquireTokenSilent(){return{accessToken:'fixture-only'}}async acquireTokenPopup(){return{accessToken:'fixture-only'}}async logoutPopup(){}}`;
const bundle = await build({ entryPoints: ['web/app.ts'], bundle: true, write: false, format: 'esm', target: 'es2023', plugins: [{ name: 'fixture-msal', setup(builder) { builder.onResolve({ filter: /^@azure\/msal-browser$/ }, () => ({ path: 'fixture-msal', namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: stub, loader: 'js' })); } }] });
test('browser confirmation cancellation, same-origin auth bridge and saved-request behavior', async () => {
  const f = fixture(); f.arm.outcome = { status: 200 }; const errors = [];
  let origin; let handler;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const result = await handler(new Request(url, { method: request.method, headers: request.headers, ...(body.length ? { body } : {}) }));
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
  const browser = await chromium.launch({ executablePath: process.env.VM01_TEST_CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const pageErrors = []; page.on('pageerror', error => pageErrors.push(error));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin); await page.locator('#sign-in').click(); await page.locator('[data-action=restart]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-action=restart]').disabled);
    await page.locator('[data-action=restart]').click(); await page.locator('#saved').check(); await page.locator('#held').check(); await page.locator('#approval').fill('fixture-approval');
    const firstDispatch = page.waitForResponse(response => response.url() === `${origin}/api/vm01/restart` && response.request().method() === 'POST');
    await page.locator('#confirm-submit').click(); assert.equal((await firstDispatch).status(), 200);
    await page.waitForFunction(() => !document.querySelector('[data-action=restart]').disabled);
    assert.equal(f.arm.calls.length, 1);
    await page.locator('[data-action=restart]').click(); await page.locator('#approval').fill('second-approval'); await page.keyboard.press('Escape');
    await page.locator('#refresh').click(); await page.waitForFunction(() => !document.querySelector('#confirm').open); assert.equal(f.arm.calls.length, 1);
    await page.locator('[data-action=restart]').click(); await page.locator('#saved').check(); await page.locator('#held').check(); await page.locator('#approval').fill('third-approval'); await page.locator('button[value=cancel]').click(); await page.waitForFunction(() => !document.querySelector('#confirm').open); assert.equal(f.arm.calls.length, 1);
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.id = 'bridge-fixture'; frame.src = '/auth/callback'; document.body.append(frame); });
    await page.frameLocator('#bridge-fixture').locator('#auth-result').waitFor();
    assert.match(await page.frameLocator('#bridge-fixture').locator('#auth-result').textContent(), /Return to VM-01/);
    // A server failure after dispatch keeps the saved idempotency ID for safe receipt retrieval/retry.
    f.port.failWrite = f.port.writes + 2;
    await page.locator('[data-action=restart]').click(); await page.locator('#saved').check(); await page.locator('#held').check(); await page.locator('#approval').fill('failure-approval');
    const failedDispatch = page.waitForResponse(response => response.url() === `${origin}/api/vm01/restart` && response.request().method() === 'POST');
    await page.locator('#confirm-submit').click(); assert.equal((await failedDispatch).status(), 503);
    await page.waitForFunction(() => sessionStorage.getItem('vm01-pending-request') !== null && document.querySelector('#retry').hidden === false);
    assert.equal(f.arm.calls.length, 2);
    const retryDispatch = page.waitForResponse(response => response.url() === `${origin}/api/vm01/restart` && response.request().method() === 'POST');
    await page.locator('#retry').click(); assert.equal((await retryDispatch).status(), 202); assert.equal(f.arm.calls.length, 2);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
    assert.deepEqual(pageErrors, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
