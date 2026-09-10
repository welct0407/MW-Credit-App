import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const backupPath = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/borrower-principal-coverage/AppSheet_Data_Dictionary.xlsx";
const input = await FileBlob.load(backupPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const readme = workbook.worksheets.getItem("README");
readme.getRange("B5").values = [[
  "Reconciled with production OLTP v2.200109 and the affected OLAP Borrowers and Analytics chart objects through v1.000171 on 2026-09-02. OLAP Borrowers now includes Projected Monthly Profit Contribution, a borrower-grain mirror of the Projected Monthly Profit KPI, and the Analytics dashboard contains the corresponding fourth pie chart immediately after Daily Interest Contribution. The current OLAP schema also loads the pre-existing Hidden Flag source field; no reporting metric or chart filters on that flag. Earlier OLTP principal-coverage, pending-collection, daily-installment, and borrower-visibility controls remain as documented."
]];
readme.getRange("B6").values = [[
  "OLTP v2.200109 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357\nOLAP v1.000171 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb"
]];
readme.getRange("B7").values = [["2026-09-02 (Asia/Singapore)"]];
readme.getRange("B9").values = [[306]];
readme.getRange("A24").values = [[
  "Shared VC baseline: 82 VCs are present in both apps and the five daily-installment formula variances remain resolved. Borrowers[Active Profit After Principal Coverage] is OLTP-only. Borrowers[Projected Monthly Profit Contribution] is OLAP-only. Borrowers[Hidden Flag] is now loaded in both apps, but only the OLTP Visible Borrowers slice uses it as a filter. Loans[Daily Installment Base Principal] and the four Calendar schedule VCs remain OLAP-only reporting helpers. Charges[Ref Loans] is OLTP-required; the OLAP Required flag was not changed or re-verified."
]];

const tables = workbook.worksheets.getItem("Tables");
tables.getRange("F5").values = [[51]];
tables.getRange("G5").values = [[
  "Borrower master records and indicators; includes the OLAP-only projected-monthly-profit contribution VC and the OLTP-only active principal-coverage VC. Hidden Flag is loaded in both apps but filters only the OLTP primary borrower list."
]];

const columns = workbook.worksheets.getItem("Columns");
columns.getRange("A2").values = [[
  "Reconciled union of OLTP and OLAP physical and virtual columns. OLAP Borrowers gained Projected Monthly Profit Contribution on 2026-09-02; the current OLAP schema also loads the pre-existing Hidden Flag source field. Earlier principal-coverage, pending-collection, daily-installment, and borrower-visibility reconciliation remains in force."
]];
columns.getRange("E11:H11").values = [[
  "OLTP + OLAP",
  "OLTP: Show and editable; initial FALSE; searchable; OLAP: loaded, shown, editable, and searchable",
  "View-only visibility control for the OLTP primary Borrowers list. OLAP loads the field but no reporting metric, slice, or chart filters on it.",
  "Stored source column; initial value: FALSE; OLTP display name: \"ซ่อนจากรายชื่อผู้กู้ / Hide from Borrowers List\"; OLAP display name not configured"
]];
for (let row = 309; row >= 65; row -= 1) {
  columns.getRange(`A${row}:H${row}`).copyTo(columns.getRange(`A${row + 1}:H${row + 1}`), "all");
}
columns.getRange("A64:H64").copyTo(columns.getRange("A65:H65"), "all");
columns.getRange("A65:H65").values = [[
  "Borrowers",
  61,
  "Projected Monthly Profit Contribution",
  "VC / Price",
  "OLAP only",
  "Show; 0 decimals; bilingual display name",
  "Borrower-grain contribution that mirrors Statistics[Projected Monthly Profit] for pie-chart attribution across the full Borrowers population.",
  "SUM(SELECT(Repayments[Interest Paid], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], MONTH([Payment Date]) = MONTH(TODAY()), YEAR([Payment Date]) = YEAR(TODAY())))) + SUM(SELECT(Charges[Interest Remaining], [Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID])) + SUM(SELECT(Loans[Expected Interest This Month], [Ref Borrowers] = [_THISROW].[Row ID]))"
]];

const variances = workbook.worksheets.getItem("App Variances");
for (let row = 41; row <= 182; row += 1) {
  variances.getRange(`A${row}:F${row}`).copyTo(variances.getRange(`A${row - 1}:F${row - 1}`), "all");
}
variances.getRange("A182:F182").values = [[
  "Column",
  "Borrowers",
  "Projected Monthly Profit Contribution",
  "No",
  "Yes",
  "OLAP-only borrower-grain allocation of Projected Monthly Profit used by the fourth Analytics pie chart."
]];

const changeLog = workbook.worksheets.getItem("Change Log");
changeLog.getRange("A5:I5").copyTo(changeLog.getRange("A6:I6"), "all");
changeLog.getRange("A6:I6").values = [[
  "2026-09-02",
  "Excel data dictionary",
  "OLAP virtual column",
  "Borrowers[Projected Monthly Profit Contribution]",
  "Add and reconcile",
  "Documented the borrower-level Projected Monthly Profit contribution VC, the fourth Analytics pie chart dependency, and the current OLAP loading of Hidden Flag.",
  "Loan Business Insights v1.000171; rollback v1.000167",
  "Yes — affected objects",
  "Codex"
]];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(sourcePath);
console.log(sourcePath);
