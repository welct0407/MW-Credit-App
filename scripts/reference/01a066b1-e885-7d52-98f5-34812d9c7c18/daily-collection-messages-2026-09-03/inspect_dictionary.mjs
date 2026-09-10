import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
for (const name of ["README", "Slices", "Slice Columns", "Change Log"]) {
  const sheet = workbook.worksheets.getItem(name);
  const used = sheet.getUsedRange();
  console.log(`--- ${name} ${used?.address ?? "unknown"}`);
  const result = await workbook.inspect({
    kind: "table",
    sheetId: name,
    range: used?.address ?? "A1:Z30",
    include: "values,formulas",
    tableMaxRows: name === "Slice Columns" ? 220 : 80,
    tableMaxCols: 12,
    tableMaxCellChars: 240,
    maxChars: name === "Slice Columns" ? 30000 : 12000,
  });
  console.log(result.ndjson);
}
