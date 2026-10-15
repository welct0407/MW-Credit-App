import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

for (const [sheetId, range] of [
  ["App Variances", "A35:F45"],
  ["Columns", "A58:H68"],
]) {
  const result = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 10,
    maxChars: 10000,
  });
  console.log(`${sheetId}!${range}`);
  console.log(result.ndjson);
}

