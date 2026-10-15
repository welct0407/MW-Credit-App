import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const file = 'Documents/AppSheet_Data_Dictionary.xlsx';
const out = 'outputs/r003-production-appsheet-reconciliation-20260916';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before = Object.fromEntries(wb.worksheets.items.map((s) => [s.name, s.getUsedRange().values]));

const targets = {
  appSettings: before['App Settings'].filter((r) =>
    ['production-oltp', 'production-olap'].includes(r[0]) && r[1] === 'Version'),
  prodTables: before['Prod Tables'].filter((r) =>
    ['Borrowers', 'Business Expenses', 'Daily Analytics'].includes(r[2])),
  prodColumns: before['Prod Columns'].filter((r) =>
    (r[1] === 'Borrowers' && ['Ref Referrer', 'Related Referral Expenses', 'Total Referral Rebate Earned'].includes(r[2])) ||
    (r[1] === 'Business Expenses' && ['_RowNumber', 'Row ID', 'Amount', 'Ref Payee Borrower', 'Ref Related Borrower', 'Ref Related Loan'].includes(r[2])) ||
    (r[1] === 'Daily Analytics' && ['Business Expenses', 'Net Profit', 'Net Unsettled Profit EOD'].includes(r[2]))),
  devDifferences: before['Dev Differences'].filter((r) =>
    /Business Expenses|Ref Referrer|Referral|Daily Analytics\.(Business Expenses|Net Profit|Net Unsettled Profit EOD)|Partners_Detail|Settlements\.Amount|Analytics Data/.test(String(r[1]))),
};

if (process.argv.includes('--verify')) {
  const requiredColumns = [
    ['OLTP', 'Borrowers', 'Ref Referrer'],
    ['OLTP', 'Business Expenses', 'Amount'],
    ['OLAP', 'Borrowers', 'Related Referral Expenses'],
    ['OLAP', 'Business Expenses', 'Row ID'],
    ['OLAP', 'Daily Analytics', 'Business Expenses'],
    ['OLAP', 'Partners', 'Net Profit Earned'],
  ];
  console.log(JSON.stringify({
    appSettings: targets.appSettings,
    prodTableVersions: [...new Set(before['Prod Tables'].slice(1).map((r) => `${r[0]}:${r[1]}`))],
    requiredColumns: requiredColumns.map(([app, table, column]) => ({
      app, table, column,
      found: before['Prod Columns'].some((r) => r[0] === app && r[1] === table && r[2] === column),
    })),
    r003StatusRows: before['Dev Differences'].filter((r) => r[1] === 'R003 production reconciliation'),
  }, null, 2));
  process.exit(0);
}

if (!process.argv.includes('--edit')) {
  console.log(JSON.stringify(targets, null, 2));
  process.exit(0);
}

await fs.mkdir(out, { recursive: true });
const expected = structuredClone(before);
const changed = [];

const setRow = (sheetName, rowIndex, values) => {
  const sheet = wb.worksheets.getItem(sheetName);
  const width = expected[sheetName][0].length;
  expected[sheetName][rowIndex] = values;
  sheet.getRangeByIndexes(rowIndex, 0, 1, width).values = [values];
  changed.push({ sheet: sheetName, row: rowIndex + 1 });
};

for (const [app, version] of [['production-oltp', '3.000121'], ['production-olap', '1.100101']]) {
  const i = expected['App Settings'].findIndex((r) => r[0] === app && r[1] === 'Version');
  if (i < 0) throw new Error(`Missing App Settings version row: ${app}`);
  const row = [app, 'Version', 'Saved app version', version,
    'R003 production reconciliation; current editor and saved app documentation verified 2026-09-16'];
  if (JSON.stringify(expected['App Settings'][i]) !== JSON.stringify(row)) setRow('App Settings', i, row);
}

for (let i = 1; i < expected['Prod Tables'].length; i++) {
  const r = expected['Prod Tables'][i];
  if (r[0] === 'OLTP' && r[1] !== 'v3.000121') setRow('Prod Tables', i, [r[0], 'v3.000121', ...r.slice(2)]);
  if (r[0] === 'OLAP' && r[1] !== 'v1.100101') setRow('Prod Tables', i, [r[0], 'v1.100101', ...r.slice(2)]);
}

