import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ids } from './helpers.mjs';

// Opt in with official Core Tools and an untrusted test PFX kept outside the
// repository. This runs the actual Functions router, without Easy Auth or tokens.
const executable = process.env.VM01_TEST_FUNC;
const certificate = process.env.VM01_TEST_CERT;
const passwordFile = process.env.VM01_TEST_CERT_PASSWORD_FILE;
test('real Functions host keeps static routes separate from the status API', {
  skip: !executable || !certificate || !passwordFile,
  timeout: 60000
}, async () => {
  const requestedPort = Number(process.env.VM01_TEST_FUNC_PORT ?? 0);
  assert.ok(Number.isInteger(requestedPort) && (requestedPort === 0 || (requestedPort >= 1024 && requestedPort <= 65535)));
  // Fail if an explicitly requested port belongs to another process; by default
  // choose an available port so readiness cannot accept a pre-existing host.
  const port = await new Promise((resolve, reject) => {
    const reservation = net.createServer(); reservation.on('error', reject);
    reservation.listen(requestedPort, '127.0.0.1', () => {
      const selected = reservation.address().port;
      reservation.close(error => error ? reject(error) : resolve(selected));
    });
  });
  const origin = `https://localhost:${port}`;
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    FUNCTIONS_WORKER_RUNTIME: 'node', FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR: 'true',
    VM01_TENANT_ID: config.tenantId, VM01_RESOURCE_ID: config.resourceId, VM01_ORIGIN: origin,
    VM01_API_CLIENT_ID: ids.api, VM01_BROWSER_CLIENT_ID: ids.browser, VM01_BROWSER_USER_IDS: ids.user,
    VM01_EXPECTED_VM_ID: ids.vm, VM01_STORAGE_ACCOUNT: 'fixturevm01',
    VM01_ENABLE_MUTATIONS: 'false', VM01_ENABLE_OPERATION_POLLING: 'false' };
  const proc = spawn(executable, ['host', 'start', '--port', String(port), '--useHttps', '--cert', certificate, '--password', passwordFile], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; let startupError;
  proc.stdout.on('data', chunk => { output += chunk; });
  proc.stderr.on('data', chunk => { output += chunk; });
  proc.on('error', error => { startupError = error; });
  const closed = new Promise(resolve => proc.once('close', resolve));
  const request = (pathname, method = 'GET') => new Promise((resolve, reject) => {
    // TLS bypass is restricted to this fixed loopback URL and ephemeral test cert.
    const req = https.request(origin + pathname, { method, rejectUnauthorized: false, timeout: 3000 }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Local host timeout'))); req.end();
  });
  const jsonError = async (pathname, method, status, error) => {
    const response = await request(pathname, method);
    assert.equal(response.status, status, pathname);
    assert.match(response.headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(response.body), { error });
    assert.equal(response.headers['cache-control'], 'no-store');
  };
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (startupError) throw startupError;
      if (proc.exitCode !== null) throw new Error(`Functions host exited ${proc.exitCode}: ${output}`);
      try { if ((await request('/assets/config.js')).status === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, `Functions were not ready: ${output}`);
    await jsonError('/api/vm01/status', 'GET', 401, 'bearer_token_required');
    await jsonError('/api/vm01/status?requestId=123', 'GET', 401, 'bearer_token_required');
    await jsonError('/api/vm01/status', 'POST', 405, 'method_not_allowed');
    for (const action of ['start', 'restart', 'deallocate']) await jsonError(`/api/vm01/${action}`, 'GET', 405, 'method_not_allowed');
    for (const pathname of ['/', '/auth/callback?code=synthetic', '/assets/config.js', '/assets/app.js', '/assets/auth-callback.js', '/assets/style.css']) {
      const response = await request(pathname);
      assert.equal(response.status, 200, pathname); assert.ok(response.body.length > 0);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.ok(response.headers['content-security-policy'].includes(pathname.startsWith('/auth/callback') ? "frame-ancestors 'self'" : "frame-ancestors 'none'"));
    }
    assert.equal((await request('/assets/app.js?x=1')).status, 404);
    assert.equal((await request('/unknown')).status, 404);
  } finally { proc.kill(); await closed; }
});
