import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const previewPath = "C:/GitHub/AppSheet-Loan-Project/outputs/projected-monthly-profit-analysis/dictionary-after.png";
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const image = await workbook.render({ sheetName: "Columns", range: "A1:H68", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await image.arrayBuffer()));
console.log(previewPath);
