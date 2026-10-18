import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decide, isRelevant, listCandidates, loadStages, parseNeeded, summarize } from '../../scripts/ci/reuse-evidence.mjs';

const stages = loadStages('ci');
const success = (names) => names.map((name) => ({ name, conclusion: 'success', url: `https://example.invalid/${name}` }));
const E2E = stages.e2e.checks;
const checksOf = (table) => async (sha) => table[sha] ?? [];

test('stages.json names the check runs the workflows produce and the paths that invalidate them', () => {
  assert.deepEqual(Object.keys(stages), ['check', 'lint', 'terraform', 'e2e']);
  assert.deepEqual(Object.keys(loadStages('database')), ['rebuild']);
  assert.deepEqual(Object.keys(loadStages('agent-tests')), ['test', 'lab']);
  assert.ok(isRelevant(stages.e2e, 'apps/pwa/src/App.tsx'));
  assert.ok(isRelevant(stages.e2e, '.github/workflows/ci.yml'));
  assert.ok(isRelevant(stages.e2e, 'scripts/ci/stages.json'));
  assert.ok(!isRelevant(stages.e2e, 'services/business/borrowers.mjs'));
  assert.ok(isRelevant(stages.check, 'services/business/borrowers.mjs'));
  assert.ok(!isRelevant(stages.check, 'Change Logs/CHANGE_NOTES_X_2026-10-18.md'));
  assert.ok(!isRelevant(stages.check, 'project/Documents/Release_Tracker.md'));
  assert.ok(!isRelevant(loadStages('database').rebuild, 'database/README.md'));
  assert.ok(isRelevant(loadStages('database').rebuild, 'database/migrations/V96__x.sql'));
  assert.throws(() => loadStages('nope'), /Unknown workflow/);
});

test('parseNeeded reads name=bool pairs', () => {
  assert.deepEqual(parseNeeded('check=true,lint=false, e2e=true'), { check: true, lint: false, e2e: true });
  assert.deepEqual(parseNeeded(''), {});
});

test('a stage the classification does not need never runs and never queries GitHub', async () => {
  let calls = 0;
  const result = await decide(stages, { check: false }, [{ sha: 'a', changed: [] }], async () => { calls++; return []; });
  assert.equal(result.check.reason, 'not needed');
  assert.equal(result.check.run, false);
  assert.equal(calls, 0);
});

test('a records-only follow-up push reuses the e2e shards of the earlier head', async () => {
  // Candidate order: the new head (no runs yet), then the earlier head whose shards passed.
  const candidates = [
    { sha: 'head2', changed: [] },
    { sha: 'head1', changed: ['Change Logs/CHANGE_NOTES_R072_2026-10-18.md', 'project/Documents/Development_Changes.md'] },
  ];
  const result = await decide(stages, { check: true, lint: true, e2e: true }, candidates, checksOf({ head1: success(['check', 'lint', ...E2E]) }));
  assert.equal(result.e2e.run, false);
  assert.equal(result.e2e.reason, 'reused');
  assert.equal(result.e2e.sha, 'head1');
  assert.equal(result.e2e.urls.length, 3);
  assert.equal(result.check.run, false);
  assert.equal(result.lint.run, false);
});

test('a change to a relevant file invalidates only the stages it touches', async () => {
  const candidates = [{ sha: 'head1', changed: ['services/business/borrowers.mjs'] }];
  const result = await decide(stages, { check: true, lint: true, e2e: true, terraform: false }, candidates, checksOf({ head1: success(['check', 'lint', ...E2E]) }));
  assert.equal(result.check.run, true);
  assert.equal(result.check.reason, 'no evidence');
  assert.equal(result.lint.run, true);
  assert.equal(result.e2e.run, false);
  assert.equal(result.terraform.reason, 'not needed');
});

test('a partial or failed earlier run is not evidence', async () => {
  const twoShards = success(E2E.slice(0, 2));
  const failed = [...success(['check']), { name: E2E[2], conclusion: 'failure', url: 'u' }];
  const candidates = [{ sha: 'p', changed: [] }];
  const partial = await decide(stages, { e2e: true }, candidates, checksOf({ p: twoShards }));
  assert.equal(partial.e2e.run, true);
  const failing = await decide(stages, { e2e: true }, candidates, checksOf({ p: failed }));
  assert.equal(failing.e2e.run, true);
});

