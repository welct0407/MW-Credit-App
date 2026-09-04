import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/GitHub/AppSheet-Loan-Project/outputs/01a066b1-e885-7d52-98f5-34812d9c7c18/daily-collection-messages-2026-09-03/Daily_Collection_Message_Review_2026-09-03.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const table = await workbook.inspect({
  kind: "table",
  sheetId: "Draft Messages",
  range: "A1:F9",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 8,
  maxChars: 10000,
});
console.log(table.ndjson);
const image = await workbook.render({ sheetName: "Draft Messages", range: "A1:F9", scale: 1.2, format: "png" });
await fs.writeFile("tone-before.png", new Uint8Array(await image.arrayBuffer()));
