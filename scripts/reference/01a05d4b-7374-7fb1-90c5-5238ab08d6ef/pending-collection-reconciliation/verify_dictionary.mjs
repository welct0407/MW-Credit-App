import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const previewDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/pending-collection-reconciliation/after";
await fs.mkdir(previewDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 16000,
  tableMaxRows: 5,
  tableMaxCols: 10,
  tableMaxCellChars: 500,
});
console.log("=== WORKBOOK ===");
console.log(overview.ndjson);

for (const target of [
  { sheetId: "README", range: "A4:B11" },
  { sheetId: "README", range: "A24:B24" },
  { sheetId: "Columns", range: "A1:H4" },
  { sheetId: "Columns", range: "A101:H105" },
  { sheetId: "Columns", range: "A279:H281" },
  { sheetId: "Relationships", range: "A1:E8" },
]) {
  const region = await workbook.inspect({
    kind: "region",
    ...target,
    maxChars: 24000,
    tableMaxRows: 20,
    tableMaxCols: 10,
    tableMaxCellChars: 4000,
  });
  console.log(`=== REGION ${target.sheetId}!${target.range} ===`);
  console.log(region.ndjson);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?",
  options: { useRegex: true, maxResults: 200 },
  maxChars: 12000,
  tableMaxCellChars: 2000,
  summary: "common spreadsheet formula errors",
});
console.log("=== FORMULA ERROR SCAN ===");
console.log(errors.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
const names = sheets.ndjson.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line).name);
for (const name of names) {
  const rendered = await workbook.render({ sheetName: name, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(previewDir, `${name.replace(/[\\/:*?\"<>|]/g, "_")}.png`), new Uint8Array(await rendered.arrayBuffer()));
}
console.log(JSON.stringify({ renderedSheets: names, previewDir }));
