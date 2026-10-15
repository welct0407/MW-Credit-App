import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputDir = "C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04/previews-before";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

const requests = [
  ["README", "A1:B24"],
  ["Tables", "A1:G15"],
  ["Columns", "A1:H20"],
  ["Columns", "A25:H55"],
  ["Columns", "A110:H160"],
  ["Columns", "A260:H330"],
  ["App Variances", "A1:F190"],
];

for (const [sheetId, range] of requests) {
  const result = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 220,
    tableMaxCols: 10,
    tableMaxCellChars: 500,
    maxChars: 120000,
  });
  console.log(`INSPECT ${sheetId}!${range}`);
  console.log(result.ndjson);
}

await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, range, fileName] of [
  ["README", "A1:B24", "README.png"],
  ["Tables", "A1:G15", "Tables.png"],
  ["Columns", "A25:H55", "Columns-Borrowers.png"],
  ["Columns", "A110:H160", "Columns-Charges.png"],
  ["Columns", "A260:H330", "Columns-Repayments.png"],
  ["App Variances", "A1:F190", "App-Variances.png"],
]) {
  const rendered = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
}

console.log(`Rendered previews to ${outputDir}`);
