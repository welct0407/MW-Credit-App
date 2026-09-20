import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = 'Documents/AppSheet_Data_Dictionary.xlsx';
const dir = 'outputs/r011-20260920/dictionary-labels';
const rows = [
  ['R011 DEV OLTP refinement', 'Borrowers[Borrower Name]', 'Display name', 'Borrower Name - Thai', 'ชื่อผู้กู้ - ไทย / Borrower Name - Thai'],
  ['R011 DEV OLTP refinement', 'Borrowers[Description]', 'Display name', 'English Name', 'ชื่อภาษาอังกฤษ / English Name'],
  ['R011 DEV OLTP refinement', 'Borrowers[Ref Preferred Receiving Cash Account]', 'Display name', 'Raw column name (unset)', 'บัญชีรับเงินที่ต้องการ / Preferred Receiving Cash Account'],
  ['R011 DEV OLTP refinement', 'Borrowers[Instagram Username]', 'Display name', 'Raw column name (unset)', 'ชื่อผู้ใช้ Instagram / Instagram Username'],
  ['R011 DEV OLTP refinement', 'Borrowers[AI Collection Enabled]', 'Display name', 'Raw column name (unset)', 'เปิดใช้ AI Collection / AI Collection Enabled'],
  ['R011 DEV OLTP refinement', 'Borrowers[Address]', 'Display name', 'Raw column name (unset)', 'ที่อยู่ / Address'],
];

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(input));
const sheet = wb.worksheets.getItem('Dev Differences');
const existing = sheet.getUsedRange().values;
await fs.mkdir(dir, { recursive: true });

if ((process.argv[2] ?? 'inspect') === 'inspect') {
  assert(!existing.some((row) => row.some((value) => String(value).includes('R011 DEV OLTP refinement'))), 'Refinement rows already exist');
  const start = Math.max(1, existing.length - 1);
  const picture = await wb.render({ sheetName: 'Dev Differences', range: `A${start}:E${existing.length}`, scale: 1, format: 'png' });
  await fs.writeFile(`${dir}/before.png`, new Uint8Array(await picture.arrayBuffer()));
  console.log(JSON.stringify({ rows: existing.length, header: existing[0], tail: existing.slice(-2) }));
} else {
  assert(!existing.some((row) => row.some((value) => String(value).includes('R011 DEV OLTP refinement'))), 'Refinement rows already exist');
  const before = wb.worksheets.items.map((item) => ({
    name: item.name,
    values: item.getUsedRange().values,
    formulas: item.getUsedRange().formulas,
  }));
  const start = existing.length + 1;
  const end = existing.length + rows.length;
  for (let row = start; row <= end; row += 1) {
    sheet.getRange(`A${row}:E${row}`).copyFrom(sheet.getRange(`A${start - 1}:E${start - 1}`), 'all');
  }
  sheet.getRange(`A${start}:E${end}`).values = rows;
  sheet.getRange(`A${start}:E${end}`).format.wrapText = true;
  sheet.getRange(`A${start}:E${end}`).format.rowHeight = 145;
  wb.recalculate();

  const picture = await wb.render({ sheetName: 'Dev Differences', range: `A${start}:E${end}`, scale: 1, format: 'png' });
  await fs.writeFile(`${dir}/after.png`, new Uint8Array(await picture.arrayBuffer()));
  const temporaryOutput = `${dir}/dictionary.xlsx`;
  await (await SpreadsheetFile.exportXlsx(wb)).save(temporaryOutput);

  const after = await SpreadsheetFile.importXlsx(await FileBlob.load(temporaryOutput));
  for (const snapshot of before) {
    const current = after.worksheets.getItem(snapshot.name);
    assert.deepEqual(current.getUsedRange().values.slice(0, snapshot.values.length), snapshot.values);
    assert.deepEqual(current.getUsedRange().formulas.slice(0, snapshot.formulas.length), snapshot.formulas);
  }
  assert.deepEqual(after.worksheets.getItem('Dev Differences').getRange(`A${start}:E${end}`).values, rows);
  await fs.copyFile(temporaryOutput, input);
  await fs.writeFile(`${dir}/verification.json`, JSON.stringify({
    range: `A${start}:E${end}`,
    allPriorValuesAndFormulasPreserved: true,
    rowsAdded: rows.length,
  }, null, 2));
  console.log(JSON.stringify({ start, end, output: input }));
}
