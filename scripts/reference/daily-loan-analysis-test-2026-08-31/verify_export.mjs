import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, previewDir] = process.argv.slice(2);
if (!inputPath || !previewDir) {
  throw new Error("Usage: node verify_export.mjs <input.xlsx> <preview-dir>");
}

const expectedSheets = [
  "Manifest",
  "Statistics",
  "Daily Analytics 30D",
  "Borrowers",
  "Loans",
  "Charges",
  "Repayments 30D",
];

await fs.mkdir(previewDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 5,
  tableMaxCols: 12,
  tableMaxCellChars: 100,
});

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
});

const sheets = {};
for (const sheetName of expectedSheets) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const used = sheet.getUsedRange(true);
  const values = used?.values ?? [];
  const formulas = used?.formulas ?? [];
  const headers = values[0] ?? [];
  const rows = values.slice(1).filter((row) => row.some((value) => value !== null && value !== ""));
  const formulaCount = formulas.flat().filter((formula) => typeof formula === "string" && formula.startsWith("=")).length;
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const previewPath = path.join(previewDir, `${sheetName.replace(/[^A-Za-z0-9]+/g, "_")}.png`);
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
  sheets[sheetName] = {
    rowCount: rows.length,
    columnCount: headers.length,
    headers,
    firstRows: rows.slice(0, 5),
    formulaCount,
    values,
    formulas,
    previewPath,
  };
}

const payload = {
  overview: overview.ndjson,
  formulaErrors: formulaErrors.ndjson,
  sheets,
};
await fs.writeFile(path.join(previewDir, "verification.json"), JSON.stringify(payload, null, 2), "utf8");

console.log(JSON.stringify({
  formulaErrors: formulaErrors.ndjson,
  sheets: Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, {
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    headers: sheet.headers,
    firstRows: sheet.firstRows,
    formulaCount: sheet.formulaCount,
    previewPath: sheet.previewPath,
  }])),
}, null, 2));
