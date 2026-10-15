import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputPath = "C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04/AppSheet_Data_Dictionary.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

const readme = workbook.worksheets.getItem("README");
readme.getRange("B5").values = [[
  "Reconciled with production OLTP v2.300003 on 2026-09-04 for the today-only Collection amount change. OLTP adds Repayments[Payment Amount Today] and Charges[Payment Received Today], then changes Borrowers[Todays Amount Collected] to sum the charge-level today-only value. The exact saved expressions and affected table counts were verified in the live editor, which reported no issues. OLAP remains v1.000192 and was not modified. Runtime Collection testing and user acceptance remain pending. Unrelated changes between the earlier documented OLTP v2.200115 baseline and the pre-change rollback v2.300002 were not re-audited."
]];
readme.getRange("B6").values = [[
  "OLTP v2.300003 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357 (today-only Collection rollback v2.300002)\nOLAP v1.000192 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb (unchanged; daily-collection rollback v1.000191)"
]];
readme.getRange("B7").values = [["2026-09-04 (Asia/Singapore)"]];
readme.getRange("B9").values = [[318]];
readme.getRange("A24").values = [[
  "Shared VC baseline: 82 VCs are present in both apps. Repayments[Payment Amount Today] and Charges[Payment Received Today] are OLTP-only. Borrowers[Todays Amount Collected] is shared by name but now has an intentional formula variance: OLTP sums the today-only charge helper, while OLAP continues to sum cumulative Total Paid. Earlier daily-installment variances remain resolved. Borrowers[Active Profit After Principal Coverage] remains OLTP-only; Borrowers[Projected Monthly Profit Contribution] and the eleven Matrix* helpers remain OLAP-only."
]];

const tables = workbook.worksheets.getItem("Tables");
tables.getRange("E8").values = [[16]];
tables.getRange("G8").values = [[
  "Scheduled amounts due and collection state at charge level, including principal and interest allocation and the OLTP-only today-payment rollup used by Collection."
]];
tables.getRange("E13").values = [[5]];
tables.getRange("G13").values = [[
  "Posted payment transactions and their allocation to loans and charges, including the OLTP-only today-payment helper."
]];

const columns = workbook.worksheets.getItem("Columns");
columns.getRange("A2").values = [[
  "Reconciled union of OLTP and OLAP physical and virtual columns. The two OLTP-only today-payment helpers and the intended Borrowers formula variance were reconciled through OLTP v2.300003 on 2026-09-04; OLAP remains v1.000192 and unchanged."
]];
columns.getRange("F39:H39").values = [[
  "Intentional OLTP/OLAP formula variance",
  "Collection amount for the current borrower. OLTP includes only Repayments dated today; OLAP retains the prior cumulative charge-payment definition.",
  "OLTP: SUM([Todays Collection Charges][Payment Received Today]); OLAP: SUM([Todays Collection Charges][Total Paid])"
]];

// Preserve the established banded-row styling for the two rows added beyond the current used range.
columns.getRange("A319:H319").copyTo(columns.getRange("A321:H321"), "all");
columns.getRange("A320:H320").copyTo(columns.getRange("A322:H322"), "all");

// Insert the Repayments helper after Amount Received, using values-only shifts so existing row formatting stays fixed.
for (let row = 320; row >= 264; row -= 1) {
  columns.getRange(`A${row}:H${row}`).copyTo(columns.getRange(`A${row + 1}:H${row + 1}`), "values");
}
columns.getRange("A264:H264").values = [[
  "Repayments",
  23,
  "Payment Amount Today",
  "VC / Price",
  "OLTP only",
  "Show; 0 decimals; live OLTP position 14",
  "Row-grain amount received only when Payment Date equals the app's current date; used by the related Charge rollup.",
  "IF([Payment Date] = TODAY(), [Amount Received], 0)"
]];

// Insert the Charges helper after the existing OLTP-only Charge columns.
for (let row = 321; row >= 130; row -= 1) {
  columns.getRange(`A${row}:H${row}`).copyTo(columns.getRange(`A${row + 1}:H${row + 1}`), "values");
}
columns.getRange("A130:H130").values = [[
  "Charges",
  28,
  "Payment Received Today",
  "VC / Price",
  "OLTP only",
  "Show; 0 decimals; live OLTP position 23",
  "Charge-grain sum of related Repayments dated today; used by Borrowers[Todays Amount Collected].",
  "SUM([Related Repayments][Payment Amount Today])"
]];

const variances = workbook.worksheets.getItem("App Variances");
variances.getRange("A2").values = [[
  "Tables and columns present in only one live application definition. The two OLTP-only today-payment helpers were reconciled through OLTP v2.300003 on 2026-09-04; OLAP remains v1.000192 and unchanged."
]];
variances.getRange("A195:F195").copyTo(variances.getRange("A197:F197"), "all");
variances.getRange("A196:F196").copyTo(variances.getRange("A198:F198"), "all");
variances.getRange("A197:F198").values = [[
  "Column",
  "Charges",
  "Payment Received Today",
  "Yes",
  "No",
  "OLTP-only Charge rollup of related repayment amounts whose Payment Date is today; supports the Collection right-side amount."
], [
  "Column",
  "Repayments",
  "Payment Amount Today",
  "Yes",
  "No",
  "OLTP-only row-grain amount that returns Amount Received only when Payment Date equals TODAY()."
]];

await fs.mkdir("C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04", { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await output.save(sourcePath);
console.log(JSON.stringify({ sourcePath, outputPath }));
