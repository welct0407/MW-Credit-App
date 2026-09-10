import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx"));
for (const [sheetName, range] of [["Slices", "A1:H17"], ["Slice Columns", "A1:D40"], ["README", "A1:B26"]]) {
  const image = await workbook.render({ sheetName, range, scale: 1.3, format: "png" });
  await fs.writeFile(`before-${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await image.arrayBuffer()));
}
