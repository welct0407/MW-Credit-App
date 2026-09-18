// Enumerate documentation closure rows; generation never verifies their content.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDirectory = fileURLToPath(new URL('../../Documents/', import.meta.url));
export function parseRegister(markdown) {
  const rows = [], ids = new Set(), paths = new Set();
  for (const line of markdown.split(/\r?\n/).filter(l => /^\| DOC-/.test(l))) {
    const match = /^\| (DOC-\d{3}) \| \[[^\]]+\]\(([^)]+)\) \| (Always|Conditional|Historical) \|/.exec(line);
    if (!match) throw new Error('Malformed documentation register row');
    const [, id, file, rule] = match;
    if (path.isAbsolute(file) || file.includes('..') || file.includes('\\') || file.includes(':')) throw new Error(`Invalid Documents path: ${file}`);
    if (ids.has(id) || paths.has(file.toLowerCase())) throw new Error(`Duplicate documentation ID/path: ${id}`);
    ids.add(id); paths.add(file.toLowerCase()); rows.push({ id, file, rule });
  }
  if (!rows.length) throw new Error('No documentation register rows found');
  return rows;
}

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Review Documents link without automatic traversal: ${relative}`);
    if (entry.isDirectory()) files.push(...await inventory(path.join(directory, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files.sort();
}

export async function documentationRows(directory = defaultDirectory) {
  const rows = parseRegister(await fs.readFile(path.join(directory, 'Promotion_Documentation_Checklist.md'), 'utf8'));
  const files = await inventory(directory), actual = new Set(files);
  const known = new Set(rows.map(r => r.file));
  return [
    ...rows.map(r => ({ ...r, note: actual.has(r.file) ? '' : 'Missing registered path; resolve move/removal before closure' })),
    ...files.filter(f => !known.has(f)).map((file, index) => ({ id: `NEW-${index + 1}`, file, rule: 'Uncatalogued', note: 'Add/classify this path in the register before closure' }))
  ];
}

const escape = s => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
export async function renderDocumentationChecklist(directory = defaultDirectory) {
  const rows = await documentationRows(directory);
  return `\n## Promotion documentation closure\n\nSource: Documents/Promotion_Documentation_Checklist.md. These rows belong to the release identified in the parent checklist/log. Fill each disposition and evidence/reason; generation does not verify content. Always records cannot be Not applicable. Conditional records need a reason when not applicable; historical records stay preserved. Resolve new/missing paths and every Pending/Blocked row before Released.\n\n| ID | Documents path | Rule | Disposition | Content/evidence link or reason |\n| --- | --- | --- | --- | --- |\n${rows.map(r => `| ${[r.id, `Documents/${r.file}`, r.rule, 'Pending', r.note || 'Record at closure'].map(escape).join(' | ')} |`).join('\n')}\n\nRecheck the path inventory at closure if Documents changed after generation. Preserve later DEV differences. Reconcile the release log/delta, approval/test/recovery evidence and publication outside Documents too.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) { console.error('Usage: documentation.mjs NEW-CHECKLIST.md (under outputs/)'); process.exitCode = 1; }
  else renderDocumentationChecklist().then(body => fs.writeFile(output, body, { flag: 'wx' })).catch(e => { console.error(e.message); process.exitCode = 1; });
}
