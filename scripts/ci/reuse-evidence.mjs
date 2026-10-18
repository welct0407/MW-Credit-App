// CI evidence reuse by stage hash. Each stage job (see stages.json) computes, right after checkout,
// a key over exactly the tracked files relevant to its stage and, as its last step, uploads a small
// evidence artifact named after that key. A later run whose stage-relevant tree is byte-identical
// computes the same key and skips the stage when every check of the stage has trusted evidence.
//
//   node scripts/ci/reuse-evidence.mjs --workflow ci --needed check=true,lint=true,terraform=false,e2e=true [--force]
//     Decide (in the `changes` job): outputs run_<stage>=true|false and evidence to $GITHUB_OUTPUT,
//     a table citing the runs to $GITHUB_STEP_SUMMARY.
//   node scripts/ci/reuse-evidence.mjs --hash --workflow ci --stage e2e --check 'e2e (shard 1 of 3)' --out "$RUNNER_TEMP/evidence/{name}.json"
//     Key (in a stage job): writes the evidence JSON outside the checkout ({name} becomes the evidence
//     name) and name=, hash=, path= to $GITHUB_OUTPUT for the upload step.
//
// Evidence is trusted only from an unexpired artifact of a same-repository (not fork) push,
// pull_request or workflow_dispatch run of this workflow whose job of that check name succeeded.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS = ['push', 'pull_request', 'workflow_dispatch'];

export function loadStages(workflow, file = fileURLToPath(new URL('stages.json', import.meta.url))) {
  const all = JSON.parse(readFileSync(file, 'utf8'));
  const stages = all[workflow];
  if (!stages) throw new Error(`Unknown workflow "${workflow}" in ${file}`);
  return stages;
}

