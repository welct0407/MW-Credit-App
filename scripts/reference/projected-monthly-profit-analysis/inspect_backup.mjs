import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/borrower-principal-coverage/AppSheet_Data_Dictionary.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
for (const [sheetId, range] of [["README", "A4:B10"], ["Columns", "A58:H68"], ["Change Log", "A4:I6"]]) {
  const result = await workbook.inspect({ kind: "table", sheetId, range, include: "values,formulas", tableMaxRows: 20, tableMaxCols: 12, maxChars: 16000 });
  console.log(`${sheetId}!${range}`);
  console.log(result.ndjson);
}

