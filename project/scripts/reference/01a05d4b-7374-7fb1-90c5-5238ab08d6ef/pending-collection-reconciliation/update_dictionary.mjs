import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputPath = "C:/GitHub/AppSheet-Loan-Project/outputs/01a05d4b-7374-7fb1-90c5-5238ab08d6ef/pending-collection-reconciliation/AppSheet_Data_Dictionary.xlsx";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const readme = workbook.worksheets.getItem("README");
const columns = workbook.worksheets.getItem("Columns");
const relationships = workbook.worksheets.getItem("Relationships");

readme.getRange("B5").values = [[
  "Reconciled with production OLTP v2.200105 and OLAP v1.000164 on 2026-09-01. OLTP Collection now aggregates Todays Amount Remaining, Charges[Ref Loans] is required, and all inspected Charge-creation actions populate the reference. Live runtime data had 319 Charges, 20 pending rows, no pending orphan reference, and Pending Payment Amount reconciled to ฿9,100. Statistics[Pending Payment Amount] remains SUM(Charges[Amount Remaining]); its scope is not yet hardened against future, exceptional, or orphan rows. Borrowers[Hidden Flag] remains intentionally OLTP-only."
]];
readme.getRange("A5:B5").format.rowHeight = 95;
readme.getRange("B6").values = [[
  "OLTP v2.200105 — Loan Manager ผู้จัดการสินเชื่อ — 93844270-6aa5-420b-a960-bcdf08abd357\nOLAP v1.000164 — Loan Business Insights — e74dd368-654f-44d7-bccf-83cf361d1cdb"
]];
readme.getRange("A24").values = [[
  "Shared VC baseline: 82 VCs are present in both apps and the five daily-installment formula variances are resolved. Loans[Daily Installment Base Principal] and the four Calendar schedule VCs are OLAP-only reporting helpers. Borrowers[Hidden Flag] remains OLTP-only. Charges[Ref Loans] is OLTP-required; the OLAP Required flag was not changed or re-verified."
]];

columns.getRange("A2").values = [[
  "Reconciled union of OLTP and OLAP physical and virtual columns. Production OLTP Charges[Ref Loans] Required status and the current broad Statistics pending-payment formula were re-verified on 2026-09-01; prior daily-installment and borrower-visibility reconciliation remains in force."
]];
columns.getRange("F103:H103").values = [[
  "OLTP Required",
  "Required OLTP parent-loan reference used to preserve Charge ownership and borrower/Collection dereferences.",
  "Stored source column; OLTP Required = TRUE"
]];
columns.getRange("G280").values = [[
  "Broad sum of all Charges[Amount Remaining] across dates and references; currently reconciles to Collection only while source referential integrity and population scope remain aligned."
]];

relationships.getRange("A2").values = [[
  "Direct Ref targets and Is a part of? settings retain the prior 2026-08-30 reconciliation; Charges[Ref Loans] Required = TRUE was re-verified in production OLTP on 2026-09-01."
]];
relationships.getRange("E7").values = [[
  "Part of parent; Ref required in OLTP"
]];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.copyFile(outputPath, inputPath);

console.log(JSON.stringify({ inputPath, outputPath, updated: ["README!B5:B6", "README!A24", "Columns!A2", "Columns!F103:H103", "Columns!G280", "Relationships!A2", "Relationships!E7"] }));
