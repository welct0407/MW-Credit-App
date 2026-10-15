import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/GitHub/AppSheet-Loan-Project/outputs/01a066b1-e885-7d52-98f5-34812d9c7c18/daily-collection-messages-2026-09-03";
const reviewPath = `${outputDir}/Daily_Collection_Message_Review_2026-09-03.xlsx`;
const dictionaryPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const dictionaryBackup = `${outputDir}/AppSheet_Data_Dictionary.before-daily-collection-slice.xlsx`;
await fs.mkdir(outputDir, { recursive: true });
try {
  await fs.access(dictionaryBackup);
} catch {
  await fs.copyFile(dictionaryPath, dictionaryBackup);
}

const navy = "#183B63";
const blue = "#2F75B5";
const paleBlue = "#D9EEF7";
const paleYellow = "#FFF2CC";
const paleGreen = "#E2F0D9";
const paleRed = "#FCE4D6";
const gray = "#667085";
const white = "#FFFFFF";
const currency = '"฿"#,##0';
const snapshot = new Date("2026-09-03T12:00:00+08:00");

function titleBand(sheet, range, title) {
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[title]];
  sheet.getRange(range).format = {
    fill: navy,
    font: { bold: true, color: white, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeightPx = 34;
}

function headerStyle(range) {
  range.format = {
    fill: blue,
    font: { bold: true, color: white },
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: navy },
  };
  range.format.rowHeightPx = 36;
}

function bandRows(sheet, startRow, endRow, startCol, endCol) {
  for (let row = startRow; row <= endRow; row += 1) {
    sheet.getRange(`${startCol}${row}:${endCol}${row}`).format.fill = row % 2 === 1 ? paleBlue : white;
  }
}

const summaryRows = [
  [snapshot, "พี่วา - Wa", "Not Paid", 1, 100, 0, 100, 100, 0, null, "Friend review pending"],
  [snapshot, "พี่เนย - Noey", "Not Paid", 1, 300, 0, 300, 300, 0, null, "Friend review pending"],
  [snapshot, "พี่ปุยฝ้าย - Puifai", "Overdue", 17, 6160, 260, 5900, 2900, 3000, null, "Friend review pending"],
  [snapshot, "พี่เบล - Bell", "Overdue", 7, 5100, 880, 4220, 0, 4220, null, "Friend review pending"],
  [snapshot, "พี่หนึ่ง - Nueng", "Overdue", 4, 800, 0, 800, 400, 400, null, "Friend review pending"],
];

const breakdownRows = [
  [snapshot, "พี่วา - Wa", "Today", "2026-09-03", 1, 100, 0, 100, null, "Current-day charge"],
  [snapshot, "พี่เนย - Noey", "Today", "2026-09-03", 1, 300, 0, 300, null, "Current-day charge"],
  [snapshot, "พี่ปุยฝ้าย - Puifai", "Today", "2026-09-03", 8, 2900, 0, 2900, null, "Eight current-day charges"],
  [snapshot, "พี่ปุยฝ้าย - Puifai", "Overdue", "Before 2026-09-03", 9, 3260, 260, 3000, null, "Prior charges aggregated at the borrower/bucket grain"],
  [snapshot, "พี่เบล - Bell", "Today", "2026-09-03", 1, 300, 300, 0, null, "Today's charge is fully paid"],
  [snapshot, "พี่เบล - Bell", "Overdue", "Before 2026-09-03", 6, 4800, 580, 4220, null, "Prior charges aggregated at the borrower/bucket grain"],
  [snapshot, "พี่หนึ่ง - Nueng", "Today", "2026-09-03", 2, 400, 0, 400, null, "Two current-day charges"],
  [snapshot, "พี่หนึ่ง - Nueng", "Overdue", "2026-09-02", 2, 400, 0, 400, null, "Two prior-day charges"],
];