const appendOrUpdate = (sheetName, predicate, row, rowHeight = 90) => {
  const sheet = wb.worksheets.getItem(sheetName);
  let i = expected[sheetName].findIndex(predicate);
  if (i < 0) {
    i = expected[sheetName].length;
    const target = sheet.getRangeByIndexes(i, 0, 1, row.length);
    target.copyFrom(sheet.getRangeByIndexes(i - 1, 0, 1, row.length), 'all');
    target.format.wrapText = true;
    target.format.verticalAlignment = 'top';
    target.format.rowHeight = rowHeight;
    expected[sheetName].push(row);
    target.values = [row];
    changed.push({ sheet: sheetName, row: i + 1 });
  } else if (JSON.stringify(expected[sheetName][i]) !== JSON.stringify(row)) {
    setRow(sheetName, i, row);
  }
};

for (const [app, version, permission] of [
  ['OLTP', 'v3.000121', 'ADDS_AND_UPDATES'],
  ['OLAP', 'v1.100101', 'READ_ONLY'],
]) {
  appendOrUpdate('Prod Tables', (r) => r[0] === app && r[2] === 'Business Expenses',
    [app, version, 'Business Expenses', 'database-2', 'Business Expenses', 'Business Expenses_Schema', permission, 'Business source']);
}

const manualExpense = new Set(['Expense Date', 'Expense Category', 'Amount', 'Payee Name', 'Ref Related Borrower', 'Ref Related Loan', 'Notes']);
const expenseNames = ['_RowNumber', 'Row ID', 'Expense Date', 'Expense Category', 'Amount', 'Payee Name', 'Ref Payee Borrower', 'Ref Related Borrower', 'Ref Related Loan', 'Notes', 'Source Type', 'Source Key', 'Gross Profit Basis', 'Allocation Basis', 'Partner A Share', 'Partner B Share', 'Partner A Expense', 'Partner B Expense', 'Rule Version', 'Created At', 'Created By'];
const expenseTypes = {
  _RowNumber: 'Number', 'Row ID': 'Text', 'Expense Date': 'Date', 'Expense Category': 'Enum', Amount: 'Price',
  'Payee Name': 'Name', 'Ref Payee Borrower': 'Ref', 'Ref Related Borrower': 'Ref', 'Ref Related Loan': 'Ref',
  Notes: 'LongText', 'Source Type': 'Text', 'Source Key': 'LongText', 'Gross Profit Basis': 'Price',
  'Allocation Basis': 'LongText', 'Partner A Share': 'Percent', 'Partner B Share': 'Percent',
  'Partner A Expense': 'Price', 'Partner B Expense': 'Price', 'Rule Version': 'LongText', 'Created At': 'DateTime', 'Created By': 'LongText',
};
for (const app of ['OLTP', 'OLAP']) {
  for (const name of expenseNames) {
    const type = app === 'OLAP' && name === 'Expense Category' ? 'Text' : expenseTypes[name];
    const hidden = app === 'OLTP' ? (name === '_RowNumber' || name === 'Row ID' || !manualExpense.has(name)) : (name === '_RowNumber' || name === 'Row ID');
    const readOnly = app === 'OLTP' ? (name === '_RowNumber' || name === 'Row ID' || !manualExpense.has(name)) : name === '_RowNumber';
    appendOrUpdate('Prod Columns', (r) => r[0] === app && r[1] === 'Business Expenses' && r[2] === name,
      [app, 'Business Expenses', name, type, 'No', name === 'Row ID' ? 'Yes' : 'No', 'No', readOnly ? 'Yes' : 'No', hidden ? 'Yes' : 'No'], 42);
  }
}

