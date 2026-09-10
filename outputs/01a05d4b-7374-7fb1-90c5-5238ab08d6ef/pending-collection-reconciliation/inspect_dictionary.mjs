import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const previewDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/pending-collection-reconciliation/before";
await fs.mkdir(previewDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 5,
  tableMaxCols: 10,
  tableMaxCellChars: 180,
});
console.log("=== WORKBOOK ===");
console.log(overview.ndjson);

for (const term of ["Ref Loans", "Pending Payment Amount", "v2.200099", "Reconciliation status"]) {
  const matches = await workbook.inspect({
    kind: "match",
    searchTerm: term,
    options: { useRegex: false, maxResults: 100 },
    maxChars: 14000,
    tableMaxCellChars: 1800,
    summary: `matches for ${term}`,
  });
  console.log(`=== MATCH ${term} ===`);
  console.log(matches.ndjson);
}

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
const names = sheets.ndjson.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line).name);
for (const name of names) {
  const rendered = await workbook.render({ sheetName: name, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(previewDir, `${name.replace(/[\\/:*?\"<>|]/g, "_")}.png`), new Uint8Array(await rendered.arrayBuffer()));
}

for (const target of [
  { sheetId: "README", range: "A1:B24" },
  { sheetId: "Columns", range: "A100:H106" },
  { sheetId: "Columns", range: "A278:H282" },
  { sheetId: "Relationships", range: "A1:E12" },
  { sheetId: "App Variances", range: "A174:F183" },
]) {
  const region = await workbook.inspect({
    kind: "region",
    ...target,
    maxChars: 20000,
    tableMaxRows: 20,
    tableMaxCols: 10,
    tableMaxCellChars: 3000,
  });
  console.log(`=== REGION ${target.sheetId}!${target.range} ===`);
  console.log(region.ndjson);
}