// --needed check=true,lint=false → { check: true, lint: false }
export function parseNeeded(text) {
  const needed = {};
  for (const part of (text ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [name, value] = part.split('=');
    needed[name] = value === undefined || value === 'true';
  }
  return needed;
}

export function isRelevant(stage, file) {
  if (stage.include && !new RegExp(stage.include).test(file)) return false;
  if (stage.exclude && new RegExp(stage.exclude).test(file)) return false;
  return true;
}

// sha256 over "workflow\0stage\0" and every tree entry ("mode type object\tpath", raw bytes, each followed by
// NUL) whose path is relevant to the stage, from `git ls-tree -r -z --full-tree <commit>` output (a Buffer, or
// the same output as a UTF-8 string). Renames, mode changes and paths that would be quoted are covered because
// the entries themselves are hashed; the commit graph plays no part. Pure, so the promotion runner can recompute
// the key for its pinned source.
export function hashEntries(workflow, stageName, stage, lsTreeZOutput) {
  const tree = Buffer.isBuffer(lsTreeZOutput) ? lsTreeZOutput : Buffer.from(lsTreeZOutput, 'utf8');
  const hash = createHash('sha256').update(`${workflow}\0${stageName}\0`);
  for (let start = 0; start < tree.length; ) {
    let end = tree.indexOf(0, start);
    if (end < 0) end = tree.length;
    const entry = tree.subarray(start, end);
    const tab = entry.indexOf(9);
    if (tab > 0 && isRelevant(stage, entry.subarray(tab + 1).toString('utf8'))) hash.update(entry).update('\0');
    start = end + 1;
  }
  return hash.digest('hex');
}
export function stageHash(workflow, stageName, stage, cwd = process.cwd(), commit = 'HEAD') {
  return hashEntries(workflow, stageName, stage, execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', commit], { cwd, maxBuffer: 256 * 1024 * 1024 }));
}

// 'e2e (shard 1 of 3)' → '1', 'rebuild (migrations)' → 'migrations', 'check' → undefined.
export const variantOf = (check) => /\((?:shard\s+)?([A-Za-z0-9]+)/.exec(check)?.[1];
export const evidenceName = (workflow, stage, hash, variant) => `evidence-${workflow}-${stage}-${hash}${variant ? `-${variant}` : ''}`;

// Newest trusted evidence for one check, or null. fetchImpl is injectable for tests.
export async function findEvidence({ repo, token, workflow, name, check, fetchImpl = fetch, api = process.env.GITHUB_API_URL || 'https://api.github.com' }) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const get = async (url) => {
    const response = await fetchImpl(`${api}/repos/${repo}/${url}`, { headers });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  };
  const listed = (await get(`actions/artifacts?name=${encodeURIComponent(name)}&per_page=5`)).artifacts ?? [];
  const candidates = listed
    .filter((a) => a.name === name && a.expired === false && a.workflow_run?.id && a.workflow_run.head_repository_id === a.workflow_run.repository_id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const artifact of candidates) {
    const id = artifact.workflow_run.id;
    const run = await get(`actions/runs/${id}`);
    if (run.path !== `.github/workflows/${workflow}.yml` || !EVENTS.includes(run.event)) continue;
    if (run.repository?.full_name !== repo || run.head_repository?.full_name !== repo) continue;
    const jobs = ((await get(`actions/runs/${id}/jobs?per_page=100`)).jobs ?? []).filter((job) => job.name === check);
    if (jobs.length !== 1 || jobs[0].conclusion !== 'success') continue;
    return { check, variant: variantOf(check), runId: run.id, headSha: run.head_sha, url: run.html_url, artifactId: artifact.id, createdAt: artifact.created_at };
  }
  return null;
}

// stages: { name: { checks: [check names], include?, exclude? } }; needed: { name: boolean };
// getEvidence(stage, check) resolves to evidence or null. A stage is reused only when every check has
// evidence (possibly from different runs). Returns { name: { run, reason, evidence? } }; reason is
// 'not needed', 'forced', 'reused' or 'no evidence'. Not-needed and forced stages make no calls.
export async function decide(stages, needed, getEvidence, { force = false } = {}) {
  const result = {};
  for (const [name, stage] of Object.entries(stages)) {
    if (!needed[name]) { result[name] = { run: false, reason: 'not needed' }; continue; }
    if (force) { result[name] = { run: true, reason: 'forced' }; continue; }
    const evidence = [];
    for (const check of stage.checks) {
      const found = await getEvidence(name, check);
      if (!found) break;
      evidence.push(found);
    }
    result[name] = evidence.length === stage.checks.length ? { run: false, reason: 'reused', evidence } : { run: true, reason: 'no evidence' };
  }
  return result;
}

// Evidence grouped by run, in check order: [{ runId, headSha, url, variants }].
const byRun = (evidence) => {
  const runs = new Map();
  for (const e of evidence) {
    if (!runs.has(e.runId)) runs.set(e.runId, { runId: e.runId, headSha: e.headSha, url: e.url, variants: [] });
    if (e.variant) runs.get(e.runId).variants.push(e.variant);
  }
  return [...runs.values()];
};
const cite = (r, link) => `${link ? `[run ${r.runId}](${r.url})` : `run ${r.runId}`} @${String(r.headSha).slice(0, 7)}${r.variants.length ? ` (${r.variants.join(',')})` : ''}`;

// 'e2e: run 123 @abc1234 (1,2,3); check: run 120 @abc1234'
export function evidenceLine(decisions) {
  return Object.entries(decisions).filter(([, d]) => d.reason === 'reused').map(([n, d]) => `${n}: ${byRun(d.evidence).map((r) => cite(r)).join(', ')}`).join('; ');
}

export function summarize(decisions) {
  const rows = Object.entries(decisions).map(([name, d]) => {
    const evidence = d.reason === 'reused' ? byRun(d.evidence).map((r) => cite(r, true)).join(', ') : '';
    return `| ${name} | ${d.run ? 'run' : 'skip'} | ${d.reason} | ${evidence} |`;
  });
  return ['| Stage | Decision | Reason | Evidence |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

// Hash mode: the evidence record of one check, written outside the checkout.
export function writeEvidence({ workflow, stageName, check, out, stages, cwd = process.cwd(), env = process.env, now = new Date() }) {
  const stage = stages[stageName];
  if (!stage) throw new Error(`Unknown stage "${stageName}" in workflow "${workflow}"`);
  if (!stage.checks.includes(check)) throw new Error(`Check "${check}" is not a check of stage "${stageName}"`);
  if (!out) throw new Error('--out is required');
  const hash = stageHash(workflow, stageName, stage, cwd);
  const name = evidenceName(workflow, stageName, hash, variantOf(check));
  const file = path.resolve(cwd, out.replaceAll('{name}', name));
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  const inside = path.relative(path.resolve(root), file);
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) throw new Error(`--out must be outside the checkout: ${file}`);
  let pullHead;
  try { pullHead = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.head?.sha : undefined; } catch { pullHead = undefined; }
  const record = {
    schemaVersion: 1, workflow, stage: stageName, check, hash,
    runId: env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : null, runAttempt: env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : null, job: env.GITHUB_JOB ?? null,
    treeSha: env.GITHUB_SHA ?? null, headSha: pullHead || env.GITHUB_SHA || null, event: env.GITHUB_EVENT_NAME ?? null, ref: env.GITHUB_REF ?? null, createdAt: now.toISOString(),
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `name=${name}\nhash=${hash}\npath=${file}\n`);
  return { name, hash, path: file, record };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const workflow = option('--workflow');
  if (!workflow) throw new Error('--workflow is required');
  const stages = loadStages(workflow);
  if (args.includes('--hash')) {
    const { name, hash, path: file } = writeEvidence({ workflow, stageName: option('--stage'), check: option('--check'), out: option('--out'), stages });
    console.log(`${name}\n${hash}\n${file}`);
    return;
  }
  const needed = parseNeeded(option('--needed'));
  const force = args.includes('--force');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
  const hashes = new Map();
  const getEvidence = (stageName, check) => {
    if (!hashes.has(stageName)) hashes.set(stageName, stageHash(workflow, stageName, stages[stageName]));
    return findEvidence({ repo, token, workflow, name: evidenceName(workflow, stageName, hashes.get(stageName), variantOf(check)), check });
  };
  const decisions = await decide(stages, needed, getEvidence, { force });
  const table = summarize(decisions);
  console.log(table);
  const evidence = evidenceLine(decisions);
  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(decisions).map(([n, d]) => `run_${n}=${d.run}`);
    lines.push(`evidence=${evidence}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stage selection\n\n${table}\n`);
}

// Windows runners (database rebuild dispatch) may differ in drive-letter case.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(`::error::${error.message}`); process.exit(1); });
}