const extraColumns = [
  ['OLTP', 'Borrowers', 'Ref Referrer', 'Ref', 'No', 'No', 'No', 'No', 'No'],
  ['OLTP', 'Borrowers', 'Related Business Expenses By Ref Payee Borrower', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLTP', 'Borrowers', 'Related Business Expenses By Ref Related Borrower', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLTP', 'Loans', 'Related Business Expenses', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Borrowers', 'Ref Referrer', 'Ref', 'No', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Borrowers', 'Related Referral Expenses', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Borrowers', 'Total Referral Rebate Earned', 'Price', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Borrowers', 'Related Business Expenses By Ref Payee Borrower', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Borrowers', 'Related Business Expenses By Ref Related Borrower', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Loans', 'Related Business Expenses', 'List', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Daily Analytics', 'Business Expenses', 'Price', 'No', 'No', 'No', 'No', 'No'],
  ['OLAP', 'Daily Analytics', 'Net Profit', 'Price', 'No', 'No', 'No', 'No', 'No'],
  ['OLAP', 'Daily Analytics', 'Net Unsettled Profit EOD', 'Price', 'No', 'No', 'No', 'No', 'No'],
  ['OLAP', 'Partners', 'Net Profit Earned', 'Price', 'Yes', 'No', 'No', 'Yes', 'No'],
  ['OLAP', 'Partners', 'Net Available to Settle', 'Price', 'Yes', 'No', 'No', 'Yes', 'No'],
];
for (const row of extraColumns) appendOrUpdate('Prod Columns', (r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2], row, 42);

const stats = {
  OLTP: ['Net Profit', 'Expenses MTD', 'Net Profit MTD', 'Operating Income MTD', 'Income Statement Expenses MTD', 'Header - Income Statement MTD'],
  OLAP: ['Total Business Expenses', 'Net Profit', 'Expenses MTD', 'Net Profit MTD', 'Net Unsettled Profit', 'Net Expected Loan Account Balance', 'Operating Income MTD', 'Income Statement Expenses MTD', 'Header - Income Statement MTD'],
};
for (const [app, names] of Object.entries(stats)) for (const name of names) {
  appendOrUpdate('Prod Columns', (r) => r[0] === app && r[1] === 'Statistics' && r[2] === name,
    [app, 'Statistics', name, name.startsWith('Header') ? 'Text' : 'Price', 'Yes', 'No', 'No', 'Yes', 'No'], 42);
}

const rules = [
  ['OLTP', 'Borrowers', 'Ref Referrer', 'Display name', 'ผู้แนะนำ / Referrer'],
  ['OLTP', 'Borrowers', 'Ref Referrer', 'Valid_If', 'SELECT(Borrowers[Row ID], [Row ID] <> [_THISROW].[Row ID])'],
  ['OLAP', 'Borrowers', 'Ref Referrer', 'Display name', 'ผู้แนะนำ / Referrer'],
  ['OLAP', 'Borrowers', 'Related Referral Expenses', 'App formula', 'FILTER("Business Expenses", AND([Ref Payee Borrower] = [_THISROW].[Row ID], [Source Type] = "Referral Rebate"))'],
  ['OLAP', 'Borrowers', 'Total Referral Rebate Earned', 'App formula', 'SUM([Related Referral Expenses][Amount])'],
  ['OLTP', 'Business Expenses', 'Amount', 'Valid_If', 'AND([_THIS] <> 0, [_THIS] = ROUND([_THIS]), OR([_THIS] > 0, ISNOTBLANK([Notes])))'],
  ['OLAP', 'Settlements', 'Amount', 'Valid_If', 'AND([_THIS] > 0, OR(AND([_THIS] = LOOKUP([Row ID], "Settlements", "Row ID", "Amount"), [Ref Partner] = LOOKUP([Row ID], "Settlements", "Row ID", "Ref Partner")), [_THIS] <= [Ref Partner].[Net Profit Earned] - SUM(SELECT(Settlements[Amount], AND([Ref Partner] = [_THISROW].[Ref Partner], [Row ID] <> [_THISROW].[Row ID])))))'],
  ['OLAP', 'Partners', 'Net Profit Earned', 'Display name', 'กำไรรวมที่ได้รับ / Total Profit Earned'],
  ['OLAP', 'Partners', 'Net Available to Settle', 'Display name', 'กำไรที่พร้อมโอน / Available to Settle'],
];
for (const row of rules) appendOrUpdate('Column Rules', (r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2] && r[3] === row[3], row, 90);

for (const [app, child, ref, parent] of [
  ['OLTP', 'Borrowers', 'Ref Referrer', 'Borrowers'], ['OLAP', 'Borrowers', 'Ref Referrer', 'Borrowers'],
  ['OLTP', 'Business Expenses', 'Ref Payee Borrower', 'Borrowers'], ['OLTP', 'Business Expenses', 'Ref Related Borrower', 'Borrowers'], ['OLTP', 'Business Expenses', 'Ref Related Loan', 'Loans'],
  ['OLAP', 'Business Expenses', 'Ref Payee Borrower', 'Borrowers'], ['OLAP', 'Business Expenses', 'Ref Related Borrower', 'Borrowers'], ['OLAP', 'Business Expenses', 'Ref Related Loan', 'Loans'],
]) appendOrUpdate('Prod Relationships', (r) => r[0] === app && r[1] === child && r[2] === ref,
  [app, child, ref, parent, 'Row ID', 'No'], 42);

const sliceAdds = {
  OLTP: {
    'Visible Borrowers': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
    'Todays Collection Board': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
  },
  OLAP: {
    'Borrowers with Outstanding Loans': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
    'Profit Contribution 30D': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
    'Reporting Borrowers': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
    'Todays Collection Board': ['Ref Referrer', 'Related Business Expenses By Ref Payee Borrower', 'Related Business Expenses By Ref Related Borrower'],
    'Reporting Loans': ['Related Business Expenses'],
    'Daily Analytics 7 Days': ['Business Expenses', 'Net Profit', 'Net Unsettled Profit EOD'],
    'Daily Analytics 30 Days': ['Business Expenses', 'Net Profit', 'Net Unsettled Profit EOD'],
    'Daily Analytics 90 Days': ['Business Expenses', 'Net Profit', 'Net Unsettled Profit EOD'],
    'Reporting Daily Analytics': ['Business Expenses', 'Net Profit', 'Net Unsettled Profit EOD'],
  },
};
for (const [app, slices] of Object.entries(sliceAdds)) for (const [slice, columns] of Object.entries(slices)) {
  for (const column of columns) {
    const existing = expected['Slice Columns'].filter((r) => r[0] === app && r[1] === slice);
    const source = existing[0]?.[2] || (slice === 'Reporting Loans' ? 'Loans' : slice.includes('Analytics') ? 'Daily Analytics' : 'Borrowers');
    const existingColumn = existing.find((r) => r[4] === column);
    const ordinal = existingColumn?.[3] ?? (Math.max(0, ...existing.map((r) => Number(r[3]) || 0)) + 1);
    appendOrUpdate('Slice Columns', (r) => r[0] === app && r[1] === slice && r[4] === column,
      [app, slice, source, ordinal, column], 42);
  }
}
for (const [app, slices] of Object.entries(sliceAdds)) for (const slice of Object.keys(slices)) {
  const indexes = expected['Slice Columns'].map((r, i) => ({ r, i })).filter(({ r }) => r[0] === app && r[1] === slice);
  indexes.forEach(({ r, i }, position) => {
    const ordinal = position + 1;
    if (Number(r[3]) !== ordinal) setRow('Slice Columns', i, [r[0], r[1], r[2], ordinal, r[4]]);
  });
}

const reconciledPattern = /Business Expenses|Ref Referrer|Related Referral Expenses|Total Referral Rebate Earned|Daily Analytics\.(Business Expenses|Net Profit|Net Unsettled Profit EOD)|Partners\.Net (Profit Earned|Available to Settle)|Partners_Detail|Settlements\.Amount|Analytics Data|Statistics\.(Total Business Expenses|Net Profit|Expenses MTD|Net Profit MTD|Net Unsettled Profit|Net Expected Loan Account Balance|Operating Income MTD|Income Statement Expenses MTD|Header - Income Statement MTD)/;
for (let i = 1; i < expected['Dev Differences'].length; i++) {
  const r = expected['Dev Differences'][i];
  if (!reconciledPattern.test(String(r[1]))) continue;
  let production = r[4];
  if (typeof production === 'string') production = production.replaceAll('database-3', 'database-2').replaceAll('DEV', 'production');
  if (r[3] !== production) setRow('Dev Differences', i, [r[0], r[1], r[2], production, r[4]]);
}

const reconciledObjects = [
  ['OLTP', 'R003 production reconciliation', 'Status', 'Production gaps recorded by R001 audit',
    'Released at OLTP 3.000121. Referrer metadata/views, Business Expenses validation/types/formatting/deck and retained color rules match the R001 definition.'],
  ['OLAP', 'R003 production reconciliation', 'Status', 'Production gaps recorded by R001 audit',
    'Released at OLAP 1.100101. Expense keys/Refs/types, referral VCs/relationships/slices, Daily Analytics, partner/settlement views and expense color rules match the R001 definition.'],
];
const diffSheet = wb.worksheets.getItem('Dev Differences');
for (const row of reconciledObjects) {
  let i = expected['Dev Differences'].findIndex((r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2]);
  if (i < 0) {
    i = expected['Dev Differences'].length;
    const template = diffSheet.getRangeByIndexes(i - 1, 0, 1, 5);
    const target = diffSheet.getRangeByIndexes(i, 0, 1, 5);
    target.copyFrom(template, 'all');
    target.format.wrapText = true;
    target.format.verticalAlignment = 'top';
    target.format.rowHeight = 120;
    expected['Dev Differences'].push(row);
    target.values = [row];
    changed.push({ sheet: 'Dev Differences', row: i + 1 });
  } else {
    if (JSON.stringify(expected['Dev Differences'][i]) !== JSON.stringify(row)) setRow('Dev Differences', i, row);
  }
}

let guideIndex = expected.Guide.findIndex((r) => r[0] === 'Development business expenses');
if (guideIndex >= 0) {
  setRow('Guide', guideIndex, [
    'Business expenses and referral rebates',
    'Production R003: Flyway V16; OLTP 3.000121; OLAP 1.100101. Development R002 remains separate.',
    'R001 AppSheet gaps reconciled in production through R003. Current-GUI runtime and saved-definition comparisons passed; no database or financial-record write.',
  ]);
}

wb.recalculate();
const errors = await wb.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 300 },
  summary: 'R003 dictionary formula error scan',
});
await fs.writeFile(`${out}/dictionary-error-scan.jsonl`, errors.ndjson);

