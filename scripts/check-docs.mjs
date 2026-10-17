// Documentation check (npm run check:docs). Usage: node scripts/check-docs.mjs [repo-root]
// FAIL: broken relative Markdown links/anchors; deployment pins in current documents
// outside the environment inventory; change notes from TEMPLATE_SINCE missing the template
// headings. WARN: old unlinked change notes, uncited evidence files, an oversized AGENTS.md.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Current documents that must not carry deployment pins (globs; ** spans folders).
const PIN_SCOPE = [
  'AGENTS.md', 'CLAUDE.md', 'project/README.md', 'project/Documents/**/*.md',
  'project/Documents/Data Dictionary/**/*.{yaml,yml,json}', 'database/README.md',
  'integration-agent/README.md', 'integration-agent/AGENTS.md', 'integration-agent/SERVICE_CATALOGUE.md',
  'integration-agent/service-catalogue.json', 'integration-agent/docs/*.md',
];
const PIN_INVENTORY = 'project/Documents/Environment_Inventory.md';
// Deployment pins: they belong in the inventory only. Commit SHAs (provenance) are allowed.
const PIN_PATTERNS = [
  { name: 'Cloud Run revision', re: /(?<![0-9])\d{5}-[a-z0-9]{3}(?![A-Za-z0-9])/g },
  { name: 'image digest', re: /sha256:[0-9a-f]{8,}/g },
  { name: 'Firebase Hosting version', re: /hosting.{0,40}?(?<![0-9A-Za-z])([0-9a-f]{16})(?![0-9A-Za-z])/gi, lowerHex: true },
];
const TEMPLATE_SINCE = '2026-10-18';
const TEMPLATE_HEADINGS = ['Purpose', 'Changes', 'Checks', 'Not run', 'Recovery', 'Open questions', 'Remaining work'].map((h) => `## ${h}`);
const NOTE_MAX_AGE_DAYS = 14;
const AGENTS_MAX_WORDS = 800;
const CHANGE_LOGS = ['Change Logs/', 'project/Change Logs/', 'integration-agent/Change Logs/'];
const TEMPLATE_LOGS = ['Change Logs/', 'integration-agent/Change Logs/'];
const OUTPUTS = ['project/outputs/', 'integration-agent/outputs/'];
const CODE = ['apps/', 'services/', 'scripts/', 'database/', 'tests/', 'infrastructure/', '.github/',
  'integration-agent/src/', 'integration-agent/scripts/', 'integration-agent/tests/', 'project/scripts/'];

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter((f) => f && existsSync(path.join(root, f)));
const texts = new Map();
const read = (f) => {
  if (!texts.has(f)) texts.set(f, readFileSync(path.join(root, f), 'utf8'));
  return texts.get(f);
};
const under = (f, prefixes) => prefixes.some((p) => f.startsWith(p));
const globRe = (g) => new RegExp(`^${g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, a) => `(${a.split(',').join('|')})`)
  .replace(/\*\*\//g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(.*/)?')}$`);
const failures = [];
const fail = (f, line, msg) => failures.push(`${f}:${line}: ${msg}`);

// Lines outside fenced code blocks, with inline code spans removed: [lineNumber, text].
function proseLines(text) {
  const out = [];
  let fenced = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) out.push([i + 1, line]);
  });
  return out;
}

