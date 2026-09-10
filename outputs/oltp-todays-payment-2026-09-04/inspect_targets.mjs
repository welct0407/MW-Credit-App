import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

for (const [label, searchTerm, options] of [
  ["target column names", "Todays Amount Collected|Payment Count|Days Outstanding|Amount Received|30D Principal Reduction Days", { useRegex: true, maxResults: 50 }],
  ["target tables", "^Charges$|^Repayments$", { useRegex: true, maxResults: 20 }],
  ["variance anchors", "Payment Count|Days Outstanding|30D Principal Reduction Days|Projected Monthly Profit Contribution", { useRegex: true, maxResults: 50 }],
]) {
  const result = await workbook.inspect({
    kind: "match",
    searchTerm,
    options,
    summary: label,
    maxChars: 20000,
  });
  console.log(`MATCH ${label}`);
  console.log(result.ndjson);
}

for (const [sheetId, range] of [
  ["Columns", "A100:H130"],
  ["Columns", "A245:H280"],
  ["App Variances", "A1:F35"],
  ["App Variances", "A145:F190"],
  ["App Variances", "A180:F210"],
  ["Columns", "A315:H330"],
]) {
  const result = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 60,
    tableMaxCols: 8,
    tableMaxCellChars: 500,
    maxChars: 30000,
  });
  console.log(`INSPECT ${sheetId}!${range}`);
  console.log(result.ndjson);
}
