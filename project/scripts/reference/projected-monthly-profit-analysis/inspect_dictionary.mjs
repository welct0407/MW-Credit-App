import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 6000,
});
console.log("SHEETS");
console.log(sheets.ndjson);

for (const searchTerm of [
  "Projected Monthly Profit",
  "Expected Interest This Month",
  "Realized Profit MTD",
  "Today's Outstanding Interest",
  "Forecast Remaining Interest",
  "Active Daily Interest",
  "Hidden Flag",
  "Active Profit After Principal Coverage",
]) {
  const result = await workbook.inspect({
    kind: "match",
    searchTerm,
    options: { useRegex: false, maxResults: 100 },
    maxChars: 16000,
  });
  console.log(`MATCH: ${searchTerm}`);
  console.log(result.ndjson);
}

for (const range of ["A1:H65", "A190:H210", "A275:H290"]) {
  const region = await workbook.inspect({
    kind: "table",
    sheetId: "Columns",
    range,
    include: "values,formulas",
    tableMaxRows: 80,
    tableMaxCols: 10,
    maxChars: 30000,
  });
  console.log(`REGION: Columns!${range}`);
  console.log(region.ndjson);
}

for (const [sheetId, range] of [
  ["README", "A1:B24"],
  ["Tables", "A1:G15"],
  ["App Variances", "A165:F182"],
  ["App Variances", "A35:F45"],
  ["Change Log", "A1:I8"],
]) {
  const region = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 40,
    tableMaxCols: 12,
    maxChars: 30000,
  });
  console.log(`REGION: ${sheetId}!${range}`);
  console.log(region.ndjson);
}
