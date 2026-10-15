import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a066b1-e885-7d52-98f5-34812d9c7c18/daily-collection-messages-2026-09-03";
const workbookPath = `${outputDir}/Daily_Collection_Message_Review_2026-09-03.xlsx`;
const backupPath = `${outputDir}/Daily_Collection_Message_Review_2026-09-03.before-structure-standardization.xlsx`;

try {
  await fs.access(backupPath);
} catch {
  await fs.copyFile(workbookPath, backupPath);
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const drafts = workbook.worksheets.getItem("Draft Messages");

const note = "Standardized message structure. Amounts unchanged; approved payment-detail placeholders used. No message has been sent.";
const paymentBlock = "⚠️ แจ้งเตือนการส่งยอด ⚠️\n💳 [ธนาคารที่ใช้รับชำระ]\n[เลขบัญชีที่อนุมัติ]\n[ชื่อบัญชีที่อนุมัติ]";
const messages = [
  `พี่วาคะ วันนี้มียอดที่ต้องส่ง 100 บาท รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ 💵\n${paymentBlock}`,
  `พี่เนยคะ วันนี้มียอดที่ต้องส่ง 300 บาท รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ 💵\n${paymentBlock}`,
  `พี่ปุยฝ้ายคะ วันนี้มียอดที่ต้องส่ง 2,900 บาท รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ 💵\n📌 และมียอดค้างเดิมอีก 3,000 บาทนะคะ\n${paymentBlock}`,
  `พี่เบลคะ ยอดของวันนี้ 300 บาทชำระแล้วนะคะ ✅\n📌 และยังมียอดค้างเดิม 4,220 บาท รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ\n${paymentBlock}`,
  `พี่หนึ่งคะ วันนี้มียอดที่ต้องส่ง 400 บาท รบกวนส่งภายใน 16.00 น. เพื่อไม่ให้มีค่าปรับล่าช้านะคะ 💵\n📌 และมียอดค้างเดิมอีก 400 บาทนะคะ\n${paymentBlock}`,
];

drafts.getRange("A2").values = [[note]];
drafts.getRange("E5:E9").values = messages.map((message) => [message]);
drafts.getRange("A5:F6").format.rowHeightPx = 140;
drafts.getRange("A7:F9").format.rowHeightPx = 164;

const messageCheck = await workbook.inspect({
  kind: "table",
  sheetId: "Draft Messages",
  range: "A1:F9",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 8,
  maxChars: 16000,
});
console.log("MESSAGES", messageCheck.ndjson);

const totalCheck = await workbook.inspect({
  kind: "table",
  sheetId: "Collection Summary",
  range: "A3:J9",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 12,
  maxChars: 8000,
});
console.log("TOTALS", totalCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "message-structure formula error scan",
});
console.log("ERRORS", errors.ndjson);

const image = await workbook.render({ sheetName: "Draft Messages", range: "A1:F9", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/structure-after.png`, new Uint8Array(await image.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);
console.log(JSON.stringify({ workbookPath, backupPath }));
