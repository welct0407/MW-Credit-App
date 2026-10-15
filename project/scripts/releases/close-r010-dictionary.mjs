import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const out = 'outputs/r010-20260919/production/dictionary';
const mode = process.argv[2] ?? 'inspect';
await fs.mkdir(out, {recursive: true});

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet = wb.worksheets.getItem('Dev Differences');
const start = 2790;
const end = 2856;
const releaseText = 'Promoted 20 Sep 2026: PROD SQL V27 / OLTP 3.000235. Definition matches frozen RC2 1.000004.';

if (mode === 'inspect') {
  const preview = await wb.render({sheetName: 'Dev Differences', range: `A${end - 2}:E${end}`, scale: 1, format: 'png'});
  await fs.writeFile(`${out}/before.png`, new Uint8Array(await preview.arrayBuffer()));
  console.log(JSON.stringify({range: `A${start}:E${end}`, rows: sheet.getUsedRange().values.length}));
  process.exit(0);
}

assert.equal(mode, 'apply');
const current = sheet.getRange(`A${start}:E${end}`).values;
assert.equal(current.length, end - start + 1);
assert(current.every(row => /R010/.test(String(row[0]))),
  'R010 rows changed unexpectedly; inspect before editing.');

const normalized = rows => rows.map(row => row.map(value => value ?? null));
const before = wb.worksheets.items.map(s => ({
  name: s.name,
  values: normalized(s.getUsedRange().values),
  formulas: normalized(s.getUsedRange().formulas),
}));

for (let row = start; row <= end; row++) {
  sheet.getRange(`A${row}`).values = [['R010 promoted / closed']];
  sheet.getRange(`D${row}`).values = [[releaseText]];
  const evidence = sheet.getRange(`E${row}`).values[0][0];
  if (typeof evidence === 'string' && evidence.includes('database-3')) {
    sheet.getRange(`E${row}`).values = [[evidence.replaceAll('database-3', 'database-2')]];
  }
}

const guide = wb.worksheets.getItem('Guide');
const guide3 = [...guide.getRange('A3:C3').values[0]];
const guide5 = [...guide.getRange('A5:C5').values[0]];
const guide6 = [...guide.getRange('A6:C6').values[0]];
guide3[1] = 'R010: SQL V27; OLTP 3.000235; OLAP 1.100183 unchanged by R010';
guide3[2] = '20 Sep 2026 App Upgrade from immutable RC2 1.000004. Rollback OLTP 3.000232 with additive V27 retained; restore-tested private V26 dump.';
guide5[1] = 'PROD and DEV V27';
guide5[2] = 'V27 recent Cash Account Statement providers and private selection context. Older dated entries below remain history.';
guide6[0] = 'R010 production model';
guide6[1] = 'Dev Differences rows 2790-2856 promoted / closed';
guide6[2] = 'Payment validation, bilingual messages and Cash Statement promoted to PROD OLTP 3.000235 / SQL V27. See outputs/r010-20260919/production/REPORT.md.';
guide.getRange('A3:C3').values = [guide3];
guide.getRange('A5:C5').values = [guide5];
guide.getRange('A6:C6').values = [guide6];

wb.recalculate();

const output = `${out}/AppSheet_Data_Dictionary.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(output);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(output));

for (const old of before) {
  const revised = reopened.worksheets.getItem(old.name);
  const values = normalized(revised.getUsedRange().values);
  const formulas = normalized(revised.getUsedRange().formulas);
  for (let i = 0; i < old.values.length; i++) {
    const changed = old.name === 'Dev Differences' && i + 1 >= start && i + 1 <= end
      || old.name === 'Guide' && [3, 5, 6].includes(i + 1);
    if (!changed) {
      assert.deepEqual(values[i], old.values[i], `${old.name}:${i + 1} values`);
      assert.deepEqual(formulas[i], old.formulas[i], `${old.name}:${i + 1} formulas`);
    }
  }
}
for (let row = start; row <= end; row++) {
  const revised = reopened.worksheets.getItem('Dev Differences');
  assert.equal(revised.getRange(`A${row}`).values[0][0], 'R010 promoted / closed');
  assert.equal(revised.getRange(`D${row}`).values[0][0], releaseText);
}
await fs.copyFile(output, input);
await fs.writeFile(`${out}/verification.json`, JSON.stringify({
  range: `A${start}:E${end}`,
  guideRows: [3, 5, 6],
  productionVersion: '3.000235',
  sqlVersion: 27,
  allUnrelatedValuesAndFormulasPreserved: true,
}, null, 2) + '\n');
console.log(JSON.stringify({output: input, range: `A${start}:E${end}`, preserved: true}));
