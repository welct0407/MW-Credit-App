import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const outputDir = 'outputs/r009-20260919/dictionary-effective-rate';
const mode = process.argv[2] ?? 'inspect';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet = workbook.worksheets.getItem('Dev Differences');
const used = sheet.getUsedRange();
const values = used.values;
const matches = values.map((row, index) => ({ row: index + 1, values: row }))
  .filter(item => JSON.stringify(item.values).includes('Effective Daily Interest Rate'));

await fs.mkdir(outputDir, { recursive: true });
const start = Math.max(1, values.length - 7);
const end = values.length;
const before = await workbook.render({ sheetName: 'Dev Differences', range: `A${start}:E${end}`, scale: 1, format: 'png' });
await fs.writeFile(`${outputDir}/before.png`, new Uint8Array(await before.arrayBuffer()));

if (mode === 'inspect') {
  console.log(JSON.stringify({ sheets: workbook.worksheets.items.map(s => s.name), rowCount: values.length, matches, previewRange: `A${start}:E${end}` }, null, 2));
  process.exit(0);
}

assert.equal(mode, 'apply');
const row = values.length + 1;
sheet.getRange(`A${row}:E${row}`).copyFrom(sheet.getRange(`A${row - 1}:E${row - 1}`), 'all');
const newRow = [[
  'Both DEV R009',
  'Loans.Effective Daily Interest Rate',
  'Current daily return',
  'PROD V24: applicable daily income / Principal Amount',
  'DEV V26 / OLTP 1.000032 / OLAP 1.000015: applicable daily income / Outstanding Principal; zero when Outstanding Principal <= 0. OLTP existing VC and public.olap_loans_analytics aligned. Loan Key unchanged. Pending promotion.'
]];
sheet.getRange(`A${row}:E${row}`).values = newRow;
sheet.getRange(`A${row}:E${row}`).format.wrapText = true;
sheet.getRange(`A${row}:E${row}`).format.rowHeight = 90;
sheet.getRange(`A${row}:E${row}`).format.verticalAlignment = 'center';
workbook.recalculate();
const after = await workbook.render({ sheetName: 'Dev Differences', range: `A${Math.max(1, row - 4)}:E${row}`, scale: 1, format: 'png' });
await fs.writeFile(`${outputDir}/after.png`, new Uint8Array(await after.arrayBuffer()));
const scan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 30 } });
await fs.writeFile(`${outputDir}/error-scan.jsonl`, scan.ndjson);
await (await SpreadsheetFile.exportXlsx(workbook)).save(input);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
assert.deepEqual(reopened.worksheets.getItem('Dev Differences').getRange(`A${row}:E${row}`).values, newRow);
await fs.writeFile(`${outputDir}/verification.json`, JSON.stringify({ changedRange: `Dev Differences!A${row}:E${row}`, value: newRow[0], errorScan: 'error-scan.jsonl' }, null, 2) + '\n');
console.log(JSON.stringify({ output: input, changedRange: `Dev Differences!A${row}:E${row}` }));
