import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate, candidateHash, compare, render, fingerprint, readJson } from './delta.mjs';

const example = await readJson(new URL('./example-delta.json', import.meta.url));
const fresh = () => structuredClone(example);
function readback(d, environment = 'prod') {
  return { release: d.release, revision: d.revision, candidateHash: candidateHash(d), environment,
    items: d.items.map(i => ({ id: i.id, appId: d.apps[i.app][environment], version: 'synthetic-v1', observedAt: '2026-09-17T09:00:00Z', evidence: 'synthetic-test-only', observed: structuredClone(i[environment]) })) };
}

test('both environment comparisons require complete exact observations', () => {
  const d = fresh();
  for (const env of ['dev', 'prod']) assert.equal(compare(d, readback(d, env)).complete, true);
  const r = readback(d); r.items = [];
  assert.equal(compare(d, r).results[0].status, 'Pending');
});
test('order, type, whitespace, null and absence are distinct', () => {
  for (const [expected, observed] of [[['a', 'b'], ['b', 'a']], [false, 'false'], [' x ', 'x'], [null, '']]) {
    const d = fresh(); d.items[0].dev.value = expected; d.items[0].prod.value = expected;
    const r = readback(d); r.items[0].observed.value = observed;
    assert.equal(compare(d, r).complete, false);
  }
  const d = fresh(), r = readback(d); r.items[0].observed = { state: 'absent' };
  assert.equal(compare(d, r).complete, false);
});
test('legitimate environment substitutions and absence compare explicitly', () => {
  const d = fresh(); d.items[0].prod.value = 'prod-ID';
  assert.throws(() => validate(d), /environmentReason/);
  d.items[0].environmentReason = 'companion app ID'; assert.equal(compare(d, readback(d)).complete, true);
  d.items[0].operation = 'remove'; d.items[0].dev = d.items[0].prod = { state: 'absent' };
  assert.equal(compare(d, readback(d)).complete, true);
});
test('stale candidate/revision, wrong app and incomplete metadata cannot verify', () => {
  const d = fresh(), r = readback(d); d.items[0].prod.value = d.items[0].dev.value = 'changed';
  assert.throws(() => compare(d, r), /stale/);
  const current = readback(d); current.items[0].appId = 'another-app'; assert.equal(compare(d, current).complete, false);
  delete current.items[0].evidence; assert.throws(() => compare(d, current), /readback/);
  const revision = readback(d); revision.revision++; assert.throws(() => compare(d, revision), /stale/);
});
test('duplicate paths, IDs, unknown observed IDs and incomplete target states fail', () => {
  let d = fresh(); d.items.push(structuredClone(d.items[0])); assert.throws(() => validate(d), /duplicate ID/);
  d.items[1].id = 'APP-002'; assert.throws(() => validate(d), /duplicate app/);
  d = fresh(); const r = readback(d); r.items.push(structuredClone(r.items[0])); assert.throws(() => compare(d, r), /duplicate observed/);
  r.items.pop(); r.items[0].id = 'unknown'; assert.throws(() => compare(d, r), /unknown observed/);
  delete d.items[0].dev.value; assert.throws(() => validate(d), /value required/);
  d.items[0].dev = { state: 'unset' }; assert.throws(() => validate(d), /effective value/);
});
test('canonical object keys and narrative edits keep hash; ordered values and identity do not', () => {
  const d = fresh(), before = candidateHash(d);
  d.continuation.next = 'next task'; assert.equal(candidateHash(d), before);
  d.apps.OLTP = { prod: d.apps.OLTP.prod, dev: d.apps.OLTP.dev }; assert.equal(candidateHash(d), before);
  d.items[0].property = 'Editable_If'; assert.notEqual(candidateHash(d), before);
  assert.match(render(d), /Continue here/); assert.match(render(d), /APP-001/);
});
test('fingerprints change with implementation, test context and dependencies', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-delta-test-'));
  try {
    const file = path.join(dir, 'fixture.txt'); await fs.writeFile(file, 'v1');
    const context = { environment: 'synthetic', test: 'normal path', fixture: 'seed-v1' };
    const first = await fingerprint([file], context);
    assert.equal((await fingerprint([file], context)).fingerprint, first.fingerprint);
    assert.notEqual((await fingerprint([file], { ...context, fixture: 'seed-v2' })).fingerprint, first.fingerprint);
    await fs.writeFile(file, 'v2'); assert.notEqual((await fingerprint([file], context)).fingerprint, first.fingerprint);
  } finally {
    // Remove only the explicit test file and then its empty, uniquely created directory.
    await fs.unlink(path.join(dir, 'fixture.txt')); await fs.rmdir(dir);
  }
});
test('CLI writes new reports, refuses evidence overwrite and returns failure for missing observations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-cli-test-'));
  const files = ['delta.json', 'readback.json', 'checklist.md', 'comparison.json'].map(n => path.join(dir, n));
  const cli = fileURLToPath(new URL('./delta.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  try {
    const d = fresh(); await fs.writeFile(files[0], JSON.stringify(d));
    assert.equal(run('validate', files[0]).status, 0);
    assert.equal(run('render', files[0], files[2]).status, 0);
    const checklist = await fs.readFile(files[2], 'utf8');
    assert.doesNotMatch(checklist, /Promotion documentation closure/);
    assert.match(checklist, /single release promotion checklist/);
    assert.equal(run('render', files[0], files[2]).status, 1);
    const r = readback(d); await fs.writeFile(files[1], JSON.stringify(r));
    assert.equal(run('compare', files[0], files[1], files[3]).status, 0);
    assert.equal((await readJson(files[3])).complete, true);
    r.items = []; await fs.writeFile(files[1], JSON.stringify(r));
    const missing = run('compare', files[0], files[1]);
    assert.equal(missing.status, 1); assert.equal(JSON.parse(missing.stdout).results[0].status, 'Pending');
  } finally {
    for (const file of files) await fs.unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await fs.rmdir(dir);
  }
});
