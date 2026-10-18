// CI evidence reuse. Usage (inside GitHub Actions, after a checkout with history):
//   node scripts/ci/reuse-evidence.mjs --workflow ci --needed check=true,lint=true,terraform=false,e2e=true [--force]
// A stage the workflow needs still runs unless a successful check run of that stage exists on a
// nearby commit (this commit on another branch or event, a parent, an earlier head of the same
// branch) whose stage-relevant files are identical to the tree under test. Documentation-only
// follow-up pushes, "merge main into the branch" commits, pull-request merges into main and the
// same commit pushed to two branches then reuse the earlier run instead of repeating it.
// Outputs run_<stage>=true|false and evidence to $GITHUB_OUTPUT, a table to $GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MAX_CANDIDATES = 20;
const GITHUB_ACTIONS_APP_ID = 15368;

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

// stages: { name: { checks: [check-run names], include?, exclude? } }; needed: { name: boolean }.
// candidates: ordered [{ sha, changed: [files that differ from the tree under test] }].
// getChecks(sha) resolves to [{ name, conclusion, url }] for that commit. Returns
// { name: { run, reason, sha?, urls? } }; reason is 'not needed', 'reused', 'forced' or 'no evidence'.
export async function decide(stages, needed, candidates, getChecks, { force = false } = {}) {
  const result = {};
  for (const name of Object.keys(stages)) {
    if (!needed[name]) result[name] = { run: false, reason: 'not needed' };
    else if (force) result[name] = { run: true, reason: 'forced' };
  }
  const open = () => Object.keys(stages).filter((n) => !result[n]);
  for (const candidate of candidates) {
    if (!open().length) break;
    const clean = open().filter((n) => !candidate.changed.some((f) => isRelevant(stages[n], f)));
    if (!clean.length) continue;
    const checks = await getChecks(candidate.sha);
    for (const name of clean) {
      const found = stages[name].checks.map((check) => checks.find((c) => c.name === check && c.conclusion === 'success'));
      if (found.every(Boolean)) result[name] = { run: false, reason: 'reused', sha: candidate.sha, urls: found.map((c) => c.url) };
    }
  }
  for (const name of open()) result[name] = { run: true, reason: 'no evidence' };
  return result;
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// The tree under test is HEAD (for a pull_request event the synthetic merge commit). Candidates:
// HEAD itself (same commit run elsewhere), the second parent and its first-parent chain (the
// pull-request head and its earlier heads), then the first-parent chain.
export function listCandidates(cwd, max = MAX_CANDIDATES) {
  const [head, ...parents] = git(['rev-list', '--parents', '-n', '1', 'HEAD'], cwd).split(/\s+/);
  const order = [head];
  const chain = (start) => {
    try { order.push(...git(['rev-list', '--first-parent', '-n', String(max), start], cwd).split(/\s+/).filter(Boolean)); } catch { /* shallow boundary */ }
  };
  if (parents[1]) chain(parents[1]);
  if (parents[0]) chain(parents[0]);
  const candidates = [];
  for (const sha of [...new Set(order)]) {
    let changed;
    try { changed = git(['diff', '--name-only', sha, head], cwd).split('\n').filter(Boolean); } catch { continue; }
    candidates.push({ sha, changed });
  }
  return candidates;
}

export async function fetchChecks(repo, sha, token, fetchImpl = fetch) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const runs = [];
  for (let page = 1; page < 10; page++) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100&filter=latest&page=${page}`, { headers });
    if (!response.ok) throw new Error(`check-runs ${sha}: HTTP ${response.status}`);
    const body = await response.json();
    runs.push(...(body.check_runs ?? []));
    if ((body.check_runs ?? []).length < 100) break;
  }
  return runs.filter((r) => r.app?.id === GITHUB_ACTIONS_APP_ID).map((r) => ({ name: r.name, conclusion: r.conclusion, url: r.html_url }));
}

export function summarize(decisions) {
  const rows = Object.entries(decisions).map(([name, d]) => {
    const evidence = d.reason === 'reused' ? `${d.sha.slice(0, 7)} ${d.urls.map((u, i) => `[run ${i + 1}](${u})`).join(' ')}` : '';
    return `| ${name} | ${d.run ? 'run' : 'skip'} | ${d.reason} | ${evidence} |`;
  });
  return ['| Stage | Decision | Reason | Evidence |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const workflow = option('--workflow');
  if (!workflow) throw new Error('--workflow is required');
  const stages = loadStages(workflow);
  const needed = parseNeeded(option('--needed'));
  const force = args.includes('--force');
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
  const cache = new Map();
  const getChecks = (sha) => {
    if (!cache.has(sha)) cache.set(sha, fetchChecks(repo, sha, token));
    return cache.get(sha);
  };
  const decisions = await decide(stages, needed, listCandidates(process.cwd()), getChecks, { force });
  const table = summarize(decisions);
  console.log(table);
  const evidence = Object.entries(decisions).filter(([, d]) => d.reason === 'reused').map(([n, d]) => `${n}: ${d.sha.slice(0, 7)} ${d.urls.join(' ')}`).join('; ');
  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(decisions).map(([n, d]) => `run_${n}=${d.run}`);
    lines.push(`evidence=${evidence}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stage selection\n\n${table}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(`::error::${error.message}`); process.exit(1); });
}
