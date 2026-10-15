import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const beforePath = "C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04/AppSheet_Data_Dictionary.before.xlsx";
const afterPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputDir = "C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04/previews-after";
const before = await SpreadsheetFile.importXlsx(await FileBlob.load(beforePath));
const after = await SpreadsheetFile.importXlsx(await FileBlob.load(afterPath));

const sheetNames = ["README", "Tables", "Columns", "Relationships", "Slices", "Slice Columns", "App Variances", "Change Log"];
const changedSheets = new Set(["README", "Tables", "Columns", "App Variances"]);
for (const sheetName of sheetNames) {
  const beforeSheet = before.worksheets.getItem(sheetName);
  const afterSheet = after.worksheets.getItem(sheetName);
  const beforeUsed = beforeSheet.getUsedRange();
  const afterUsed = afterSheet.getUsedRange();
  const beforeValues = JSON.stringify(beforeUsed.values);
  const afterValues = JSON.stringify(afterUsed.values);
  const beforeFormulas = JSON.stringify(beforeUsed.formulas);
  const afterFormulas = JSON.stringify(afterUsed.formulas);
  console.log(JSON.stringify({
    sheetName,
    beforeAddress: beforeUsed.address,
    afterAddress: afterUsed.address,
    valuesChanged: beforeValues !== afterValues,
    formulasChanged: beforeFormulas !== afterFormulas,
    expectedToChange: changedSheets.has(sheetName),
  }));
}

for (const [sheetId, range] of [
  ["README", "A1:B24"],
  ["Tables", "A4:G15"],
  ["Columns", "A34:H42"],
  ["Columns", "A123:H133"],
  ["Columns", "A258:H270"],
  ["App Variances", "A190:F200"],
]) {
  const result = await after.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 40,
    tableMaxCols: 10,
    tableMaxCellChars: 700,
    maxChars: 30000,
  });
  console.log(`INSPECT ${sheetId}!${range}`);
  console.log(result.ndjson);
}

const errors = await after.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 10000,
});
console.log("FORMULA ERROR SCAN");
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, range, fileName] of [
  ["README", "A1:B24", "README.png"],
  ["Tables", "A1:G15", "Tables.png"],
  ["Columns", "A34:H42", "Columns-Borrowers.png"],
  ["Columns", "A123:H133", "Columns-Charges.png"],
  ["Columns", "A258:H270", "Columns-Repayments.png"],
  ["App Variances", "A186:F200", "App-Variances.png"],
]) {
  const rendered = await after.render({ sheetName, range, scale: 1.4, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
}

console.log(`Rendered previews to ${outputDir}`);