const messages = [
  ["พี่วา - Wa", 100, 100, 0, "พี่วาคะ วันนี้มียอดที่ต้องชำระ 100 บาทนะคะ เป็นยอดของวันนี้ทั้งหมด รบกวนชำระภายใน 16.00 น. เพื่อหลีกเลี่ยงค่าปรับล่าช้านะคะ ขอบคุณค่ะ 🙏", "Friend review pending"],
  ["พี่เนย - Noey", 300, 300, 0, "พี่เนยคะ วันนี้มียอดที่ต้องชำระ 300 บาทนะคะ เป็นยอดของวันนี้ทั้งหมด รบกวนชำระภายใน 16.00 น. เพื่อหลีกเลี่ยงค่าปรับล่าช้านะคะ ขอบคุณค่ะ 🙏", "Friend review pending"],
  ["พี่ปุยฝ้าย - Puifai", 5900, 2900, 3000, "พี่ปุยฝ้ายคะ วันนี้มียอดคงค้างที่ต้องชำระทั้งหมด 5,900 บาทนะคะ แบ่งเป็นยอดของวันนี้ 2,900 บาท และยอดค้างชำระจากก่อนหน้า 3,000 บาท รบกวนชำระภายใน 16.00 น. เพื่อหลีกเลี่ยงค่าปรับล่าช้านะคะ ขอบคุณค่ะ 🙏", "Friend review pending"],
  ["พี่เบล - Bell", 4220, 0, 4220, "พี่เบลคะ วันนี้มียอดคงค้างที่ต้องชำระ 4,220 บาทนะคะ เป็นยอดค้างชำระจากก่อนหน้าทั้งหมด ส่วนยอดของวันนี้ 300 บาทชำระแล้วค่ะ รบกวนชำระภายใน 16.00 น. เพื่อหลีกเลี่ยงค่าปรับล่าช้านะคะ ขอบคุณค่ะ 🙏", "Friend review pending"],
  ["พี่หนึ่ง - Nueng", 800, 400, 400, "พี่หนึ่งคะ วันนี้มียอดคงค้างที่ต้องชำระทั้งหมด 800 บาทนะคะ แบ่งเป็นยอดของวันนี้ 400 บาท และยอดค้างชำระจากก่อนหน้า 400 บาท รบกวนชำระภายใน 16.00 น. เพื่อหลีกเลี่ยงค่าปรับล่าช้านะคะ ขอบคุณค่ะ 🙏", "Friend review pending"],
];

const review = Workbook.create();
const summary = review.worksheets.add("Collection Summary");
const breakdown = review.worksheets.add("Charge Breakdown");
const drafts = review.worksheets.add("Draft Messages");
const metadata = review.worksheets.add("Metadata");

for (const sheet of [summary, breakdown, drafts, metadata]) sheet.showGridLines = false;

titleBand(summary, "A1:K1", "Daily Collection Review — 2026-09-03");
summary.getRange("A2:K2").merge();
summary.getRange("A2:K2").values = [["Current actionable borrowers only. Snapshot from the live OLTP Collection board; amounts are grouped into today and overdue buckets for message review."]];
summary.getRange("A2:K2").format = { fill: "#EDF4FB", font: { italic: true, color: gray }, wrapText: true };
summary.getRange("A3:J3").values = [["Borrowers", 5, "Pending Total", null, "Today Outstanding", null, "Overdue Outstanding", null, "Reconciliation", null]];
summary.getRange("B3").formulas = [["=COUNTA(B5:B9)"]];
summary.getRange("D3").formulas = [["=SUM(G5:G9)"]];
summary.getRange("F3").formulas = [["=SUM(H5:H9)"]];
summary.getRange("H3").formulas = [["=SUM(I5:I9)"]];
summary.getRange("J3").formulas = [["=D3-F3-H3"]];
summary.getRange("A3:J3").format = { fill: paleGreen, font: { bold: true, color: navy }, verticalAlignment: "center", borders: { preset: "all", style: "thin", color: "#A9D08E" } };
summary.getRange("D3:F3").format.numberFormat = currency;
summary.getRange("H3:J3").format.numberFormat = currency;
summary.getRange("A4:K4").values = [["Snapshot Date", "Borrower", "Collection Status", "Charge Count", "Amount Due Before Payments", "Collected", "Outstanding Now", "Today Outstanding", "Overdue Outstanding", "Check", "Review Status"]];
headerStyle(summary.getRange("A4:K4"));
summary.getRange("A5:K9").values = summaryRows;
summary.getRange("J5").formulas = [["=G5-H5-I5"]];
summary.getRange("J5:J9").fillDown();
bandRows(summary, 5, 9, "A", "K");
summary.getRange("A5:A9").format.numberFormat = "yyyy-mm-dd";
summary.getRange("D5:D9").format.numberFormat = "#,##0";
summary.getRange("E5:J9").format.numberFormat = currency;
summary.getRange("J5:J9").format.fill = paleGreen;
summary.getRange("K5:K9").format.fill = paleYellow;
summary.getRange("K5:K9").dataValidation = { rule: { type: "list", values: ["Friend review pending", "Approved", "Revise"] } };
summary.freezePanes.freezeRows(4);
summary.getRange("A:A").format.columnWidthPx = 100;
summary.getRange("B:B").format.columnWidthPx = 180;
summary.getRange("C:C").format.columnWidthPx = 110;
summary.getRange("D:D").format.columnWidthPx = 90;
summary.getRange("E:I").format.columnWidthPx = 125;
summary.getRange("J:J").format.columnWidthPx = 90;
summary.getRange("K:K").format.columnWidthPx = 155;

