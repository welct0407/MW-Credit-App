import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, evidenceLine, evidenceName, findEvidence, hashEntries, isRelevant, loadStages, parseNeeded, stageHash, summarize, variantOf } from '../../scripts/ci/reuse-evidence.mjs';

const stages = loadStages('ci');
const E2E = stages.e2e.checks;
const REPO = 'welct0407/MW-Credit-App';
const script = fileURLToPath(new URL('../../scripts/ci/reuse-evidence.mjs', import.meta.url));
// Synthetic evidence as findEvidence returns it.
const ev = (check, runId = 7, headSha = 'abcdef0123456789abcdef0123456789abcdef01') => ({ check, variant: variantOf(check), runId, headSha, url: `https://example.invalid/runs/${runId}`, artifactId: runId * 10, createdAt: '2026-10-18T00:00:00Z' });
const table = (rows) => { const calls = []; return { calls, getEvidence: async (stage, check) => { calls.push(`${stage}/${check}`); return rows[check] ?? null; } }; };

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

// Real git in a temp repo.
async function tempRepo(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'mw-ci-hash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = (...args) => {
    const r = spawnSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const put = async (file, text) => { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); };
  const commit = (message) => { g('add', '-A'); g('commit', '-qm', message, '--allow-empty'); return g('rev-parse', 'HEAD'); };
  g('init', '-q');
  await put('apps/pwa/src/a.ts', 'export const a = 1;\n');
  await put('project/notes.md', 'notes\n');
  await put('scripts/ci/stages.json', '{}\n');
  commit('base');
  return { root, g, put, commit, hash: (stage) => stageHash('ci', stage, stages[stage], root) };
}

test('stageHash covers exactly the stage-relevant tree entries', async (t) => {
  const { g, put, commit, hash } = await tempRepo(t);
  const base = hash('check');
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(hash('check'), base);
  // Another commit with an identical tree has the same key: the commit graph plays no part.
  commit('empty');
  assert.equal(hash('check'), base);
  // check and lint share include/exclude but are distinct keys; e2e differs too.
  assert.notEqual(hash('lint'), base);
  assert.notEqual(hash('e2e'), base);
  assert.notEqual(stageHash('database', 'check', stages.check, g('rev-parse', '--show-toplevel')), base);
  // An irrelevant edit leaves the key unchanged.
  await put('project/notes.md', 'more notes\n');
  commit('records');
  assert.equal(hash('check'), base);
  const e2e = hash('e2e');
  // A relevant edit changes it.
  await put('apps/pwa/src/a.ts', 'export const a = 2;\n');
  commit('edit');
  const edited = hash('check');
  assert.notEqual(edited, base);
  assert.notEqual(hash('e2e'), e2e);
  // A mode change changes it.
  g('update-index', '--chmod=+x', 'apps/pwa/src/a.ts');
  g('commit', '-qm', 'mode');
  const executable = hash('check');
  assert.notEqual(executable, edited);
  // A stages.json edit changes every stage that includes scripts/ci/.
  const terraform = hash('terraform');
  await put('scripts/ci/stages.json', '{"ci":{}}\n');
  commit('stages');
  assert.notEqual(hash('check'), executable);
  assert.notEqual(hash('terraform'), terraform);
  // A move out of the relevant path changes it (the old entry is gone from the tree).
  const beforeMove = hash('e2e');
  g('mv', 'apps/pwa/src/a.ts', 'project/a.ts');
  commit('move');
  assert.notEqual(hash('e2e'), beforeMove);
});

test('hashEntries over the promotion runner\'s string ls-tree output equals the stage job\'s stageHash, at any commit', async (t) => {
  const { g, put, commit, hash, root } = await tempRepo(t);
  await put('apps/pwa/src/café.ts', 'export const c = 1;\n');
  const first = commit('accented');
  const listing = (sha) => spawnSync('git', ['-C', root, 'ls-tree', '-r', '-z', '--full-tree', sha], { encoding: 'utf8' }).stdout;
  for (const stage of ['check', 'e2e', 'terraform']) assert.equal(hashEntries('ci', stage, stages[stage], listing(first)), hash(stage));
  assert.equal(hashEntries('ci', 'e2e', stages.e2e, Buffer.from(listing(first))), hash('e2e'));
  await put('apps/pwa/src/a.ts', 'export const a = 3;\n');
  commit('later');
  assert.notEqual(hash('e2e'), stageHash('ci', 'e2e', stages.e2e, root, first));
  assert.equal(stageHash('ci', 'e2e', stages.e2e, root, first), hashEntries('ci', 'e2e', stages.e2e, listing(first)));
  assert.equal(g('rev-parse', 'HEAD').length, 40);
});

