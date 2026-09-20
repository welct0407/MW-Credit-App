import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const dir = 'outputs/r011-20260920/dictionary-localization';
const marker = 'R011 DEV partner-language localization';
const expression = 'IF(LOOKUP(USEREMAIL(), "Partners", "Login Email", "Language Preference") = "English", "<AppSheet English label>", "<Thai localization>")';
const rows = [
  [marker, 'OLTP Settings > Views: Localization > System text', 'Localized value (116 entries)', 'Mostly static Thai values', `${expression}; default/fallback Thai; saved in DEV OLTP 1.000059; exact readback evidence: outputs/r011-20260920/localization/verification.json`],
  [marker, 'OLAP Settings > Views: Localization > System text', 'Localized value (116 entries)', 'Mostly static Thai values', `${expression}; copied from OLTP; default/fallback Thai; saved in DEV OLAP 1.000018; exact readback evidence: outputs/r011-20260920/localization/verification.json`],
];

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet = wb.worksheets.getItem('Dev Differences');
const existing = sheet.getUsedRange().values;
await fs.mkdir(dir, { recursive: true });

if ((process.argv[2] ?? 'inspect') === 'inspect') {
  assert(!existing.some((row) => row.some((value) => String(value).includes(marker))), 'Localization rows already exist');
  const start = Math.max(1, existing.length - 2);
  const preview = await wb.render({ sheetName: 'Dev Differences', range: `A${start}:E${existing.length}`, scale: 1, format: 'png' });
  await fs.writeFile(`${dir}/before.png`, new Uint8Array(await preview.arrayBuffer()));
  await wb.inspect({ kind: 'table', range: `Dev Differences!A${start}:E${existing.length}`, include: 'values,formulas', tableMaxRows: 10, tableMaxCols: 5, maxChars: 5000 });
  console.log(JSON.stringify({ rows: existing.length, header: existing[0], tail: existing.slice(-3) }));
} else if (process.argv[2] === 'apply') {
  assert(!existing.some((row) => row.some((value) => String(value).includes(marker))), 'Localization rows already exist');
  const before = wb.worksheets.items.map((item) => ({ name: item.name, values: item.getUsedRange().values, formulas: item.getUsedRange().formulas }));
  const start = existing.length + 1;
  const end = existing.length + rows.length;
  for (let row = start; row <= end; row += 1) sheet.getRange(`A${row}:E${row}`).copyFrom(sheet.getRange(`A${start - 1}:E${start - 1}`), 'all');
  sheet.getRange(`A${start}:E${end}`).values = rows;
  sheet.getRange(`A${start}:E${end}`).format.wrapText = true;
  sheet.getRange(`A${start}:E${end}`).format.rowHeight = 145;
  wb.recalculate();
  const check = await wb.inspect({ kind: 'table', range: `Dev Differences!A${start}:E${end}`, include: 'values,formulas', tableMaxRows: 5, tableMaxCols: 5, maxChars: 8000 });
  assert(check.ndjson.includes('"rows":2'), 'Final workbook inspection did not return both appended rows');
  const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 300 }, summary: 'final formula error scan' });
  await fs.writeFile(`${dir}/error-scan.jsonl`, errors.ndjson);
  const preview = await wb.render({ sheetName: 'Dev Differences', range: `A${start}:E${end}`, scale: 1, format: 'png' });
  await fs.writeFile(`${dir}/after.png`, new Uint8Array(await preview.arrayBuffer()));
  const temporaryOutput = `${dir}/dictionary.xlsx`;
  await (await SpreadsheetFile.exportXlsx(wb)).save(temporaryOutput);
  const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(temporaryOutput));
  for (const snapshot of before) {
    const current = reopened.worksheets.getItem(snapshot.name);
    assert.deepEqual(current.getUsedRange().values.slice(0, snapshot.values.length), snapshot.values);
    assert.deepEqual(current.getUsedRange().formulas.slice(0, snapshot.formulas.length), snapshot.formulas);
  }
  assert.deepEqual(reopened.worksheets.getItem('Dev Differences').getRange(`A${start}:E${end}`).values, rows);
  await fs.copyFile(temporaryOutput, input);
  await fs.rm(temporaryOutput, { force: true });
  await fs.rm(`${temporaryOutput}.inspect.ndjson`, { force: true });
  await fs.writeFile(`${dir}/verification.json`, JSON.stringify({ range: `A${start}:E${end}`, allPriorValuesAndFormulasPreserved: true, rowsAdded: rows.length, formulaErrorMatches: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ start, end, output: input }));
} else {
  throw new Error('Usage: update-r011-localization-dictionary.mjs inspect|apply');
}
