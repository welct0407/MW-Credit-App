import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const file = 'Documents/AppSheet_Data_Dictionary.xlsx';
const outputDir = 'outputs/r002-production-20260916';
await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const sheet = workbook.worksheets.getItem('Dev Differences');
const rows = sheet.getUsedRange().values;
const additions = [
  ['PROD', 'R002 / deployed versions', 'Reconciliation', 'R003: OLTP 3.000121; OLAP 1.100101; Flyway V16', 'Deployment applied 2026-09-16: OLTP 3.000134; OLAP 1.100106; Flyway V18. Verification complete except deletion of the retired Borrower Name - Collection VC, pending required UI deletion confirmation.'],
  ['SQL PROD', 'Loans / R002 V17', 'Insert safeguard', 'Absent at V16', 'Applied from pinned commit f3a0d66. New gross principal must be positive and no greater than signed contributed capital minus outstanding principal; retained profit excluded. Loans, Repayments and Cash Pool Contributions share the advisory transaction lock.'],
  ['SQL PROD', 'Loan Form Context / R002 V18', 'Metric contract', 'Absent at V16', 'Applied as a one-row read-only view on database-2. Production readback: contributed capital 120000; outstanding principal 116394; available cashpool 3606; partner shares 0.60 / 0.40.'],
  ['OLTP PROD', 'Loan Form Context', 'Table / source', 'Absent', 'database-2; READ_ONLY; Row ID Text key; three Price/THB/2 amounts; two Percent/2 ratios; no form, menu or edit workflow.'],
  ['OLTP PROD', 'Loans.Principal Amount', 'Form safeguard', 'Original positive and whole-baht rules', 'Short original title plus bracketed available amount; R002 Valid_If and bilingual form-level error. Production new-form over-limit warning verified without saving a row.'],
  ['OLTP PROD', 'Borrowers.Borrower Reference TE', 'Definition', 'Absent', 'Read-only Ref to Borrowers by [Row ID], displayed as Borrower Name TE only in Todays Collection Board_Detail. Native Ref navigation opens the matching Borrowers_Detail.'],
  ['OLTP PROD', 'Collection', 'Navigation / formatting', 'Borrower Name - Collection text field', 'Original row-to-Collection-detail behavior and Receive All Charges action bar preserved. Borrower Name TE is the header; Borrower Reference TE is the clickable detail field; four status rules target both fields. Retired duplicate VC has no active dependency and awaits confirmed deletion.'],
  ['OLTP PROD', 'Charges / Repayments borrower links', 'Navigation', 'No dedicated TE link', 'Open Borrower from Charge and Open Borrower from Repayment are Inline on Borrower Name TE and target the production Borrowers_Detail via the stable Row ID reference.'],
  ['OLAP PROD', 'Loans / Charges / Repayments borrower links', 'Navigation', 'Generated loan Ref only', 'Loans generated Ref is Inline on Borrower Name TE. Charge and repayment navigation actions are Inline on Borrower Name TE. Charges_Detail uses Borrower Name TE; Repayments_Detail appends it.'],
];

for (const row of additions) {
  let index = rows.findIndex((r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2]);
  if (index < 0) {
    index = rows.length;
    const target = sheet.getRangeByIndexes(index, 0, 1, 5);
    target.copyFrom(sheet.getRangeByIndexes(index - 1, 0, 1, 5), 'all');
    rows.push(row);
  }
  sheet.getRangeByIndexes(index, 0, 1, 5).values = [row];
  sheet.getRangeByIndexes(index, 0, 1, 5).format.wrapText = true;
  sheet.getRangeByIndexes(index, 0, 1, 5).format.verticalAlignment = 'top';
}

workbook.recalculate();
const errorScan = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 },
  summary: 'R002 production dictionary formula-error scan',
});
await fs.writeFile(`${outputDir}/dictionary-error-scan.jsonl`, errorScan.ndjson);

const firstRow = rows.findIndex((r) => r[0] === 'PROD' && r[1] === 'R002 / deployed versions') + 1;
const preview = await workbook.render({
  sheetName: 'Dev Differences',
  range: `A${firstRow}:E${firstRow + additions.length - 1}`,
  scale: 1,
  format: 'png',
});
await fs.writeFile(`${outputDir}/dictionary-production.png`, new Uint8Array(await preview.arrayBuffer()));

const staged = `${outputDir}/dictionary-staged.xlsx`;
await (await SpreadsheetFile.exportXlsx(workbook)).save(staged);
const verification = await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const verifySheet = verification.worksheets.getItem('Dev Differences');
for (const row of additions) {
  if (!verifySheet.getUsedRange().values.some((r) => r[0] === row[0] && r[1] === row[1] && r[2] === row[2] && r[4] === row[4])) {
    throw new Error(`Missing production dictionary row: ${row[0]} / ${row[1]}`);
  }
}
await fs.copyFile(staged, file);
await fs.unlink(staged);
await fs.writeFile(`${outputDir}/dictionary-verification.json`, JSON.stringify({
  workbookRoundTrip: true,
  changedSheet: 'Dev Differences',
  productionRows: additions.length,
  errorScan: errorScan.ndjson.trim() || 'no matches',
}, null, 2));
console.log('R002 production dictionary updated and verified');
