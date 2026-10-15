import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputPath = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/borrower-principal-coverage/AppSheet_Data_Dictionary.xlsx";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

function valuesOf(sheetName) {
  return workbook.worksheets.getItem(sheetName).getUsedRange().values;
}

function writeValues(sheetName, values) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const cols = values.reduce((max, row) => Math.max(max, row.length), 0);
  const endCol = String.fromCharCode(64 + cols);
  sheet.getRange(`A1:${endCol}${values.length}`).values = values.map(row => [
    ...row,
    ...Array(cols - row.length).fill(null),
  ]);
}

function appendTableRow(sheetName, width) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const table = sheet.tables.items[0];
  if (!table) throw new Error(`No table found on ${sheetName}`);
  table.rows.add(null, [Array(width).fill(null)]);
}

const readme = workbook.worksheets.getItem("README");
readme.getRange("B5").values = [[
  "Reconciled with production OLTP v2.200109 and OLAP v1.000164 on 2026-09-01. OLTP Borrowers now includes the OLTP-only Active Profit After Principal Coverage VC, defined as Active Loan Interest Earned minus Total Outstanding Principal and shown only when Has Active Loan is true. Visible Borrowers includes all 32 OLTP Borrowers columns. The detail view places the metric between Active Loan Interest Earned and Return on Active Principal; positive values are green and negative values are orange. The prior pending-collection reconciliation remains in force, including the still-broad Statistics[Pending Payment Amount] formula."
]];
readme.getRange("A5:B5").format.rowHeight = 112;
readme.getRange("B6").values = [[
  "OLTP v2.200109 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357\nOLAP v1.000164 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb"
]];
readme.getRange("B9").values = [[305]];
readme.getRange("A24").values = [[
  "Shared VC baseline: 82 VCs are present in both apps and the five daily-installment formula variances are resolved. Borrowers[Active Profit After Principal Coverage] and Borrowers[Hidden Flag] are OLTP-only. Loans[Daily Installment Base Principal] and the four Calendar schedule VCs are OLAP-only reporting helpers. Charges[Ref Loans] is OLTP-required; the OLAP Required flag was not changed or re-verified."
]];

const tables = workbook.worksheets.getItem("Tables");
tables.getRange("E5").values = [[25]];
tables.getRange("G5").values = [[
  "Borrower master records and indicators; OLTP-only Hidden Flag and active principal-coverage VC."
]];

const columns = workbook.worksheets.getItem("Columns");
columns.getRange("A2").values = [[
  "Reconciled union of OLTP and OLAP physical and virtual columns. Production OLTP Borrowers gained Active Profit After Principal Coverage on 2026-09-01; prior pending-collection, daily-installment, and borrower-visibility reconciliation remains in force."
]];
let columnValues = valuesOf("Columns");
const newColumnName = "Active Profit After Principal Coverage";
let columnIndex = columnValues.findIndex(row => row[0] === "Borrowers" && row[2] === newColumnName);
const newColumnRow = [
  "Borrowers",
  60,
  newColumnName,
  "VC / Price",
  "OLTP only",
  "Show if: [Has Active Loan]; 0 decimals",
  "Active-loan interest earned after covering current outstanding principal; a hypothetical immediate-default coverage amount, not accounting profit.",
  "[Active Loan Interest Earned] - [Total Outstanding Principal]",
];
if (columnIndex < 0) {
  columnIndex = columnValues.reduce((last, row, index) => row[0] === "Borrowers" ? index + 1 : last, 0);
  columnValues.splice(columnIndex, 0, newColumnRow);
  appendTableRow("Columns", 8);
} else {
  columnValues[columnIndex] = newColumnRow;
}
writeValues("Columns", columnValues);

const slices = workbook.worksheets.getItem("Slices");
slices.getRange("A2").values = [[
  "Live slice filters, update permissions, purposes, and included-column counts; Visible Borrowers column membership re-verified on 2026-09-01."
]];
const sliceValues = valuesOf("Slices");
const visibleSliceRow = sliceValues.findIndex(row => row[0] === "OLTP" && row[1] === "Visible Borrowers");
if (visibleSliceRow < 0) throw new Error("Visible Borrowers slice row not found");
sliceValues[visibleSliceRow][5] = 32;
sliceValues[visibleSliceRow][6] = "Editable borrower-list slice excluding hidden rows; includes the principal-coverage metric.";
writeValues("Slices", sliceValues);

const sliceColumns = workbook.worksheets.getItem("Slice Columns");
sliceColumns.getRange("A2").values = [[
  "One row per live included slice column, preserving slice order; Visible Borrowers membership re-verified on 2026-09-01."
]];
let sliceColumnValues = valuesOf("Slice Columns");
let sliceColumnIndex = sliceColumnValues.findIndex(row => row[0] === "OLTP" && row[1] === "Visible Borrowers" && row[3] === newColumnName);
const newSliceColumnRow = ["OLTP", "Visible Borrowers", 32, newColumnName];
if (sliceColumnIndex < 0) {
  sliceColumnIndex = sliceColumnValues.reduce((last, row, index) => row[0] === "OLTP" && row[1] === "Visible Borrowers" ? index + 1 : last, 0);
  sliceColumnValues.splice(sliceColumnIndex, 0, newSliceColumnRow);
  appendTableRow("Slice Columns", 4);
} else {
  sliceColumnValues[sliceColumnIndex] = newSliceColumnRow;
}
writeValues("Slice Columns", sliceColumnValues);

const variances = workbook.worksheets.getItem("App Variances");
variances.getRange("A2").values = [[
  "Tables and columns present in only one live application definition; reconciled on 2026-09-01 for the OLTP borrower principal-coverage VC and prior OLTP/OLAP variances."
]];
let varianceValues = valuesOf("App Variances");
let varianceIndex = varianceValues.findIndex(row => row[0] === "Column" && row[1] === "Borrowers" && row[2] === newColumnName);
const newVarianceRow = [
  "Column",
  "Borrowers",
  newColumnName,
  "Yes",
  "No",
  "OLTP-only Price VC: active interest earned minus outstanding principal; used in borrower detail.",
];
if (varianceIndex < 0) {
  varianceIndex = varianceValues.reduce((last, row, index) => row[0] === "Column" && row[1] === "Borrowers" ? index + 1 : last, 0);
  varianceValues.splice(varianceIndex, 0, newVarianceRow);
  appendTableRow("App Variances", 6);
} else {
  varianceValues[varianceIndex] = newVarianceRow;
}
writeValues("App Variances", varianceValues);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.copyFile(outputPath, inputPath);

console.log(JSON.stringify({
  inputPath,
  outputPath,
  updated: [
    "README baseline/count/variance note",
    "Tables Borrowers VC count/purpose",
    "Columns new Borrowers VC",
    "Slices Visible Borrowers count/purpose",
    "Slice Columns new membership row",
    "App Variances new OLTP-only VC row",
  ],
}));
