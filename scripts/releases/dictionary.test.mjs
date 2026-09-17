import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Workbook, FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import { readJson, sha256 } from './delta.mjs';
import { planUpdates, updateDictionary } from './dictionary.mjs';

const [mode, directory] = process.argv.slice(2);
assert(directory, 'Output directory required');
const source = path.join(directory, 'synthetic-input.xlsx');
const deltaPath = path.join(directory, 'synthetic-delta.json');
if (mode === 'create') {
  await fs.mkdir(directory, { recursive: true });
  const wb = Workbook.create(), sheet = wb.worksheets.add('Column Rules');
  sheet.getRange('A1:E3').values = [
    ['App', 'Table', 'Column', 'Rule', 'Expression'],
    ['OLTP', 'Example', 'Status', 'Show_If', 'TRUE'],
    ['OLAP', 'Example', 'Status', 'Show_If', 'FALSE']
  ];
  sheet.getRange('A1:E3').format.font = { name: 'Arial', size: 11 };
  sheet.getRange('A1:E3').format.columnWidth = 20;
  sheet.getRange('A1:E3').format.rowHeight = 28;
  sheet.getRange('E1:E3').format.columnWidth = 32;
  sheet.getRange('A1:E1').format.fill = '#243746';
  sheet.getRange('A1:E1').format.font.color = '#FFFFFF';
  sheet.showGridLines = false;
  const untouched = wb.worksheets.add('Preserved');
  untouched.getRange('A1:B2').values = [['Unchanged', 'Formula'], ['Keep this text', null]];
  untouched.getRange('B2').formulas = [['=1+1']];
  untouched.getRange('A1:B2').format.columnWidth = 24;
  wb.recalculate();
  await (await SpreadsheetFile.exportXlsx(wb)).save(source);
  const png = await wb.render({ sheetName: 'Column Rules', range: 'A1:E3', scale: 1, format: 'png' });
  await fs.writeFile(path.join(directory, 'synthetic-before.png'), new Uint8Array(await png.arrayBuffer()));
  const delta = await readJson(new URL('./example-delta.json', import.meta.url));
  delta.dictionaryUpdates = [{ sheet: 'Column Rules', range: 'A1:E3', previewRange: 'A1:E3',
    key: { App: 'OLTP', Table: 'Example', Column: 'Status', Rule: 'Show_If' }, column: 'Expression', expected: 'TRUE', fromItem: 'APP-001', environment: 'dev' }];
  await fs.writeFile(deltaPath, JSON.stringify(delta, null, 2) + '\n');
  console.log('Created synthetic fixture and before preview. View it before running verify.');
} else if (mode === 'verify') {
  const inputHash = sha256(await fs.readFile(source));
  const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
  const delta = await readJson(deltaPath);
  const clone = () => structuredClone(delta);
  assert.equal(planUpdates(wb, delta).length, 1);
  let bad = clone(); bad.dictionaryUpdates[0].key.App = 'missing'; assert.throws(() => planUpdates(wb, bad), /matched 0/);
  bad = clone(); delete bad.dictionaryUpdates[0].key.App; assert.throws(() => planUpdates(wb, bad), /matched 2/);
  bad = clone(); bad.dictionaryUpdates[0].expected = 'stale'; assert.throws(() => planUpdates(wb, bad), /old-value guard/);
  bad = clone(); bad.dictionaryUpdates.push(structuredClone(bad.dictionaryUpdates[0])); assert.throws(() => planUpdates(wb, bad), /duplicate target/);
  bad = clone(); bad.dictionaryUpdates[0].column = 'Missing'; assert.throws(() => planUpdates(wb, bad), /header/);
  bad = clone(); bad.dictionaryUpdates = [{ sheet: 'Preserved', range: 'A1:B2', previewRange: 'A1:B2', key: { Unchanged: 'Keep this text' }, column: 'Formula', expected: 2, value: 3 }];
  assert.throws(() => planUpdates(wb, bad), /Excel formula/);
  const report = await updateDictionary(deltaPath, source, path.join(directory, 'patched'), 'apply');
  assert.equal(report.allSheetsValuesFormulasRoundtrip, true);
  assert.equal(sha256(await fs.readFile(source)), inputHash);
  const result = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(directory, 'patched', 'dictionary.xlsx')));
  assert.equal(result.worksheets.getItem('Column Rules').getRange('E2').values[0][0], delta.items[0].dev.value);
  assert.equal(result.worksheets.getItem('Column Rules').getRange('E3').values[0][0], 'FALSE');
  assert.equal(result.worksheets.getItem('Preserved').getRange('B2').formulas[0][0], '=1+1');
  const summary = { syntheticOnly: true, checks: ['unique-key update', 'missing-key rejection', 'ambiguous-key rejection', 'stale-value rejection', 'duplicate-cell rejection', 'missing-header rejection', 'formula-overwrite rejection', 'all-sheet values/formulas roundtrip', 'source byte preservation', 'delta-derived target', 'unrelated row preservation', 'unrelated formula preservation'], passed: true };
  await fs.writeFile(path.join(directory, 'dictionary-tests.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
} else throw new Error('Usage: dictionary.test.mjs create|verify OUTPUT-DIRECTORY');
