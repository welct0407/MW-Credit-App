import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const previewDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/borrower-principal-coverage/after";
await fs.mkdir(previewDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 5,
  tableMaxCols: 10,
  tableMaxCellChars: 220,
});
console.log("=== WORKBOOK ===");
console.log(overview.ndjson);

for (const term of [
  "Active Profit After Principal Coverage",
  "v2.200109",
  "Visible Borrowers",
]) {
  const matches = await workbook.inspect({
    kind: "match",
    searchTerm: term,
    options: { useRegex: false, maxResults: 100 },
    maxChars: 18000,
    tableMaxCellChars: 2200,
    summary: `matches for ${term}`,
  });
  console.log(`=== MATCH ${term} ===`);
  console.log(matches.ndjson);
}

for (const target of [
  { sheetId: "README", range: "A1:B24" },
  { sheetId: "Tables", range: "A1:G8" },
  { sheetId: "Columns", range: "A55:H68" },
  { sheetId: "Slices", range: "A1:H8" },
  { sheetId: "Slice Columns", range: "A35:D50" },
  { sheetId: "App Variances", range: "A32:F45" },
]) {
  const region = await workbook.inspect({
    kind: "region",
    ...target,
    maxChars: 24000,
    tableMaxRows: 30,
    tableMaxCols: 10,
    tableMaxCellChars: 3000,
  });
  console.log(`=== REGION ${target.sheetId}!${target.range} ===`);
  console.log(region.ndjson);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  maxChars: 6000,
  summary: "final formula error scan",
});
console.log("=== FORMULA ERRORS ===");
console.log(errors.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
const names = sheets.ndjson.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line).name);
for (const name of names) {
  const rendered = await workbook.render({ sheetName: name, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(previewDir, `${name.replace(/[\\/:*?\"<>|]/g, "_")}.png`), new Uint8Array(await rendered.arrayBuffer()));
}

console.log(JSON.stringify({ verified: workbookPath, renderedSheets: names.length, previewDir }));
