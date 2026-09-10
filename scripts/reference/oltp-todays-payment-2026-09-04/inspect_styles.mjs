import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx"));
for (const [sheetId, range] of [
  ["README", "A5:B6"],
  ["README", "A24:B24"],
  ["Tables", "A8:G8"],
  ["Tables", "A13:G13"],
  ["App Variances", "A195:F198"],
]) {
  const result = await workbook.inspect({ kind: "computedStyle", sheetId, range, maxChars: 12000 });
  console.log(`STYLE ${sheetId}!${range}`);
  console.log(result.ndjson);
}
