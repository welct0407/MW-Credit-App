import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const dir = 'outputs/r013-20260921';
const targetRange = 'A2877:E2879';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet = wb.worksheets.getItem('Dev Differences');
const before = wb.worksheets.items.map((s) => ({
  name: s.name,
  values: s.getUsedRange().values,
  formulas: s.getUsedRange().formulas,
}));

const current = sheet.getRange(targetRange).values;
assert.deepEqual(current.map((row) => row[0]), ['R013 DEV SQL', 'R013 receipt mapping', 'R013 DEV OLTP']);

const promoted = [
  ['R013 promoted / closed', 'Cash Ledger[Created At]', 'Payment insert timestamp',
    'Promoted 21 Sep 2026: PROD V30 / OLTP 3.000240 / OLAP 1.100189. New System/Payment entries inherit Payments[Created At]; missing source time falls back to current Bangkok server time. Other sources and existing rows unchanged.',
    'DEV V30 matches production. No new columns or backfill.'],
  ['R013 promoted / closed', 'Payments[Payment Date], Payments[Created At]', 'Existing receipt fields',
    'Production V30 supports the existing receipt date/time fields. Automatic receipt payment creation remains disabled; R013 performed no payment write.',
    'Receipt summary prepares Payment Date and Created At from the printed Bangkok transfer date/time. No new columns.'],
  ['R013 promoted / closed', 'Cash Account Statement Recent[Statement Time]', 'Time: Ignore seconds',
    'PROD OLTP 3.000240: TRUE, unchanged by the R013 SQL-only promotion. Hours/minutes only.',
    'DEV OLTP 1.000064: TRUE, matching production. Stored receipt transfer time flows through the existing ledger timestamp; no app promotion in R013.'],
];

sheet.getRange(targetRange).values = promoted;
wb.recalculate();
await fs.mkdir(`${dir}/.tmp`, {recursive: true});
const preview = await wb.render({sheetName: 'Dev Differences', range: targetRange, scale: 1, format: 'png'});
await fs.writeFile(`${dir}/dictionary-promoted.png`, new Uint8Array(await preview.arrayBuffer()));
const out = `${dir}/.tmp/dictionary-promoted.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(out);

const after = await SpreadsheetFile.importXlsx(await FileBlob.load(out));
for (const prior of before) {
  const saved = after.worksheets.getItem(prior.name);
  const values = saved.getUsedRange().values;
  const formulas = saved.getUsedRange().formulas;
  if (prior.name === 'Dev Differences') {
    assert.deepEqual(values.slice(0, 2876), prior.values.slice(0, 2876));
    assert.deepEqual(values.slice(2879), prior.values.slice(2879));
  } else {
    assert.deepEqual(values, prior.values);
  }
  assert.deepEqual(formulas, prior.formulas);
}
assert.deepEqual(after.worksheets.getItem('Dev Differences').getRange(targetRange).values, promoted);
const errors = await after.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: {useRegex: true, maxResults: 50},
  summary: 'R013 dictionary promotion formula-error scan',
});
await fs.copyFile(out, input);
await fs.writeFile(`${dir}/dictionary-promotion-verification.json`, JSON.stringify({
  range: targetRange,
  priorValuesOutsideRangePreserved: true,
  allFormulasPreserved: true,
  promotedRows: promoted.length,
  formulaErrorScan: errors.ndjson,
}, null, 2));
console.log(JSON.stringify({output: input, range: targetRange}));