// 1. Relative links and anchors.
const LINK = /(?<!!)\[(?:[^\][]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const IMG = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g;
const REF = /^\s*\[[^\]]+\]:\s*(\S+)/g;
const slug = (t) => t.replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replaceAll('`', '').trim().toLowerCase()
  .replace(/[^\p{L}\p{N}\p{Mn} _-]/gu, '').replaceAll(' ', '-');
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const anchorCache = new Map();
function anchors(f) {
  if (anchorCache.has(f)) return anchorCache.get(f);
  const found = new Set();
  const counts = new Map();
  for (const [, line] of proseLines(readFileSync(f, 'utf8'))) {
    for (const m of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/gi)) found.add(m[1].toLowerCase());
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const s = slug(h[2]);
    const n = counts.get(s) ?? 0;
    counts.set(s, n + 1);
    found.add(n ? `${s}-${n}` : s);
  }
  anchorCache.set(f, found);
  return found;
}
const markdown = files.filter((f) => f.endsWith('.md'));
for (const f of markdown) {
  const full = path.join(root, f);
  for (const [no, raw] of proseLines(read(f))) {
    const line = raw.replace(/`[^`]*`/g, '');
    for (const re of [LINK, IMG, REF]) {
      for (const [, target] of line.matchAll(re)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
        const hash = target.indexOf('#');
        const p = decode(hash < 0 ? target : target.slice(0, hash));
        const frag = hash < 0 ? '' : decode(target.slice(hash + 1)).toLowerCase();
        const dest = !p ? full : p.startsWith('/') ? path.join(root, p) : path.join(path.dirname(full), p);
        if (!existsSync(dest)) fail(f, no, `missing path -> ${target}`);
        else if (frag && dest.endsWith('.md') && statSync(dest).isFile() && !anchors(dest).has(frag)) fail(f, no, `missing anchor -> ${target}`);
      }
    }
  }
}

// 2. Deployment pins outside the inventory.
const scope = PIN_SCOPE.map(globRe);
for (const f of files.filter((x) => x !== PIN_INVENTORY && scope.some((re) => re.test(x)))) {
  read(f).split('\n').forEach((line, i) => {
    for (const { name, re, lowerHex } of PIN_PATTERNS) {
      for (const m of line.matchAll(re)) {
        if (lowerHex && m[1] !== m[1].toLowerCase()) continue;
        fail(f, i + 1, `${name} pin "${m[1] ?? m[0]}" belongs in ${PIN_INVENTORY}`);
      }
    }
  });
}

// 3. Change-note template for notes dated TEMPLATE_SINCE or later.
const noteDate = (f) => /^CHANGE_NOTES_.+_(\d{4}-\d{2}-\d{2})\.md$/.exec(path.basename(f))?.[1];
const notes = files.filter((f) => under(f, CHANGE_LOGS) && noteDate(f));
for (const f of notes.filter((x) => under(x, TEMPLATE_LOGS) && noteDate(x) >= TEMPLATE_SINCE)) {
  const lines = proseLines(read(f)).map(([no, l]) => [no, l.trim()]);
  let from = 0;
  for (const heading of TEMPLATE_HEADINGS) {
    const at = lines.findIndex(([, l], i) => i >= from && l === heading);
    const anywhere = lines.find(([, l]) => l === heading);
    if (at >= 0) from = at + 1;
    else fail(f, anywhere?.[0] ?? 1, `${anywhere ? 'out of order' : 'missing'} change-note heading "${heading}" (template: Development_Workflow.md)`);
  }
}

// 4. Change notes older than NOTE_MAX_AGE_DAYS that no current document links to.
const warnings = new Map();
const warn = (group, item) => warnings.set(group, [...(warnings.get(group) ?? []), item]);
const binary = /\.(png|jpe?g|gif|webp|ico|xlsx|pdf|woff2?|ttf|otf|zip|gz|tgz|br)$/i;
const current = files.filter((f) => /\.(md|ya?ml|json)$/.test(f) && !under(f, CHANGE_LOGS) && !under(f, OUTPUTS));
const currentText = current.map(read).join('\n');
const today = process.env.CHECK_DOCS_TODAY ?? new Date().toISOString().slice(0, 10);
const ageDays = (d) => (Date.parse(today) - Date.parse(d)) / 86_400_000;
const stale = new Set(notes.filter((f) => ageDays(noteDate(f)) > NOTE_MAX_AGE_DAYS && !currentText.includes(path.basename(f))));
for (const f of stale) warn('Change notes older than 14 days that no current document links to (candidate for deletion at the next release closure)', f);

// 5. Evidence files nothing current cites.
const evidence = files.filter((f) => under(f, OUTPUTS));
const citers = [...current, ...notes.filter((f) => !stale.has(f)), ...files.filter((f) => under(f, CODE) && !binary.test(f))];
const citedPaths = new Set();
const tokens = new Set();
for (const f of citers) {
  const text = read(f).replaceAll('%20', ' ');
  for (const [token] of text.matchAll(/(?:[\w.@-]+\/)*outputs\/[^\s)\]>"'`|,;<*#]*/g)) {
    const t = token.replace(/[.:]+$/, '');
    for (const base of [path.dirname(f), '']) citedPaths.add(path.posix.normalize(path.posix.join(base, t)).replace(/\/$/, ''));
  }
  for (const [word] of text.matchAll(/[\w.@-]+/g)) tokens.add(word);
}
const nameCount = new Map();
for (const f of evidence) nameCount.set(path.basename(f), (nameCount.get(path.basename(f)) ?? 0) + 1);
const outputsRoot = (f) => OUTPUTS.find((p) => f.startsWith(p));
const ancestors = (f) => {
  const out = [];
  for (let d = path.posix.dirname(f); `${d}/` !== outputsRoot(f) && d !== '.'; d = path.posix.dirname(d)) out.push(d);
  return out;
};
const cited = new Set(evidence.filter((f) => [f, ...ancestors(f)].some((p) => citedPaths.has(p))
  || (nameCount.get(path.basename(f)) === 1 && tokens.has(path.basename(f)))));
const readmes = evidence.filter((f) => path.basename(f).toLowerCase() === 'readme.md');
for (let grew = true; grew;) {
  grew = false;
  for (const r of readmes.filter((x) => cited.has(x))) {
    const dir = path.posix.dirname(r);
    const text = read(r).replaceAll('%20', ' ');
    for (const f of evidence.filter((x) => !cited.has(x) && x.startsWith(`${dir}/`))) {
      if (text.includes(path.posix.relative(dir, f)) || text.includes(path.basename(f))) {
        cited.add(f);
        grew = true;
      }
    }
  }
}
for (const f of evidence.filter((x) => !cited.has(x))) warn('Evidence files nothing current cites', f);

// 6. AGENTS.md size.
if (files.includes('AGENTS.md')) {
  const words = read('AGENTS.md').split(/\s+/).filter(Boolean).length;
  if (words > AGENTS_MAX_WORDS) warn(`AGENTS.md over ${AGENTS_MAX_WORDS} words`, `AGENTS.md has ${words} words`);
}

for (const line of failures) console.log(line);
let warningCount = 0;
for (const [group, items] of warnings) {
  warningCount += items.length;
  console.log(`warning: ${group} (${items.length}):`);
  for (const item of items.slice(0, 20)) console.log(`  ${item}`);
  if (items.length > 20) console.log(`  ... and ${items.length - 20} more`);
}
console.log(`docs check: ${failures.length} failures, ${warningCount} warnings`);
process.exit(failures.length ? 1 : 0);
