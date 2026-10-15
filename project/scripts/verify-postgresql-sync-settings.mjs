import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Validate captured, redacted UI evidence; this does not change AppSheet.
const file = new URL('../outputs/postgresql-sync-settings-20260915/verification.json', import.meta.url);
const apps = JSON.parse(await fs.readFile(file, 'utf8'));
const expected = [false, false, false, true, false, true];
assert.equal(apps.length, 4);
assert.equal(new Set(apps.map(a => a.id)).size, 4);
for (const app of apps) {
  assert.match(app.beforeVersion, /^\d+\.\d+$/);
  assert.match(app.afterVersion, /^\d+\.\d+$/);
  assert.notEqual(app.beforeVersion, app.afterVersion);
  assert.equal(app.before.length, 6);
  assert.deepEqual(app.after, expected);
  assert.equal(app.saveDisabled, true);
  assert.equal(app.clientCheck?.newDesktop, true);
  assert.equal(app.clientCheck?.manualSyncCompleted, true);
  assert.equal(app.clientCheck?.alerts, 0);
}
console.log('PASS: four saved app configurations and four new-desktop manual-sync checks recorded.');