const appPreview = await wb.render({ sheetName: 'App Settings', range: 'A1:E12', scale: 1, format: 'png' });
await fs.writeFile(`${out}/dictionary-app-settings.png`, new Uint8Array(await appPreview.arrayBuffer()));
const diffStart = expected['Dev Differences'].length - reconciledObjects.length + 1;
const diffPreview = await wb.render({ sheetName: 'Dev Differences', range: `A${diffStart}:E${expected['Dev Differences'].length}`, scale: 1, format: 'png' });
await fs.writeFile(`${out}/dictionary-r003-status.png`, new Uint8Array(await diffPreview.arrayBuffer()));

const staged = `${out}/dictionary-staged.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(staged);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm = (rows) => {
  const result = rows.map((r) => r.map((v) => v ?? ''));
  while (result.length && result.at(-1).every((v) => v === '')) result.pop();
  return result;
};
for (const sheet of reopened.worksheets.items) {
  if (JSON.stringify(norm(sheet.getUsedRange().values)) !== JSON.stringify(norm(expected[sheet.name]))) {
    throw new Error(`Unexpected dictionary difference: ${sheet.name}`);
  }
}
await fs.copyFile(staged, file);
await fs.unlink(staged);
await fs.unlink(`${staged}.inspect.ndjson`).catch(() => {});
const changedBySheet = Object.fromEntries([...new Set(changed.map((x) => x.sheet))].map((sheet) => [sheet, changed.filter((x) => x.sheet === sheet).length]));
await fs.writeFile(`${out}/dictionary-verification.json`, JSON.stringify({
  allSheetsRoundtrip: true,
  productionVersions: { OLTP: '3.000121', OLAP: '1.100101' },
  changedBySheet,
  productionInventory: {
    tables: expected['Prod Tables'].length - 1,
    columns: expected['Prod Columns'].length - 1,
    relationships: expected['Prod Relationships'].length - 1,
    slices: expected['Prod Slices'].length - 1,
    sliceColumns: expected['Slice Columns'].length - 1,
  },
}, null, 2));
console.log(JSON.stringify({ allSheetsRoundtrip: true, changedRows: changed.length }));
