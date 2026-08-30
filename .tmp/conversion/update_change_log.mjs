import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const PREVIEW_ONLY = true;
const projectRoot = path.resolve(process.cwd(), "..", "..");
const workbookPath = path.join(projectRoot, "Documents", "AppSheet_Data_Dictionary.xlsx");
const updatedPath = path.join(projectRoot, ".tmp", "conversion", "AppSheet_Data_Dictionary.updated.xlsx");
const previewPath = path.join(projectRoot, ".tmp", "conversion", PREVIEW_ONLY ? "Change_Log.before.png" : "Change_Log.after.png");

const source = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(source);
const sheet = workbook.worksheets.getItem("Change Log");
const table = sheet.tables.items[0];

const changes = [];

if (!PREVIEW_ONLY) {
  const existingRows = table.getDataRows().values;
  const additions = changes.filter((candidate) => !existingRows.some((row) =>
    String(row[3] ?? "") === candidate.objectName &&
    String(row[6] ?? "").includes(candidate.sourceFile)
  ));

  if (additions.length) {
    table.rows.add(null, additions.map((item) => [
      new Date(`${item.date}T00:00:00+08:00`),
      item.artifact,
      item.objectType,
      item.objectName,
      item.changeType,
      item.summary,
      `${item.sourceFile} | ${item.sourceBaseline}`,
      item.reconciled,
      "Codex",
    ]));
  }

  const used = sheet.getUsedRange(true);
  const lastRow = used.values.length;
  sheet.getRange(`A5:A${Math.max(lastRow, 100)}`).format.numberFormat = "yyyy-mm-dd";
  sheet.getRange(`B5:I${lastRow}`).format.verticalAlignment = "top";
  sheet.getRange(`B5:I${lastRow}`).format.font = { color: "#172B3A", size: 9 };
  sheet.getRange(`B5:G${lastRow}`).format.wrapText = true;
  sheet.getRange(`A5:I${lastRow}`).format.autofitRows();
}

const inspect = await workbook.inspect({
  kind: "table",
  range: "Change Log!A4:I20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 9,
  maxChars: 9000,
});
console.log(inspect.ndjson);

const preview = await workbook.render({
  sheetName: "Change Log",
  range: "A1:I16",
  scale: 1.25,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

if (!PREVIEW_ONLY) {
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
  });
  console.log(errors.ndjson);

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(updatedPath);
  await fs.copyFile(updatedPath, workbookPath);
  console.log(`appended=${changes.length}`);
  console.log(workbookPath);
}