test('a merge of main into the branch reuses the branch head when main brought only documents', async () => {
  // HEAD = merge commit; HEAD^2 chain (branch heads) comes before HEAD^1 (main tips).
  const candidates = [
    { sha: 'merge', changed: [] },
    { sha: 'branchHead', changed: ['project/Documents/Release_Tracker.md', 'AGENTS.md'] },
    { sha: 'mainTip', changed: ['apps/pwa/src/App.tsx'] },
  ];
  const checks = checksOf({ branchHead: success(['check', 'lint', ...E2E]), mainTip: success(['check', 'lint', ...E2E]) });
  const result = await decide(stages, { check: true, lint: true, e2e: true }, candidates, checks);
  assert.equal(result.e2e.sha, 'branchHead');
  assert.equal(result.check.sha, 'branchHead');
});

test('the same commit already tested elsewhere is reused without a diff', async () => {
  let queried = [];
  const checks = async (sha) => { queried.push(sha); return sha === 'same' ? success(['rebuild (migrations)', 'rebuild (receiving)', 'rebuild (phase5)', 'rebuild (phase8)']) : []; };
  const result = await decide(loadStages('database'), { rebuild: true }, [{ sha: 'same', changed: [] }, { sha: 'parent', changed: ['database/migrations/V96__x.sql'] }], checks);
  assert.equal(result.rebuild.reason, 'reused');
  assert.deepEqual(queried, ['same']);
  queried = [];
});

test('--force runs every needed stage and asks GitHub nothing', async () => {
  let calls = 0;
  const result = await decide(stages, { check: true, e2e: false }, [{ sha: 'a', changed: [] }], async () => { calls++; return []; }, { force: true });
  assert.equal(result.check.reason, 'forced');
  assert.equal(result.e2e.reason, 'not needed');
  assert.equal(calls, 0);
});

test('summarize renders one row per stage with the reused evidence', async () => {
  const result = await decide(stages, { check: true, e2e: true }, [{ sha: 'abcdef0123456789', changed: [] }], checksOf({ abcdef0123456789: success(['check']) }));
  const table = summarize(result);
  assert.match(table, /\| check \| skip \| reused \| abcdef0 \[run 1\]\(https:\/\/example\.invalid\/check\) \|/);
  assert.ok(table.includes('| e2e | run | no evidence |  |'));
  assert.ok(table.includes('| lint | skip | not needed |  |'));
});

// Real git in a temp repo: one base commit with a check- and e2e-relevant PWA file, then the change under test.
async function tempRepo(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'mw-ci-reuse-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = (...args) => {
    const r = spawnSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'core.quotePath=true', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const commit = (message) => { g('add', '-A'); g('commit', '-qm', message); return g('rev-parse', 'HEAD'); };
  g('init', '-q');
  await mkdir(path.join(root, 'apps/pwa/src'), { recursive: true });
  await writeFile(path.join(root, 'apps/pwa/src/a.ts'), 'export const a = 1;\n');
  const base = commit('base');
  return { root, g, commit, base, changedSince: (sha) => listCandidates(root).find((c) => c.sha === sha)?.changed };
}

test('a file moved out of a relevant path is reported at its old path, so check is not reused', async (t) => {
  const { root, g, commit, base, changedSince } = await tempRepo(t);
  await mkdir(path.join(root, 'project'));
  g('mv', 'apps/pwa/src/a.ts', 'project/a.ts');
  commit('move');
  assert.deepEqual(changedSince(base), ['apps/pwa/src/a.ts', 'project/a.ts']);
  const result = await decide(stages, { check: true }, listCandidates(root), checksOf({ [base]: success(['check']) }));
  assert.equal(result.check.reason, 'no evidence');
});

test('a non-ASCII path is reported unquoted and keeps e2e running', async (t) => {
  const { root, commit, base, changedSince } = await tempRepo(t);
  await writeFile(path.join(root, 'apps/pwa/src/café.ts'), 'export const c = 1;\n');
  commit('accented');
  assert.deepEqual(changedSince(base), ['apps/pwa/src/café.ts']);
  assert.ok(isRelevant(stages.e2e, 'apps/pwa/src/café.ts'));
  const result = await decide(stages, { e2e: true }, listCandidates(root), checksOf({ [base]: success(E2E) }));
  assert.equal(result.e2e.reason, 'no evidence');
});

test('a path that begins with a space survives untrimmed', async (t) => {
  // Trimmed, " project/x.ts" would read as excluded project/ documentation and let check be reused.
  const { root, commit, base, changedSince } = await tempRepo(t);
  await mkdir(path.join(root, ' project'));
  await writeFile(path.join(root, ' project/x.ts'), 'export const x = 1;\n');
  commit('leading space');
  assert.deepEqual(changedSince(base), [' project/x.ts']);
  const result = await decide(stages, { check: true }, listCandidates(root), checksOf({ [base]: success(['check']) }));
  assert.equal(result.check.reason, 'no evidence');
});
