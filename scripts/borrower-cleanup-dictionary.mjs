import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

// Documentation checkpoint only; no AppSheet connection or operational data.
const out = 'outputs/borrower-cleanup-20260913';
await fs.mkdir(out, { recursive: true });
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load('Documents/AppSheet_Data_Dictionary.xlsx'));
const columns = wb.worksheets.getItem('Columns');
const targets = new Set(['Borrower Name', 'Description', 'Communication Name', 'City', 'AI Collection Enabled']);
const rows = columns.getRange('A5:H410').values;
const selected = rows.map((values, i) => ({ row: i + 5, values })).filter(x => x.values[0] === 'Borrowers' && targets.has(x.values[2]));
if (selected.length !== 5) throw Error('Expected five unique borrower inventory rows');
console.log(JSON.stringify(selected));
if (process.argv[2] !== 'edit') {
  const preview = await wb.render({ sheetName: 'Columns', range: 'A7:H9', scale: 1, format: 'png' });
  await fs.writeFile(`${out}/dictionary-before.png`, new Uint8Array(await preview.arrayBuffer()));
} else {
  const notes = {
    'Borrower Name': 'Internal name preserved. OLTP display changed to Borrower Name - Thai. OLAP display reconciliation pending.',
    'Description': 'Internal Description preserved. OLTP display changed to English Name. OLAP and Partner Operations GUI label reconciliation pending.',
    'Communication Name': 'OLTP Require enabled. OLAP reconciliation pending. Blank initial value retained.',
    'City': 'OLTP Require enabled; display เมือง / City and blank initial retained. OLAP reconciliation pending.',
    'AI Collection Enabled': 'OLTP initial changed to TRUE for new rows. Existing row values untouched. OLAP reconciliation pending.'
  };
  for (const { row, values } of selected) {
    columns.getRange(`H${row}`).values = [[notes[values[2]] + ' Final readback/tests pending.']];
    columns.getRange(`H${row}`).format.wrapText = true;
    if (row < 10) columns.getRange(`A${row}:H${row}`).format.rowHeight = 42;
    if (['Communication Name', 'City'].includes(values[2])) columns.getRange(`F${row}`).values = [['OLTP required; OLAP prior optional, table read-only. Pending final reconciliation.']];
  }
  columns.getRange('A2').values = [['13 September 2026: borrower cleanup PARTIAL. Five OLTP settings saved; post-save readback and OLAP reconciliation pending. All other inventory retains prior verification scope.']];
  wb.worksheets.getItem('README').getRange('B5').values = [['Borrower cleanup PARTIAL: five OLTP settings saved; Chrome control failed before final version/readback. OLAP remains prior configuration. See authoritative borrower cleanup change log.']];
  wb.recalculate();
  console.log((await wb.inspect({kind:'match', searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!', options:{useRegex:true,maxResults:10}})).ndjson);
  const preview = await wb.render({sheetName:'Columns',range:'A7:H9',scale:1,format:'png'});
  await fs.writeFile(`${out}/dictionary-after.png`,new Uint8Array(await preview.arrayBuffer()));
  await (await SpreadsheetFile.exportXlsx(wb)).save(`${out}/AppSheet_Data_Dictionary.xlsx`);
}