titleBand(breakdown, "A1:J1", "Charge Breakdown — Borrower / Bucket Grain");
breakdown.getRange("A2:J2").merge();
breakdown.getRange("A2:J2").values = [["Each row reconciles Amount Due − Collected = Outstanding. 'Overdue' means a charge date before the 2026-09-03 snapshot date."]];
breakdown.getRange("A2:J2").format = { fill: "#EDF4FB", font: { italic: true, color: gray }, wrapText: true };
breakdown.getRange("A4:J4").values = [["Snapshot Date", "Borrower", "Bucket", "Charge Date / Scope", "Charge Count", "Amount Due", "Collected", "Outstanding", "Check", "Note"]];
headerStyle(breakdown.getRange("A4:J4"));
breakdown.getRange("A5:J12").values = breakdownRows;
breakdown.getRange("I5").formulas = [["=F5-G5-H5"]];
breakdown.getRange("I5:I12").fillDown();
bandRows(breakdown, 5, 12, "A", "J");
breakdown.getRange("A5:A12").format.numberFormat = "yyyy-mm-dd";
breakdown.getRange("E5:E12").format.numberFormat = "#,##0";
breakdown.getRange("F5:I12").format.numberFormat = currency;
breakdown.getRange("I5:I12").format.fill = paleGreen;
breakdown.freezePanes.freezeRows(4);
breakdown.getRange("A:A").format.columnWidthPx = 100;
breakdown.getRange("B:B").format.columnWidthPx = 180;
breakdown.getRange("C:C").format.columnWidthPx = 95;
breakdown.getRange("D:D").format.columnWidthPx = 145;
breakdown.getRange("E:E").format.columnWidthPx = 90;
breakdown.getRange("F:I").format.columnWidthPx = 110;
breakdown.getRange("J:J").format.columnWidthPx = 270;
breakdown.getRange("J5:J12").format.wrapText = true;

titleBand(drafts, "A1:F1", "Copy-Ready Thai Collection Messages");
drafts.getRange("A2:F2").merge();
drafts.getRange("A2:F2").values = [["Drafts only — friendly young Thai woman tone. No message has been sent. Review wording and amounts before copying."]];
drafts.getRange("A2:F2").format = { fill: paleRed, font: { italic: true, color: "#9C0006" }, wrapText: true };
drafts.getRange("A4:F4").values = [["Borrower", "Outstanding", "Today", "Overdue", "Copy-Ready Message", "Friend Review Status"]];
headerStyle(drafts.getRange("A4:F4"));
drafts.getRange("A5:F9").values = messages;
bandRows(drafts, 5, 9, "A", "F");
drafts.getRange("B5:D9").format.numberFormat = currency;
drafts.getRange("E5:E9").format.wrapText = true;
drafts.getRange("A5:F9").format.verticalAlignment = "center";
drafts.getRange("A5:F9").format.rowHeightPx = 88;
drafts.getRange("F5:F9").format.fill = paleYellow;
drafts.getRange("F5:F9").dataValidation = { rule: { type: "list", values: ["Friend review pending", "Approved", "Revise"] } };
drafts.freezePanes.freezeRows(4);
drafts.getRange("A:A").format.columnWidthPx = 185;
drafts.getRange("B:D").format.columnWidthPx = 105;
drafts.getRange("E:E").format.columnWidthPx = 500;
drafts.getRange("F:F").format.columnWidthPx = 160;

