import test from 'node:test';
import assert from 'node:assert/strict';
import { withBrowser, check, confirmAction, pending } from './browser-fixture.mjs';
import { APPROVAL_REFERENCE_PATTERN, validApprovalReference } from '../dist/src/confirmation.js';

test('browser confirmation cancellation, same-origin auth bridge and saved-request behavior', async () => {
  await withBrowser(async ({ page, f, origin, requests }) => {
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
    // A server failure after dispatch keeps the saved ID for read-only verification.
    f.port.failWrite = f.port.writes + 2;
    await page.locator('[data-action=restart]').click(); await page.locator('#saved').check(); await page.locator('#held').check(); await page.locator('#approval').fill('failure-approval');
    const failedDispatch = page.waitForResponse(response => response.url() === `${origin}/api/vm01/restart` && response.request().method() === 'POST');
    await page.locator('#confirm-submit').click(); assert.equal((await failedDispatch).status(), 503);
    await page.waitForFunction(() => sessionStorage.getItem('vm01-pending-request') !== null && document.querySelector('#retry').hidden === false);
    assert.equal(f.arm.calls.length, 2);
    const postCount = requests.filter(r => r.method === 'POST').length;
    await check(page); assert.equal(f.arm.calls.length, 2);
    assert.equal(requests.filter(r => r.method === 'POST').length, postCount);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
  });
});

test('HTML Unicode-sets validation agrees with the API and blocks compound references before POST', async () => {
  await withBrowser(async ({ page, f, requests }) => {
    await page.locator('[data-action=deallocate]').click();
    await page.locator('#saved').check(); await page.locator('#held').check();
    const cases = [
      ['', false], ['Sentinel_ffde07affe9081919268d1a79ca36d2c; vm01-20261003', false],
      ['x y', false], ['.x', false], ['a!b', false], ['a'.repeat(129), false],
      ['Sentinel_ffde07affe9081919268d1a79ca36d2c', true], ['a'.repeat(128), true], ['A0_.:/-9', true]
    ];
    for (const [value, valid] of cases) {
      assert.equal(validApprovalReference(value), valid);
      // Assign programmatically to exercise the 129-character boundary despite maxlength.
      const browserValid = await page.locator('#approval').evaluate((input, value) => {
        input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.checkValidity();
      }, value);
      assert.equal(browserValid, valid, value);
      assert.equal(await page.locator('#confirm-submit').isDisabled(), !valid);
    }
    assert.equal(await page.locator('#approval').getAttribute('pattern'), APPROVAL_REFERENCE_PATTERN);
    assert.equal(requests.filter(r => r.method === 'POST').length, 0); assert.equal(f.arm.calls.length, 0);
    await page.locator('#approval').fill('Sentinel_ffde07affe9081919268d1a79ca36d2c');
    await page.locator('#confirm-submit').click();
    await page.waitForFunction(() => sessionStorage.getItem('vm01-pending-request') === null && document.querySelector('#power').textContent === 'running');
    assert.equal(f.arm.calls.length, 1);
  });
});

test('400 pre-dispatch error remains actionable after immediate refresh and reload', async () => {
  await withBrowser(async ({ page, f, hooks, requests }) => {
    hooks.before = input => input.method === 'POST' ? Response.json({ error: 'invalid_confirmation' }, { status: 400 }) : undefined;
    await confirmAction(page);
    await page.waitForFunction(() => document.querySelector('#action-message').textContent.includes('invalid_confirmation') && !document.querySelector('[data-action=deallocate]').disabled);
    const notice = await page.locator('#action-message').textContent();
    assert.match(notice, /one valid approval reference/); assert.equal(await pending(page), null);
    await page.locator('#refresh').click();
    assert.equal(await page.locator('#action-message').textContent(), notice);
    await page.reload(); await page.locator('#sign-in').click();
    await page.waitForFunction(() => !document.querySelector('[data-action=deallocate]').disabled);
    assert.equal(await page.locator('#action-message').textContent(), notice);
    assert.equal(f.arm.calls.length, 0); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  });
});

test('accepted deallocation shows power off separately from pending receipt; saved check and reload never POST', async () => {
  await withBrowser(async ({ page, f, requests, hooks }) => {
    hooks.after = (result, input) => { if (input.method === 'POST') f.observation.powerState = 'deallocated'; };
    await confirmAction(page);
    await page.waitForFunction(() => document.querySelector('#power').textContent === 'deallocated' && document.querySelector('#operation').textContent.includes('receipt is still pending'));
    assert.match(await page.locator('#operation').textContent(), /VM power is deallocated/);
    assert.equal(await page.locator('#retry').textContent(), 'Check saved request status');
    const saved = await pending(page); assert.ok(saved);
    await check(page); assert.equal(await pending(page), saved);
    await page.reload(); await page.locator('#sign-in').click();
    await page.waitForFunction(() => document.querySelector('#power').textContent === 'deallocated');
    await check(page); assert.equal(await pending(page), saved);
    assert.equal(await page.locator('[data-action=start]').isDisabled(), true);
    assert.equal(f.arm.calls.length, 1); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    f.advance(16000); f.arm.pollOutcome = { status: 'Succeeded', retryAfter: 15 };
    await check(page);
    await page.waitForFunction(() => sessionStorage.getItem('vm01-pending-request') === null && !document.querySelector('[data-action=start]').disabled);
    assert.equal(await page.locator('#retry').isHidden(), true); assert.equal(f.port.data.activeRequestId, null);
    assert.equal(f.arm.calls.length, 1);
  }, { operationPollingEnabled: true });
});

