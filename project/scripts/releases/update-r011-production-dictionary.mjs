import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workbookPath = 'Documents/AppSheet_Data_Dictionary.xlsx';
const evidenceDir = 'outputs/r011-20260920/dictionary-production';
const productionSummary = 'Promoted 21 Sep 2026: PROD SQL V29 / OLTP 3.000240 / OLAP 1.100189. Definition matches frozen RC3 1.000005; R012 scope merged into R011.';

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const dev = wb.worksheets.getItem('Dev Differences');
const prod = wb.worksheets.getItem('Prod Columns');
const settings = wb.worksheets.getItem('App Settings');
await fs.mkdir(evidenceDir, { recursive: true });

assert.equal(dev.getUsedRange().address, 'A1:E2876');
assert(['A1:I709', 'A1:I714'].includes(prod.getUsedRange().address));
assert(['A1:E130', 'A1:E135'].includes(settings.getUsedRange().address));

for (let row = 2857; row <= 2876; row += 1) {
  dev.getRange(`A${row}`).values = [['R011 promoted / closed']];
  dev.getRange(`D${row}`).values = [[productionSummary]];
}

if (prod.getUsedRange().address === 'A1:I709') {
  for (let row = 710; row <= 714; row += 1) prod.getRange(`A${row}:I${row}`).copyFrom(prod.getRange('A709:I709'), 'all');
}
prod.getRange('A710:I714').values = [
  ['OLTP', 'Borrowers', 'Borrower Note', 'LongText', 'No', 'No', 'No', 'No', 'No'],
  ['OLTP', 'Cash Accounts', 'Alternative Account Number', 'Text', 'No', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Cash Accounts', 'Alternative Account Number', 'Text', 'No', 'No', 'No', 'No', 'No'],
  ['OLAP', 'Cash Ledger', 'Movement Time', 'Text', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Cash Ledger', 'Ref Borrower', 'Ref', 'Yes', 'No', 'No', 'Yes', 'No'],
];

if (settings.getUsedRange().address === 'A1:E130') {
  for (let row = 131; row <= 135; row += 1) settings.getRange(`A${row}:E${row}`).copyFrom(settings.getRange('A130:E130'), 'all');
}
settings.getRange('A131:E135').values = [
  ['production-oltp', 'Borrowers', 'Borrower Note / collection quick edit', 'Optional LongText; Todays Collection Board updates only; detail quick edit contains Borrower Note', 'R011 PROD 3.000240; outputs/r011-20260920/production/REPORT.md'],
  ['production-oltp', 'Borrowers', 'Required English Name and bilingual form labels', 'Description required in AppSheet; six Thai-first bilingual labels retained', 'R011 PROD 3.000240; blank borrower form opened and cancelled'],
  ['production pair', 'Localization', 'System text (116 entries per app)', 'Partner Language Preference via Login Email; English label for English, Thai fallback', 'R011 PROD OLTP 3.000240 / OLAP 1.100189'],
  ['production pair', 'Cash Accounts', 'Alternative Account Number', 'Nullable second identifier; OLAP editable, OLTP read-only; PII/searchable', 'R011 PROD SQL V29; OLTP 3.000240 / OLAP 1.100189'],
  ['production-olap', 'Cash Ledger Recent', 'View configuration', 'Movement Date; hh:mm Movement Time; borrower/payer; movement, amount, holders, payment/loan/source/notes/creator and account context; Narrow; date/time descending; quick edit off', 'R011 PROD OLAP 1.100189; Cash Position production smoke'],
];

dev.getRange('A2857:E2876').format.wrapText = true;
prod.getRange('A710:I714').format.wrapText = true;
settings.getRange('A131:E135').format.wrapText = true;
dev.getRange('A2857:E2876').format.rowHeight = 118;
prod.getRange('A710:I714').format.rowHeight = 42;
settings.getRange('A131:E134').format.rowHeight = 82;
settings.getRange('A135:E135').format.rowHeight = 126;
wb.recalculate();

const checks = [];
for (const [sheetId, range] of [
  ['Dev Differences', 'A2857:E2876'],
  ['Prod Columns', 'A706:I714'],
  ['App Settings', 'A127:E135'],
]) {
  const result = await wb.inspect({ kind: 'table', sheetId, range, include: 'values,formulas', tableMaxRows: 30, tableMaxCols: 10, maxChars: 30000 });
  checks.push(result.ndjson);
}
assert(checks[0].includes('R011 promoted / closed'));
assert(checks[1].includes('Movement Time'));
assert(checks[2].includes('Cash Ledger Recent'));

const errors = await wb.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 300, matchFormulas: true },
  maxChars: 12000,
  summary: 'final formula error scan',
});
assert(errors.ndjson.includes('matched 0') || errors.ndjson.includes('0 entries'));

for (const [sheetName, range, name] of [
  ['Dev Differences', 'A2857:E2876', 'closed-dev-differences.png'],
  ['Prod Columns', 'A706:I714', 'prod-columns.png'],
  ['App Settings', 'A127:E135', 'app-settings.png'],
]) {
  const image = await wb.render({ sheetName, range, scale: 1.2, format: 'png' });
  await fs.writeFile(`${evidenceDir}/${name}`, new Uint8Array(await image.arrayBuffer()));
}

const temporary = `${evidenceDir}/dictionary.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(temporary);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(temporary));
assert.equal(reopened.worksheets.getItem('Prod Columns').getRange('C714').values[0][0], 'Ref Borrower');
assert.equal(reopened.worksheets.getItem('App Settings').getRange('C135').values[0][0], 'View configuration');
await fs.copyFile(temporary, workbookPath);
await fs.rm(temporary, { force: true });
await fs.rm(`${temporary}.inspect.ndjson`, { force: true });
await fs.writeFile(`${evidenceDir}/verification.json`, JSON.stringify({
  closedDevDifferenceRange: 'Dev Differences!A2857:E2876',
  prodColumnRange: 'Prod Columns!A710:I714',
  appSettingsRange: 'App Settings!A131:E135',
  formulaErrorMatches: 0,
  output: workbookPath,
}, null, 2) + '\n');
console.log(JSON.stringify({ workbookPath, evidenceDir }));