test('variantOf and evidenceName for every check named in stages.json', () => {
  const all = JSON.parse(readFileSync(path.join(path.dirname(script), 'stages.json'), 'utf8'));
  const h = 'f'.repeat(64);
  const names = Object.entries(all).flatMap(([workflow, ws]) => Object.entries(ws).flatMap(([stage, s]) => s.checks.map((check) => [workflow, stage, check, variantOf(check), evidenceName(workflow, stage, h, variantOf(check))])));
  assert.deepEqual(names, [
    ['ci', 'check', 'check', undefined, `evidence-ci-check-${h}`],
    ['ci', 'lint', 'lint', undefined, `evidence-ci-lint-${h}`],
    ['ci', 'terraform', 'terraform', undefined, `evidence-ci-terraform-${h}`],
    ['ci', 'e2e', 'e2e (shard 1 of 3)', '1', `evidence-ci-e2e-${h}-1`],
    ['ci', 'e2e', 'e2e (shard 2 of 3)', '2', `evidence-ci-e2e-${h}-2`],
    ['ci', 'e2e', 'e2e (shard 3 of 3)', '3', `evidence-ci-e2e-${h}-3`],
    ['database', 'rebuild', 'rebuild (migrations)', 'migrations', `evidence-database-rebuild-${h}-migrations`],
    ['database', 'rebuild', 'rebuild (receiving)', 'receiving', `evidence-database-rebuild-${h}-receiving`],
    ['database', 'rebuild', 'rebuild (phase5)', 'phase5', `evidence-database-rebuild-${h}-phase5`],
    ['database', 'rebuild', 'rebuild (phase8)', 'phase8', `evidence-database-rebuild-${h}-phase8`],
    ['agent-tests', 'test', 'test', undefined, `evidence-agent-tests-test-${h}`],
    ['agent-tests', 'lab', 'lab', undefined, `evidence-agent-tests-lab-${h}`],
  ]);
  // Artifact names may not contain these characters.
  for (const [, , , , name] of names) assert.doesNotMatch(name, /["':<>|*?\\/\r\n ]/);
});

test('e2e is reused only with evidence for all three shards, which may come from different runs', async () => {
  const partial = table({ [E2E[0]]: ev(E2E[0]), [E2E[1]]: ev(E2E[1]) });
  const missing = await decide(stages, { e2e: true }, partial.getEvidence);
  assert.equal(missing.e2e.run, true);
  assert.equal(missing.e2e.reason, 'no evidence');
  const all = table({ [E2E[0]]: ev(E2E[0], 7), [E2E[1]]: ev(E2E[1], 7), [E2E[2]]: ev(E2E[2], 9, '1234567890'.repeat(4)) });
  const covered = await decide(stages, { e2e: true }, all.getEvidence);
  assert.equal(covered.e2e.run, false);
  assert.equal(covered.e2e.reason, 'reused');
  assert.deepEqual(covered.e2e.evidence.map((e) => e.runId), [7, 7, 9]);
  assert.equal(evidenceLine(covered), 'e2e: run 7 @abcdef0 (1,2), run 9 @1234567 (3)');
  // A missing first shard stops the stage without asking for the others.
  const first = table({ [E2E[1]]: ev(E2E[1]), [E2E[2]]: ev(E2E[2]) });
  await decide(stages, { e2e: true }, first.getEvidence);
  assert.deepEqual(first.calls, ['e2e/e2e (shard 1 of 3)']);
});

test('a stage the classification does not need and every forced stage make no calls', async () => {
  const none = table({ check: ev('check') });
  const result = await decide(stages, { check: false }, none.getEvidence);
  assert.equal(result.check.reason, 'not needed');
  assert.equal(result.check.run, false);
  assert.equal(result.e2e.reason, 'not needed');
  const forced = await decide(stages, { check: true, e2e: false }, none.getEvidence, { force: true });
  assert.equal(forced.check.reason, 'forced');
  assert.equal(forced.check.run, true);
  assert.equal(forced.e2e.reason, 'not needed');
  assert.equal(none.calls.length, 0);
});

test('summarize renders one row per stage and cites the runs; the evidence output names run, head and variants', async () => {
  const rows = table({ check: ev('check', 120, 'abcdef0123'.repeat(4)), ...Object.fromEntries(E2E.map((c) => [c, ev(c, 123)])) });
  const result = await decide(stages, { check: true, e2e: true, terraform: true }, rows.getEvidence);
  const text = summarize(result);
  assert.ok(text.includes('| check | skip | reused | [run 120](https://example.invalid/runs/120) @abcdef0 |'));
  assert.ok(text.includes('| e2e | skip | reused | [run 123](https://example.invalid/runs/123) @abcdef0 (1,2,3) |'));
  assert.ok(text.includes('| terraform | run | no evidence |  |'));
  assert.ok(text.includes('| lint | skip | not needed |  |'));
  assert.equal(evidenceLine(result), 'check: run 120 @abcdef0; e2e: run 123 @abcdef0 (1,2,3)');
  const database = await decide(loadStages('database'), { rebuild: true }, async (_s, check) => ev(check, 5));
  assert.equal(evidenceLine(database), 'rebuild: run 5 @abcdef0 (migrations,receiving,phase5,phase8)');
});

// GitHub API fake for findEvidence: artifacts by name, runs and jobs by run id.
function github({ artifacts, runs, jobs }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer t');
    const u = new URL(url);
    const route = u.pathname.replace(`/repos/${REPO}/`, '');
    let body;
    if (route === 'actions/artifacts') body = { artifacts: artifacts.filter((a) => a.name === u.searchParams.get('name')) };
    else if (/^actions\/runs\/\d+$/.test(route)) body = runs[route.split('/')[2]];
    else if (/^actions\/runs\/\d+\/jobs$/.test(route)) body = { jobs: jobs[route.split('/')[2]] ?? [] };
    if (!body) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  return { calls, fetchImpl };
}
const NAME = `evidence-ci-e2e-${'a'.repeat(64)}-2`, CHECK = 'e2e (shard 2 of 3)';
const artifact = (id, runId, created, extra = {}) => ({ id, name: NAME, expired: false, created_at: created, workflow_run: { id: runId, repository_id: 1, head_repository_id: 1 }, ...extra });
const run = (id, extra = {}) => ({ id, path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: String(id).repeat(40).slice(0, 40), html_url: `https://github.com/${REPO}/actions/runs/${id}`, repository: { full_name: REPO }, head_repository: { full_name: REPO }, ...extra });
const okJobs = [{ name: 'changes', conclusion: 'success' }, { name: CHECK, conclusion: 'success' }];
const find = (fake) => findEvidence({ repo: REPO, token: 't', workflow: 'ci', name: NAME, check: CHECK, fetchImpl: fake.fetchImpl, api: 'https://api.example.invalid' });

test('findEvidence trusts only an unexpired same-repository artifact of a successful job of this workflow; the newest valid wins', async () => {
  const valid = github({ artifacts: [artifact(1, 11, '2026-10-17T00:00:00Z')], runs: { 11: run(11) }, jobs: { 11: okJobs } });
  const found = await find(valid);
  assert.deepEqual(found, { check: CHECK, variant: '2', runId: 11, headSha: run(11).head_sha, url: run(11).html_url, artifactId: 1, createdAt: '2026-10-17T00:00:00Z' });
  assert.ok(valid.calls[0].endsWith(`/repos/${REPO}/actions/artifacts?name=${NAME}&per_page=5`));
  assert.deepEqual(valid.calls.slice(1).map((u) => u.replace(`https://api.example.invalid/repos/${REPO}/`, '')), ['actions/runs/11', 'actions/runs/11/jobs?per_page=100']);
  for (const [label, setup] of [
    ['expired', { artifacts: [artifact(1, 11, '2026-10-17T00:00:00Z', { expired: true })] }],
    ['fork', { artifacts: [artifact(1, 11, '2026-10-17T00:00:00Z', { workflow_run: { id: 11, repository_id: 1, head_repository_id: 2 } })] }],
    ['wrong path', { runs: { 11: run(11, { path: '.github/workflows/database.yml' }) } }],
    ['wrong event', { runs: { 11: run(11, { event: 'schedule' }) } }],
    ['fork head repository', { runs: { 11: run(11, { head_repository: { full_name: 'someone/MW-Credit-App' } }) } }],
    ['other repository', { runs: { 11: run(11, { repository: { full_name: 'someone/MW-Credit-App' } }) } }],
    ['job skipped', { jobs: { 11: [{ name: CHECK, conclusion: 'skipped' }] } }],
    ['job failed', { jobs: { 11: [{ name: CHECK, conclusion: 'failure' }] } }],
    ['job absent', { jobs: { 11: [{ name: 'e2e (shard $' + '{{ matrix.shard }} of 3)', conclusion: 'skipped' }, { name: 'check', conclusion: 'success' }] } }],
    ['job duplicated', { jobs: { 11: [...okJobs, { name: CHECK, conclusion: 'success' }] } }],
    ['other name', { artifacts: [{ ...artifact(1, 11, '2026-10-17T00:00:00Z'), name: `${NAME}x` }] }],
  ]) {
    const fake = github({ artifacts: [artifact(1, 11, '2026-10-17T00:00:00Z')], runs: { 11: run(11) }, jobs: { 11: okJobs }, ...setup });
    assert.equal(await find(fake), null, label);
  }
  // Expired and fork artifacts are dropped before any run is read.
  const expired = github({ artifacts: [artifact(1, 11, '2026-10-17T00:00:00Z', { expired: true })], runs: { 11: run(11) }, jobs: { 11: okJobs } });
  await find(expired);
  assert.equal(expired.calls.length, 1);
  // Newest first: of two valid artifacts the newer is used and the older is never read.
  const two = github({ artifacts: [artifact(1, 11, '2026-10-16T00:00:00Z'), artifact(2, 12, '2026-10-18T00:00:00Z')], runs: { 11: run(11), 12: run(12) }, jobs: { 11: okJobs, 12: okJobs } });
  assert.equal((await find(two)).runId, 12);
  assert.ok(!two.calls.some((u) => u.includes('/runs/11')));
  // A newer invalid one (job failed) falls through to the older valid one.
  const fallback = github({ artifacts: [artifact(1, 11, '2026-10-16T00:00:00Z'), artifact(2, 12, '2026-10-18T00:00:00Z')], runs: { 11: run(11), 12: run(12) }, jobs: { 11: okJobs, 12: [{ name: CHECK, conclusion: 'failure' }] } });
  assert.equal((await find(fallback)).runId, 11);
  // An API failure is not silently treated as evidence.
  await assert.rejects(find(github({ artifacts: [artifact(1, 99, '2026-10-17T00:00:00Z')], runs: {}, jobs: {} })), /actions\/runs\/99: HTTP 404/);
});

test('hash mode writes the evidence record outside the checkout and the upload name to GITHUB_OUTPUT', async (t) => {
  const { root } = await tempRepo(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'mw-ci-evidence-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const event = path.join(outside, 'event.json'), output = path.join(outside, 'output.txt');
  await writeFile(event, JSON.stringify({ pull_request: { head: { sha: 'b'.repeat(40) } } }));
  const env = { ...process.env, GITHUB_RUN_ID: '4242', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'e2e', GITHUB_SHA: 'c'.repeat(40), GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/64/merge', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output };
  const cli = (...args) => spawnSync(process.execPath, [script, '--hash', '--workflow', 'ci', ...args], { cwd: root, env, encoding: 'utf8' });
  const r = cli('--stage', 'e2e', '--check', 'e2e (shard 3 of 3)', '--out', path.join(outside, 'evidence', '{name}.json'));
  assert.equal(r.status, 0, r.stderr);
  const hash = stageHash('ci', 'e2e', stages.e2e, root), name = `evidence-ci-e2e-${hash}-3`;
  const file = path.join(outside, 'evidence', `${name}.json`);
  const record = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(Date.parse(record.createdAt) > 0);
  assert.deepEqual({ ...record, createdAt: undefined }, { schemaVersion: 1, workflow: 'ci', stage: 'e2e', check: 'e2e (shard 3 of 3)', hash, runId: 4242, runAttempt: 2, job: 'e2e', treeSha: 'c'.repeat(40), headSha: 'b'.repeat(40), event: 'pull_request', ref: 'refs/pull/64/merge', createdAt: undefined });
  assert.equal(await readFile(output, 'utf8'), `name=${name}\nhash=${hash}\npath=${file}\n`);
  assert.equal(spawnSync('git', ['-C', root, 'status', '--porcelain', '--ignored'], { encoding: 'utf8' }).stdout, '');
  // A push records GITHUB_SHA as the head; an out path inside the checkout, an unknown check and a check of another stage refuse.
  const push = spawnSync(process.execPath, [script, '--hash', '--workflow', 'ci', '--stage', 'check', '--check', 'check', '--out', path.join(outside, 'push.json')], { cwd: root, env: { ...env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: path.join(outside, 'missing.json'), GITHUB_OUTPUT: '' }, encoding: 'utf8' });
  assert.equal(push.status, 0, push.stderr);
  assert.equal(JSON.parse(await readFile(path.join(outside, 'push.json'), 'utf8')).headSha, 'c'.repeat(40));
  for (const [args, message] of [[['--stage', 'check', '--check', 'check', '--out', path.join(root, 'evidence.json')], /outside the checkout/], [['--stage', 'check', '--check', 'check', '--out', 'relative.json'], /outside the checkout/], [['--stage', 'e2e', '--check', 'check', '--out', path.join(outside, 'x.json')], /not a check of stage/], [['--stage', 'nope', '--check', 'check', '--out', path.join(outside, 'x.json')], /Unknown stage/]]) {
    const bad = cli(...args);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, message);
  }
  assert.deepEqual((await readdir(root)).sort(), ['.git', 'apps', 'project', 'scripts']);
  assert.equal(spawnSync('git', ['-C', root, 'status', '--porcelain', '--ignored'], { encoding: 'utf8' }).stdout, '');
});