for (const [status, code] of [[401, 'invalid_access_token'], [403, 'browser_not_allowed'], [409, 'operation_in_progress']]) {
  test(`HTTP ${status} after dispatch and during status reads preserves pending ID across reload without replay`, async () => {
    await withBrowser(async ({ page, f, hooks, requests }) => {
      hooks.after = (result, input) => input.method === 'POST' ? Response.json({ error: code }, { status }) : undefined;
      await confirmAction(page);
      await page.waitForFunction(status => document.querySelector('#action-message').textContent.includes(`HTTP ${status}`) && !document.querySelector('#retry').hidden, status);
      const saved = await pending(page); assert.ok(saved);
      const notice = await page.locator('#action-message').textContent();
      hooks.before = input => input.method === 'GET' ? Response.json({ error: code }, { status }) : undefined;
      await check(page);
      await page.waitForFunction(status => document.querySelector('#message').textContent.includes(`HTTP ${status}`), status);
      assert.equal(await pending(page), saved); assert.equal(await page.locator('#action-message').textContent(), notice);
      await page.reload(); await page.locator('#sign-in').click();
      await page.waitForFunction(status => document.querySelector('#message').textContent.includes(`HTTP ${status}`), status);
      assert.equal(await pending(page), saved);
      hooks.before = null; await check(page);
      await page.waitForFunction(() => document.querySelector('#operation').textContent.includes('pending verification'));
      assert.equal(await pending(page), saved); assert.equal(await page.locator('[data-action=deallocate]').isDisabled(), true);
      assert.equal(f.arm.calls.length, 1); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    }, { operationPollingEnabled: true });
  });
}

test('transport timeout after acceptance preserves request and visible uncertainty across refresh/reload', async () => {
  await withBrowser(async ({ page, f, requests }) => {
    await page.route('**/api/vm01/deallocate', async route => { await route.fetch(); await route.abort('timedout'); });
    await confirmAction(page);
    await page.waitForFunction(() => document.querySelector('#action-message').textContent.includes('uncertain') && !document.querySelector('#retry').hidden);
    const saved = await pending(page); assert.ok(saved);
    await check(page); assert.equal(await pending(page), saved);
    await page.reload(); await page.locator('#sign-in').click();
    await page.waitForFunction(() => !document.querySelector('#retry').hidden);
    assert.match(await page.locator('#action-message').textContent(), /uncertain/);
    await check(page); assert.equal(await pending(page), saved);
    assert.equal(f.arm.calls.length, 1); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  }, { operationPollingEnabled: true });
});

test('missing or mismatched receipt never clears an uncertain request or offers power retry', async () => {
  await withBrowser(async ({ page, f, hooks, requests }) => {
    await confirmAction(page); await page.waitForFunction(() => !document.querySelector('#retry').hidden);
    const saved = await pending(page);
    for (const replacement of [
      Response.json({ error: 'operation_not_found' }, { status: 404 }),
      Response.json({ operation: { phase: 'completed', requestId: 'different', action: 'deallocate' }, actions: { start: true, restart: true, deallocate: true } })
    ]) {
      hooks.before = () => replacement.clone();
      await check(page);
      await page.waitForFunction(() => /No receipt|no matching receipt/.test(document.querySelector('#message').textContent));
      assert.equal(await pending(page), saved); assert.equal(await page.locator('[data-action=start]').isDisabled(), true);
    }
    assert.equal(f.arm.calls.length, 1); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  }, { operationPollingEnabled: true });
});

test('new browser context uses active ledger status without needing the lost tab or saved request', async () => {
  await withBrowser(async ({ page, f, origin, requests }) => {
    await confirmAction(page); await page.waitForFunction(() => !document.querySelector('#retry').hidden);
    const context = await page.context().browser().newContext();
    try {
      const fresh = await context.newPage();
      await fresh.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await fresh.goto(origin); await fresh.locator('#sign-in').click();
      await fresh.waitForFunction(() => document.querySelector('#operation').textContent.includes('pending verification'));
      assert.equal(await pending(fresh), null); assert.equal(await fresh.locator('[data-action=start]').isDisabled(), true);
      assert.equal(await fresh.locator('#retry').isHidden(), true);
      assert.equal(f.arm.calls.length, 1); assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    } finally { await context.close(); }
  }, { operationPollingEnabled: true });
});

test('existing 15-minute polling limit explains pause and retains the request', async () => {
  await withBrowser(async ({ page, f }) => {
    await confirmAction(page); await page.waitForFunction(() => !document.querySelector('#retry').hidden);
    const saved = await pending(page);
    await page.evaluate(() => { window.fixtureNow += 16 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('#polling-note').textContent.includes('paused'));
    assert.equal(await pending(page), saved);
    await check(page);
    await page.waitForFunction(() => document.querySelector('#polling-note').textContent === '');
    assert.equal(await pending(page), saved); assert.equal(f.arm.calls.length, 1);
  }, { operationPollingEnabled: true });
});
