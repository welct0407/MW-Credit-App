import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/check-docs.mjs', import.meta.url));
const template = ['Purpose', 'Changes', 'Checks', 'Not run', 'Recovery', 'Open questions', 'Remaining work'].map((h) => `## ${h}\nText.\n`).join('\n');
const base = {
  'AGENTS.md': [
    '# Agents', 'See [second](docs/a.md#second-1) and [top](#agents) and ![logo](docs/a.md).',
    'Provenance commit 1f5b3da6a513f3601f5b3da6a513f3601f5b3da6 and short 1f5b3da is allowed.',
    '```markdown', '[inside fence](missing.md) and [bad anchor](#nope)', '```', 'Inline `[span](missing.md)` is skipped.',
    '[ref]: docs/a.md', 'External [site](https://example.invalid/x) and [mail](mailto:a@example.invalid).',
  ].join('\n'),
  'docs/a.md': '# A\n\n## Second\n\n## Second\n\n<a id="custom"></a>\n',
  'docs/space name.md': '# Space\n\nBack to [custom](a.md#custom) and [self](space%20name.md).\n',
  'project/Documents/Environment_Inventory.md': '# Inventory\n\nread-00031-wkl, sha256:abcdef0123, Hosting version 45b116152dc0e997.\n',
  'Change Logs/CHANGE_NOTES_PINS_2026-10-17.md': '# Old style\n\nDeployed command-00038-m6m.\n',
  'Change Logs/CHANGE_NOTES_GOOD_2026-10-20.md': `# Change notes — good, 2026-10-20\n\n${template}`,
  'project/outputs/r1/README.md': '# Evidence\n\n- `result.json`\n',
  'project/outputs/r1/result.json': '{}\n',
  'project/README.md': '# Project\n\nEvidence: [r1](outputs/r1/README.md).\n',
};

async function check(t, extra = {}, env = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'mw-check-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries({ ...base, ...extra })) {
    if (content === null) continue;
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  const git = (...args) => assert.equal(spawnSync('git', ['-C', root, ...args]).status, 0);
  git('init', '-q');
  git('add', '-A');
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8', env: { ...process.env, CHECK_DOCS_TODAY: '2026-10-20', ...env } });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('valid links, fenced and inline code, duplicate-heading anchors, inventory pins and commit SHAs pass', async (t) => {
  const r = await check(t);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /docs check: 0 failures, 0 warnings/);
});

test('broken path and broken anchor fail with file:line', async (t) => {
  const r = await check(t, { 'docs/b.md': '# B\n\n[gone](missing.md)\n[bad](a.md#second-2)\n' });
  assert.equal(r.status, 1);
  assert.match(r.out, /^docs\/b\.md:3: missing path -> missing\.md$/m);
  assert.match(r.out, /^docs\/b\.md:4: missing anchor -> a\.md#second-2$/m);
});

test('deployment pins fail in scoped documents only', async (t) => {
  const r = await check(t, {
    'project/Documents/Guide.md': '# Guide\n\nServing read-00031-wkl.\nPrior command00027-8sb.\nImage sha256:1fb9d763aa.\nFirebase Hosting release version 45b116152dc0e997.\n',
    'project/Documents/Data Dictionary/x.yaml': 'revision: jobs-00011-7t7\n',
    'docs/unscoped.md': '# Unscoped\n\nread-00031-wkl\n',
  });
  assert.equal(r.status, 1);
  for (const line of [3, 4, 5, 6]) assert.match(r.out, new RegExp(`^project/Documents/Guide\\.md:${line}: `, 'm'));
  assert.match(r.out, /^project\/Documents\/Data Dictionary\/x\.yaml:1: Cloud Run revision pin "00011-7t7"/m);
  assert.doesNotMatch(r.out, /Environment_Inventory\.md:\d|CHANGE_NOTES_PINS|unscoped\.md|AGENTS\.md:\d/);
  assert.match(r.out, /docs check: 5 failures/);
});

test('new-dated change note missing or misordering a heading fails; old-style note before the cut-off passes', async (t) => {
  const r = await check(t, {
    'Change Logs/CHANGE_NOTES_BAD_2026-10-18.md': `# Bad\n\n${template.replace('## Recovery\n', '')}`,
    'integration-agent/Change Logs/CHANGE_NOTES_ORDER_2026-10-19.md': `# Order\n\n## Changes\n\n${template.replace('## Changes\n', '')}`,
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /^Change Logs\/CHANGE_NOTES_BAD_2026-10-18\.md:1: missing change-note heading "## Recovery"/m);
  assert.match(r.out, /^integration-agent\/Change Logs\/CHANGE_NOTES_ORDER_2026-10-19\.md:3: out of order change-note heading "## Changes"/m);
  assert.match(r.out, /docs check: 2 failures/);
});

test('old unlinked change note and uncited evidence only warn', async (t) => {
  const r = await check(t, {
    'Change Logs/CHANGE_NOTES_OLD_2026-09-01.md': '# Old\n',
    'Change Logs/CHANGE_NOTES_LINKED_2026-09-01.md': '# Linked\n',
    'docs/c.md': '# C\n\n[note](../Change%20Logs/CHANGE_NOTES_LINKED_2026-09-01.md)\n',
    'project/outputs/r2/orphan.json': '{}\n',
    'AGENTS.md': `${base['AGENTS.md']}\n${'word '.repeat(801)}`,
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /candidate for deletion at the next release closure\) \(1\):\n {2}Change Logs\/CHANGE_NOTES_OLD_2026-09-01\.md\n/);
  assert.match(r.out, /Evidence files nothing current cites \(1\):\n {2}project\/outputs\/r2\/orphan\.json\n/);
  assert.match(r.out, /AGENTS\.md has \d+ words/);
  assert.match(r.out, /docs check: 0 failures, 3 warnings/);
});
