// Narrow, guarded updates to existing dictionary rows. Never overwrites the input.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import { validate, readJson, equal, sha256, candidateHash } from './delta.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const scalar = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const normalize = rows => {
  const result = rows.map(row => { const r = row.map(v => v ?? ''); while (r.length && r.at(-1) === '') r.pop(); return r; });
  while (result.length && result.at(-1).length === 0) result.pop();
  return result;
};
const snapshot = wb => wb.worksheets.items.map(s => ({ name: s.name, values: normalize(s.getUsedRange().values), formulas: normalize(s.getUsedRange().formulas) }));

export function planUpdates(wb, delta) {
  validate(delta);
  assert(Array.isArray(delta.dictionaryUpdates) && delta.dictionaryUpdates.length, 'dictionaryUpdates required');
  const targets = new Set();
  return delta.dictionaryUpdates.map((p, index) => {
    const bounds = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/.exec(p.range ?? '');
    assert(bounds && p.sheet && p.previewRange, `patch ${index}: sheet, bounded A1 range and previewRange required`);
    const sheet = wb.worksheets.getItem(p.sheet), range = sheet.getRange(p.range), rows = range.values;
    const headers = rows[0];
    const column = name => { const matches = headers.map((h, i) => h === name ? i : -1).filter(i => i >= 0); assert(matches.length === 1, `patch ${index}: missing/duplicate header ${name}`); return matches[0]; };
    assert(p.key && Object.keys(p.key).length, `patch ${index}: unique row key required`);
    const keys = Object.entries(p.key).map(([k, v]) => [column(k), v]);
    const matches = rows.map((row, r) => r > 0 && keys.every(([c, v]) => equal(row[c] ?? null, v)) ? r : -1).filter(r => r >= 0);
    assert(matches.length === 1, `patch ${index}: row key matched ${matches.length} rows`);
    const r = matches[0], c = column(p.column), cell = range.getCell(r, c);
    const baseCol = [...bounds[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const identity = JSON.stringify([p.sheet, Number(bounds[2]) - 1 + r, baseCol + c]);
    assert(!targets.has(identity), `patch ${index}: duplicate target cell`); targets.add(identity);
    assert(!cell.formulas?.[0]?.[0], `patch ${index}: cannot overwrite an Excel formula`);
    assert(Object.hasOwn(p, 'expected') && equal(cell.values[0][0] ?? null, p.expected), `patch ${index}: old-value guard failed`);
    assert(Object.hasOwn(p, 'value') !== Object.hasOwn(p, 'fromItem'), `patch ${index}: specify value OR fromItem`);
    let value = p.value;
    if (Object.hasOwn(p, 'fromItem')) {
      assert(['dev', 'prod'].includes(p.environment), `patch ${index}: dev/prod environment required`);
      const target = delta.items.find(i => i.id === p.fromItem)?.[p.environment];
      assert(target?.state === 'value', `patch ${index}: scalar value target required`); value = target.value;
    }
    assert(scalar(value), `patch ${index}: only literal scalar values supported`);
    return { sheet, cell, value, index, previewRange: p.previewRange, identity };
  });
}

export async function updateDictionary(deltaPath, inputPath, outputDir, mode = 'plan') {
  assert(['plan', 'apply'].includes(mode), 'mode must be plan or apply');
  const delta = await readJson(deltaPath);
  const originalHash = sha256(await fs.readFile(inputPath));
  const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const patches = planUpdates(wb, delta);
  // New output directory prevents overwriting prior evidence or the source workbook.
  await fs.mkdir(outputDir);
  const previews = [...new Map(patches.map(p => [JSON.stringify([p.sheet.name, p.previewRange]), p])).values()];
  async function render(stage) {
    for (let i = 0; i < previews.length; i++) {
      const p = previews[i];
      const png = await wb.render({ sheetName: p.sheet.name, range: p.previewRange, scale: 1, format: 'png' });
      await fs.writeFile(path.join(outputDir, `${stage}-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
    }
  }
  await render('before');
  const report = { mode, release: delta.release, candidateHash: candidateHash(delta), inputSha256: originalHash,
    cells: patches.map(p => ({ identity: p.identity, sourceItem: delta.dictionaryUpdates[p.index].fromItem ?? null })), allSheetsValuesFormulasRoundtrip: false };
  if (mode === 'apply') {
    for (const p of patches) p.cell.values = [[typeof p.value === 'string' && p.value.startsWith('=') ? `'${p.value}` : p.value]];
    wb.recalculate();
    const expected = snapshot(wb);
    await render('after');
    const scan = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 30 } });
    await fs.writeFile(path.join(outputDir, 'error-scan.jsonl'), scan.ndjson);
    const outputPath = path.join(outputDir, 'dictionary.xlsx');
    await (await SpreadsheetFile.exportXlsx(wb)).save(outputPath);
    const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
    assert(equal(expected, snapshot(reopened)), 'workbook values/formulas changed during export/import; do not use output');
    report.allSheetsValuesFormulasRoundtrip = true;
  }
  assert(originalHash === sha256(await fs.readFile(inputPath)), 'source changed during run; rebase patches on current workbook');
  await fs.writeFile(path.join(outputDir, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, delta, input, output] = process.argv.slice(2);
  updateDictionary(delta, input, output, mode).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
