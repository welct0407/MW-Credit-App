import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "D:/GitHub/AppSheet Project/outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.1.xlsx";
const outputPath = "D:/GitHub/AppSheet Project/outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.2_raw.xlsx";

const periodStart = "(TODAY() - 29)";
const inPeriod = (column) => `AND([${column}] >= ${periodStart}, [${column}] <= TODAY())`;

const activityLoanIds = `UNIQUE(SELECT(Reporting Loans[Row ID], OR(${inPeriod("Loan Date")}, ${inPeriod("Close Date")})) + SELECT(Reporting Charges[Ref Loans], OR(${inPeriod("Charge Date")}, ${inPeriod("Payment Date")})) + SELECT(Reporting Repayments[Ref Loans], ${inPeriod("Payment Date")}))`;

const chargePopulation = `SELECT(Reporting Charges[Row ID], OR(${inPeriod("Charge Date")}, ${inPeriod("Payment Date")}, IN([Ref Loans], ${activityLoanIds})))`;
const repaymentPopulation = `SELECT(Reporting Repayments[Row ID], OR(${inPeriod("Payment Date")}, IN([Ref Loans], ${activityLoanIds})))`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const manifest = workbook.worksheets.getItem("Manifest");
const borrowers = workbook.worksheets.getItem("Borrowers");
const loans = workbook.worksheets.getItem("Loans");
const charges = workbook.worksheets.getItem("Charges");
const repayments = workbook.worksheets.getItem("Repayments 30D");

manifest.getRange("G2:K2").values = [[
  "1.1",
  "<<COUNT(Reporting Borrowers[Row ID])>>",
  "<<COUNT(Reporting Loans[Row ID])>>",
  `<<COUNT(${chargePopulation})>>`,
  `<<COUNT(${repaymentPopulation})>><<End>>`,
]];

borrowers.getRange("A2").values = [["<<Start: Reporting Borrowers[Row ID]>><<[Row ID]>>"]];
loans.getRange("A2").values = [["<<Start: Reporting Loans[Row ID]>><<[Row ID]>>"]];
charges.getRange("A2").values = [[`<<Start: ${chargePopulation}>><<[Row ID]>>`]];
repayments.getRange("A2").values = [[`<<Start: ${repaymentPopulation}>><<[Row ID]>>`]];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const inspect = await workbook.inspect({
  kind: "region",
  sheetId: "Manifest",
  range: "G1:K2",
  maxChars: 12000,
});
console.log(inspect.ndjson);