titleBand(metadata, "A1:B1", "Snapshot Metadata and Governance");
metadata.getRange("A4:B13").values = [
  ["Field", "Value"],
  ["Snapshot date", "2026-09-03 (Asia/Singapore)"],
  ["Source app", "Loan Manager ผู้จัดการสินเชื่อ (OLTP) v2.200115"],
  ["Reporting app", "Loan Business Insights (OLAP) v1.000192"],
  ["OLAP rollback", "v1.000191"],
  ["Slice", "Todays Collection Board"],
  ["Slice filter", "ISNOTBLANK([Daily Collection Status])"],
  ["Snapshot population", "20 board rows: 2 Not Paid, 3 Overdue, 15 Fully Paid; export contains the 5 actionable borrowers with Outstanding Now > 0"],
  ["Governed total", "฿11,320 outstanding = ฿3,700 today + ฿7,620 overdue"],
  ["Message status", "Drafts only; friend review and user manual testing pending; no sending or automation"],
];
headerStyle(metadata.getRange("A4:B4"));
bandRows(metadata, 5, 13, "A", "B");
metadata.getRange("A:A").format.columnWidthPx = 180;
metadata.getRange("B:B").format.columnWidthPx = 720;
metadata.getRange("B5:B13").format.wrapText = true;
metadata.getRange("A5:B13").format.rowHeightPx = 34;
metadata.getRange("A11:B11").format.rowHeightPx = 54;
metadata.freezePanes.freezeRows(4);

const reviewChecks = await review.inspect({ kind: "table", sheetId: "Collection Summary", range: "A3:K9", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 12, maxChars: 8000 });
console.log("REVIEW_SUMMARY", reviewChecks.ndjson);
const reviewErrors = await review.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "review workbook formula errors" });
console.log("REVIEW_ERRORS", reviewErrors.ndjson);
for (const [sheetName, range] of [["Collection Summary", "A1:K9"], ["Charge Breakdown", "A1:J12"], ["Draft Messages", "A1:F9"], ["Metadata", "A1:B13"]]) {
  const image = await review.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/preview-${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await image.arrayBuffer()));
}
const reviewFile = await SpreadsheetFile.exportXlsx(review);
await reviewFile.save(reviewPath);

const dictionary = await SpreadsheetFile.importXlsx(await FileBlob.load(dictionaryPath));
const readme = dictionary.worksheets.getItem("README");
readme.getRange("B5").values = [["Reconciled with production OLTP v2.200115 and OLAP v1.000192 on 2026-09-03 for the daily-collection review change. OLAP now contains a read-only Todays Collection Board slice using the OLTP row filter and OLAP-native collection/overdue fields for governed export and message drafting. No physical column, virtual column, expression, action, bot, view, financial row, or Looker Studio object changed. Earlier matrix, projected-profit, principal-coverage, pending-collection, daily-installment, and borrower-visibility controls remain as documented; their separate manual acceptance items are unchanged."]];
readme.getRange("B6").values = [["OLTP v2.200115 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357\nOLAP v1.000192 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb (daily-collection rollback v1.000191)"]];
readme.getRange("B7").values = [["2026-09-03 (Asia/Singapore)"]];
readme.getRange("B11").values = [[14]];
readme.getRange("A24").values = [["Shared VC baseline: 82 VCs are present in both apps and the five daily-installment formula variances remain resolved. The new OLAP Todays Collection Board adds no column: it reuses OLAP-native Borrowers fields, including Overdue Amount, and intentionally omits the OLTP-only presentation helpers Daily Collection Status - Order and Borrower Name - Collection. Borrowers[Active Profit After Principal Coverage] remains OLTP-only; Borrowers[Projected Monthly Profit Contribution] and the eleven Matrix* helpers remain OLAP-only. Borrowers[Hidden Flag] is loaded in both apps, but only the OLTP Visible Borrowers slice uses it as a row filter."]];

