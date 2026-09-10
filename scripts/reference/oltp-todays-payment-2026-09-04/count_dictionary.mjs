import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

for (const sheetName of ["Columns", "App Variances"]) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const used = sheet.getUsedRange();
  const values = used.values;
  const nonblankA = values.filter((row, index) => index >= 4 && row[0] !== null && row[0] !== "").length;
  console.log(JSON.stringify({ sheetName, usedAddress: used.address, rowCount: values.length, nonblankA }));
}
