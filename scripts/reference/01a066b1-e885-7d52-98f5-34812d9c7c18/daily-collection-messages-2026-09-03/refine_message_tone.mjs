import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a066b1-e885-7d52-98f5-34812d9c7c18/daily-collection-messages-2026-09-03";
const workbookPath = `${outputDir}/Daily_Collection_Message_Review_2026-09-03.xlsx`;
const backupPath = `${outputDir}/Daily_Collection_Message_Review_2026-09-03.before-tone-refinement.xlsx`;

try {
  await fs.access(backupPath);
} catch {
  await fs.copyFile(workbookPath, backupPath);
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const drafts = workbook.worksheets.getItem("Draft Messages");

const note = "Drafts refined from the friend's reminder style. Amounts unchanged; bank details omitted. No message has been sent.";
const messages = [
  "💵 พี่วาคะ ส่งยอดวันนี้ 100 บาทนะคะ 💰\n⚠️ แจ้งเตือนส่งยอดวันนี้ ⚠️\nรบกวนส่งภายใน 16.00 น. นะคะ จะได้ไม่เสียค่าปรับล่าช้าค่ะ ขอบคุณนะคะ 🙏",
  "💵 พี่เนยคะ ส่งยอดวันนี้ 300 บาทนะคะ 💰\n⚠️ แจ้งเตือนส่งยอดวันนี้ ⚠️\nรบกวนส่งภายใน 16.00 น. นะคะ จะได้ไม่เสียค่าปรับล่าช้าค่ะ ขอบคุณนะคะ 🙏",
  "💵 พี่ปุยฝ้ายคะ ยอดที่ต้องส่งทั้งหมด 5,900 บาทนะคะ 💰\n• ยอดวันนี้ 2,900 บาท\n• ยอดค้างเดิม 3,000 บาท\n⚠️ รบกวนส่งภายใน 16.00 น. นะคะ จะได้ไม่เสียค่าปรับล่าช้าค่ะ ขอบคุณนะคะ 🙏",
  "💵 พี่เบลคะ มียอดค้างเดิม 4,220 บาทนะคะ 💰\nยอดวันนี้ 300 บาทชำระแล้วค่ะ\n⚠️ รบกวนส่งยอดค้างภายใน 16.00 น. นะคะ จะได้ไม่เสียค่าปรับล่าช้าค่ะ ขอบคุณนะคะ 🙏",
  "💵 พี่หนึ่งคะ ยอดที่ต้องส่งทั้งหมด 800 บาทนะคะ 💰\n• ยอดวันนี้ 400 บาท\n• ยอดค้างเดิม 400 บาท\n⚠️ รบกวนส่งภายใน 16.00 น. นะคะ จะได้ไม่เสียค่าปรับล่าช้าค่ะ ขอบคุณนะคะ 🙏",
];

drafts.getRange("A2").values = [[note]];
drafts.getRange("E5:E9").values = messages.map((message) => [message]);
drafts.getRange("A5:F6").format.rowHeightPx = 94;
drafts.getRange("A7:F9").format.rowHeightPx = 118;

const messageCheck = await workbook.inspect({
  kind: "table",
  sheetId: "Draft Messages",
  range: "A1:F9",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 8,
  maxChars: 12000,
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
  summary: "tone-refinement formula error scan",
});
console.log("ERRORS", errors.ndjson);

const image = await workbook.render({ sheetName: "Draft Messages", range: "A1:F9", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/tone-after.png`, new Uint8Array(await image.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);
console.log(JSON.stringify({ workbookPath, backupPath }));