const slices = dictionary.worksheets.getItem("Slices");
slices.getRange("A2").values = [["Live slice filters, update permissions, purposes, and included-column counts; OLAP Todays Collection Board added for daily collection export and message review on 2026-09-03."]];
slices.getRange("A18:H18").copyFrom(slices.getRange("A17:H17"), "all");
slices.getRange("A18:H18").values = [["OLAP", "Todays Collection Board", "Borrowers", "ISNOTBLANK([Daily Collection Status])", "Read-only", 11, "Read-only daily collection export and message-review slice using OLAP-native current-status, amount, charge-list, hidden-flag, and overdue fields.", "OLAP read-only mirror of the OLTP Todays Collection Board for daily collection export and message-drafting review. The exact column set is adapted to available OLAP fields."]];
slices.getRange("A18:H18").format.fill = white;

const sliceColumns = dictionary.worksheets.getItem("Slice Columns");
sliceColumns.getRange("A2").values = [["One row per live included slice column, preserving slice order; OLAP Todays Collection Board added with eleven OLAP-native fields on 2026-09-03."]];
const newSliceColumns = [
  ["OLAP", "Todays Collection Board", 1, "_RowNumber"],
  ["OLAP", "Todays Collection Board", 2, "Row ID"],
  ["OLAP", "Todays Collection Board", 3, "Borrower Name"],
  ["OLAP", "Todays Collection Board", 4, "Description"],
  ["OLAP", "Todays Collection Board", 5, "Hidden Flag"],
  ["OLAP", "Todays Collection Board", 6, "Daily Collection Status"],
  ["OLAP", "Todays Collection Board", 7, "Todays Collection Charges"],
  ["OLAP", "Todays Collection Board", 8, "Todays Amount Due"],
  ["OLAP", "Todays Collection Board", 9, "Todays Amount Collected"],
  ["OLAP", "Todays Collection Board", 10, "Todays Amount Remaining"],
  ["OLAP", "Todays Collection Board", 11, "Overdue Amount"],
];
sliceColumns.getRange("A369:D379").values = newSliceColumns;
for (let row = 369; row <= 379; row += 1) {
  const sourceRow = row % 2 === 1 ? 367 : 368;
  sliceColumns.getRange(`A${sourceRow}:D${sourceRow}`).copyTo(sliceColumns.getRange(`A${row}:D${row}`), "all");
  sliceColumns.getRange(`A${row}:D${row}`).values = [newSliceColumns[row - 369]];
}

const changeLog = dictionary.worksheets.getItem("Change Log");
changeLog.getRange("A7:I7").copyFrom(changeLog.getRange("A6:I6"), "all");
changeLog.getRange("A7:I7").values = [["2026-09-03", "Excel data dictionary", "OLAP slice", "Todays Collection Board", "Add and reconcile", "Documented the new read-only OLAP collection slice, exact OLAP-native column order, purpose, filter, and rollback baseline.", "Loan Business Insights v1.000192; rollback v1.000191", "Yes — affected slice", "Codex"]];

const dictChecks = await dictionary.inspect({ kind: "table", sheetId: "Slices", range: "A1:H18", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 8, maxChars: 10000 });
console.log("DICT_SLICES", dictChecks.ndjson);
const dictSliceColumns = await dictionary.inspect({ kind: "table", sheetId: "Slice Columns", range: "A369:D379", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 4, maxChars: 6000 });
console.log("DICT_SLICE_COLUMNS", dictSliceColumns.ndjson);
const dictErrors = await dictionary.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "dictionary formula errors" });
console.log("DICT_ERRORS", dictErrors.ndjson);
for (const [sheetName, range] of [["README", "A1:B26"], ["Slices", "A1:H18"], ["Slice Columns", "A360:D379"], ["Change Log", "A1:I7"]]) {
  const image = await dictionary.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/after-${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await image.arrayBuffer()));
}
const dictionaryFile = await SpreadsheetFile.exportXlsx(dictionary);
await dictionaryFile.save(dictionaryPath);
console.log(JSON.stringify({ reviewPath, dictionaryPath, dictionaryBackup }));
