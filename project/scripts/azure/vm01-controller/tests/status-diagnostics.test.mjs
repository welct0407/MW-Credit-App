import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const stub = `export const BrowserCacheLocation={MemoryStorage:'memory'};export class PublicClientApplication{async initialize(){}async loginPopup(){return{account:{username:'fixture@example.invalid'}}}async acquireTokenSilent(){if(globalThis.fixtureTokenFailure)throw new Error('private fixture detail');return{accessToken:'fixture-only'}}async acquireTokenPopup(){throw new Error('private fixture detail')}async logoutPopup(){}}`;
const bundle = await build({ entryPoints: ['web/app.ts'], bundle: true, write: false, format: 'esm', target: 'es2023', plugins: [{ name: 'fixture-msal', setup(builder) { builder.onResolve({ filter: /^@azure\/msal-browser$/ }, () => ({ path: 'fixture-msal', namespace: 'fixture' })); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: stub, loader: 'js' })); } }] });
const disabled = { start: false, restart: false, deallocate: false };
const valid = { observation: { powerState: 'running', provisioningState: 'Succeeded', observedAt: new Date().toISOString() }, stateVersion: 'fixture', actions: disabled };

test('browser status diagnostics identify the failure stage and recover without exposing response details', async t => {
  let origin;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, origin).pathname;
    if (path === '/assets/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle.outputFiles[0].text); }
    else if (path === '/assets/config.js') { response.setHeader('content-type', 'text/javascript'); response.end(`window.VM01_CONFIGURATION=${JSON.stringify({ tenantId: 'fixture', browserClientId: 'fixture', apiClientId: 'fixture', origin })};`); }
    else if (path === '/assets/style.css') { response.setHeader('content-type', 'text/css'); response.end(await readFile('web/style.css')); }
    else { response.setHeader('content-type', 'text/html'); response.end(await readFile('web/index.html')); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const windows = process.platform === 'win32';
    browser = await chromium.launch({ executablePath: process.env.VM01_TEST_CHROMIUM ?? '/usr/bin/chromium', headless: true, chromiumSandbox: windows, args: windows ? [] : ['--no-sandbox', '--disable-dev-shm-usage'] });
    const cases = [
      { name: 'empty401', status: 401, body: '', expected: /empty or invalid \(HTTP 401\)/ },
      { name: 'empty403', status: 403, body: '', expected: /empty or invalid \(HTTP 403\)/ },
      { name: 'HTML502', status: 502, body: '<html>private fixture detail</html>', expected: /empty or invalid \(HTTP 502\)/ },
      { name: 'JSON401', status: 401, body: JSON.stringify({ error: 'invalid_access_token' }), expected: /HTTP 401; invalid_access_token/ },
      { name: 'JSON403', status: 403, body: JSON.stringify({ error: 'browser_not_allowed', actions: { start: true } }), expected: /HTTP 403; browser_not_allowed/ },
      { name: 'JSON503', status: 503, body: JSON.stringify({ error: 'vm_observation_unavailable' }), expected: /HTTP 503; vm_observation_unavailable/ },
      { name: 'ledger503', status: 503, body: JSON.stringify({ error: 'controller_ledger_unavailable' }), expected: /HTTP 503; controller_ledger_unavailable/ },
      { name: 'untrustedError', status: 503, body: JSON.stringify({ error: 'private fixture detail' }), expected: /HTTP 503\)/ },
      { name: 'malformed200', status: 200, body: '{', expected: /empty or invalid \(HTTP 200\)/ },
      { name: 'null200', status: 200, body: 'null', expected: /empty or invalid \(HTTP 200\)/ },
      { name: 'tokenFailure', tokenFailure: true, expected: /Access token acquisition failed/ },
      { name: 'transportFailure', transportFailure: true, expected: /Status request could not complete/ }
    ];
    for (const item of cases) await t.test(item.name, async () => {
      const page = await browser.newPage();
      let recovered = false; let requests = 0; let posts = 0;
      await page.addInitScript(fail => { globalThis.fixtureTokenFailure = fail; }, Boolean(item.tokenFailure));
      await page.route('**/*', async route => {
        if (!route.request().url().startsWith(origin)) return route.abort();
        if (!route.request().url().includes('/api/')) return route.continue();
        requests++; if (route.request().method() !== 'GET') posts++;
        if (item.transportFailure && !recovered) return route.abort();
        return route.fulfill({ status: recovered ? 200 : item.status, contentType: 'application/json', body: recovered ? JSON.stringify(valid) : item.body });
      });
      try {
        await page.goto(origin); await page.locator('#sign-in').click();
        await page.waitForFunction(() => document.querySelector('#message').textContent.includes('Actions are disabled'));
        assert.match(await page.locator('#message').textContent(), item.expected);
        assert.doesNotMatch(await page.locator('#message').textContent(), /private fixture detail/);
        assert.equal(await page.locator('#power').textContent(), 'Unknown');
        assert.equal(await page.locator('[data-action]:enabled').count(), 0);
        assert.equal(requests, item.tokenFailure ? 0 : 1); assert.equal(posts, 0);
        recovered = true; await page.evaluate(() => { globalThis.fixtureTokenFailure = false; });
        await page.locator('#refresh').click(); await page.waitForFunction(() => document.querySelector('#power').textContent === 'running');
        assert.equal(await page.locator('#message').textContent(), '');
        assert.equal(await page.locator('[data-action]:enabled').count(), 0); assert.equal(posts, 0);
      } finally { await page.close(); }
    });
  } finally { try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); } }
});
