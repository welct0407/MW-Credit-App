// Local release-record tools. No AppSheet, database, approval or deployment access.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { renderDocumentationChecklist } from './documentation.mjs';

export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const equal = (a, b) => canonical(a) === canonical(b);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const own = (o, k) => Object.hasOwn(o, k);

// State makes absent, unset, inherited, null and empty-string values distinct.
function validateState(s, label) {
  requireThat(s && ['value', 'absent', 'unset', 'inherited'].includes(s.state), `${label}: invalid state`);
  if (s.state === 'value') requireThat(own(s, 'value'), `${label}: value required`);
  else requireThat(!own(s, 'value'), `${label}: use effective for unset/inherited; absent has no value`);
  if (['unset', 'inherited'].includes(s.state)) requireThat(own(s, 'effective'), `${label}: effective value required`);
  const allowed = s.state === 'value' ? ['state', 'value'] : s.state === 'absent' ? ['state'] : ['state', 'effective'];
  requireThat(Object.keys(s).every(k => allowed.includes(k)), `${label}: unknown state field`);
}

export function validate(d) {
  requireThat(d?.schemaVersion === 1 && /^R\d{3,}$/.test(d.release), 'schemaVersion 1 and release Rnnn required');
  requireThat(Number.isInteger(d.revision) && d.revision > 0, 'positive package revision required');
  requireThat(Array.isArray(d.items) && d.items.length > 0, 'at least one AppSheet delta item required');
  const ids = new Set(), paths = new Set();
  for (const i of d.items) {
    for (const key of ['id', 'object', 'property']) requireThat(nonempty(i[key]), `item ${key} required`);
    requireThat(['OLTP', 'OLAP'].includes(i.app), `${i.id}: app must be OLTP or OLAP`);
    requireThat(['add', 'change', 'remove', 'rename', 'reorder'].includes(i.operation), `${i.id}: invalid operation`);
    requireThat(!ids.has(i.id), `duplicate ID ${i.id}`); ids.add(i.id);
    const path = canonical([i.app, i.object, i.property]);
    requireThat(!paths.has(path), `${i.id}: duplicate app/object/property`); paths.add(path);
    validateState(i.dev, `${i.id}.dev`); validateState(i.prod, `${i.id}.prod`);
    if (i.operation === 'remove') requireThat(i.dev.state === 'absent' && i.prod.state === 'absent', `${i.id}: removal requires absence`);
    if (i.operation === 'rename') requireThat(nonempty(i.previousObject), `${i.id}: rename needs previousObject`);
    requireThat(equal(i.dev, i.prod) || nonempty(i.environmentReason), `${i.id}: different targets require environmentReason`);
    for (const env of ['dev', 'prod']) requireThat(nonempty(d.apps?.[i.app]?.[env]), `${i.id}: ${env} app ID required`);
  }
  return d;
}

export function candidateHash(d) {
  validate(d);
  // Narrative, continuation and dictionary patches do not alter deployment targets.
  return sha256(canonical({ schemaVersion: d.schemaVersion, release: d.release, revision: d.revision, apps: d.apps,
    items: d.items.map(i => Object.fromEntries(['id', 'app', 'object', 'property', 'operation', 'previousObject', 'dev', 'prod', 'environmentReason'].filter(k => own(i, k)).map(k => [k, i[k]]))).sort((a, b) => a.id.localeCompare(b.id)) }));
}

export function compare(d, observation) {
  const hash = candidateHash(d);
  requireThat(['dev', 'prod'].includes(observation.environment), 'observation environment must be dev or prod');
  requireThat(observation.release === d.release && observation.revision === d.revision && observation.candidateHash === hash, 'stale or different candidate observation');
  requireThat(Array.isArray(observation.items), 'observation items required');
  const seen = new Map();
  for (const o of observation.items) {
    requireThat(!seen.has(o.id), `duplicate observed ID ${o.id}`);
    requireThat(d.items.some(i => i.id === o.id), `unknown observed ID ${o.id}`);
    validateState(o.observed, `${o.id}.observed`);
    requireThat(nonempty(o.appId) && nonempty(o.version) && nonempty(o.evidence) && nonempty(o.observedAt) && !Number.isNaN(Date.parse(o.observedAt)), `${o.id}: saved readback appId/version/evidence/observedAt required`);
    seen.set(o.id, o);
  }
  const results = d.items.map(i => {
    const o = seen.get(i.id);
    const matches = o && o.appId === d.apps[i.app][observation.environment] && equal(i[observation.environment], o.observed);
    return { id: i.id, status: !o ? 'Pending' : matches ? 'Verified' : 'Mismatch', ...(o ? { evidence: o.evidence, version: o.version, observedAt: o.observedAt } : {}) };
  });
  return { release: d.release, revision: d.revision, candidateHash: hash, environment: observation.environment,
    complete: results.every(r => r.status === 'Verified'), results };
}

const cell = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replaceAll('\n', '<br>');
export function render(d) {
  const hash = candidateHash(d);
  const resume = d.continuation ?? {};
  return `# ${d.release} release delta — revision ${d.revision}\n\nConfiguration is generated from JSON; edit that source for target changes. Complete documentation dispositions in the appended rows or linked release log; preserve them when regenerating. This is a configuration checklist, not release approval or proof of unrecorded-change coverage.\n\nCandidate SHA-256: \`${hash}\`\n\n## Continue here\n\n${['versions', 'done', 'next', 'decisions', 'evidence'].map(k => `- ${k}: ${cell(resume[k] ?? 'Not recorded')}`).join('\n')}\n\n## Checklist\n\n| ID | App | Object / property | Operation | DEV target | PROD target |\n| --- | --- | --- | --- | --- | --- |\n${d.items.map(i => `| ${[i.id, i.app, `${i.object} / ${i.property}`, i.operation, canonical(i.dev), canonical(i.prod)].map(cell).join(' | ')} |`).join('\n')}\n\nCompare saved readbacks separately for DEV and PROD; missing observations remain Pending. Readiness also requires the workflow tests, warning gate, complete edit-record reconciliation and applicable approvals in the release log.\n`;
}

export async function fingerprint(files, context) {
  requireThat(files.length > 0 && context && Object.keys(context).length > 0, 'files and explicit test context required');
  const hashes = [];
  for (const file of [...new Set(files)].sort()) hashes.push({ file, sha256: sha256(await fs.readFile(file)) });
  return { fingerprint: sha256(canonical({ files: hashes, context })), files: hashes, context };
}

export async function readJson(file) { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
async function main() {
  const [command, file, extra, output] = process.argv.slice(2);
  if (command === 'fingerprint') {
    const input = await readJson(file);
    console.log(JSON.stringify(await fingerprint(input.files, input.context), null, 2)); return;
  }
  const d = validate(await readJson(file));
  if (command === 'validate') console.log(JSON.stringify({ release: d.release, items: d.items.length, candidateHash: candidateHash(d) }));
  else if (command === 'render') { requireThat(extra, 'output Markdown path required'); await fs.writeFile(extra, render(d) + await renderDocumentationChecklist(), { flag: 'wx' }); }
  else if (command === 'compare') {
    const result = compare(d, await readJson(extra));
    if (output) await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result, null, 2));
    if (!result.complete) process.exitCode = 1;
  } else throw new Error('Usage: delta.mjs validate DELTA | render DELTA NEW.md | compare DELTA READBACK [NEW.json] | fingerprint INPUT.json');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
