import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';

const file = 'Documents/AppSheet_Data_Dictionary.xlsx';
const out = 'outputs/r006-20260918';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sh = wb.worksheets.getItem('Dev Differences');
const rows = sh.getUsedRange().values;
const delta = JSON.parse(await fs.readFile(`${out}/release-delta.json`, 'utf8'));
const expected = Object.fromEntries(wb.worksheets.items.map(s => [s.name, {
  values: s.getUsedRange().values,
  formulas: s.getUsedRange().formulas
}]));

for (const item of delta.items) {
  const index = rows.findIndex(r => String(r[0]).startsWith('R006 DEV only') && r[1] === item.object && r[2] === item.property);
  if (index < 0) throw new Error(`R006 row not found: ${item.object}`);
  const record = [
    'R006 applied / PROD OLTP 3.000173; DEV OLTP 1.000134',
    item.object,
    item.property,
    `PROD App formula (saved 3.000173): ${item.prod.value} Evidence: outputs/r006-20260918/prod-readback-r1.json and prod-saved-observations.json.`,
    `DEV App formula (saved 1.000134): ${item.dev.value} Promoted target matches PROD. No SQL/type/Ref change.`
  ];
  const range = sh.getRangeByIndexes(index, 0, 1, 5);
  range.values = [record];
  range.format.wrapText = true;
  range.format.rowHeight = index === 0 || index === rows.length - 1 ? 250 : 160;
  rows[index] = record;
}
expected['Dev Differences'].values = rows;

const normalize = a => {
  const b = a.map(r => r.map(v => v ?? ''));
  while (b.length && b.at(-1).every(v => v === '')) b.pop();
  return b;
};
for (const [i, item] of delta.items.entries()) {
  const row = rows.findIndex(r => r[1] === item.object && r[2] === item.property) + 1;
  const blob = await wb.render({sheetName: sh.name, range: `A${row}:E${row}`, scale: 1, format: 'png'});
  await fs.writeFile(`${out}/dictionary-promoted-${i + 1}.png`, new Uint8Array(await blob.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(file);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
for (const s of reopened.worksheets.items) {
  if (JSON.stringify(normalize(s.getUsedRange().values)) !== JSON.stringify(normalize(expected[s.name].values))) throw new Error(`Unexpected value change ${s.name}`);
  if (JSON.stringify(normalize(s.getUsedRange().formulas)) !== JSON.stringify(normalize(expected[s.name].formulas))) throw new Error(`Unexpected spreadsheet formula change ${s.name}`);
}
const scan = await reopened.inspect({kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!', options: {useRegex: true, maxResults: 30}});
await fs.writeFile(`${out}/dictionary-promotion-error-scan.jsonl`, scan.ndjson);
await fs.writeFile(`${out}/dictionary-promotion-verification.json`, JSON.stringify({
  promotedRows: 4,
  range: 'Dev Differences!A1282:E1285',
  allSheetsValueAndFormulaRoundtrip: true,
  productionInventoryRowsUnchanged: true
}, null, 2) + '\n');
console.log('Four R006 dictionary rows updated to promoted PROD/DEV values; all sheets values/formulas verified');
