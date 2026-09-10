import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx";
const outputPath = "C:/GitHub/AppSheet-Loan-Project/outputs/oltp-todays-payment-2026-09-04/AppSheet_Data_Dictionary.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

const readme = workbook.worksheets.getItem("README");
readme.getRange("B5").values = [[
  "Reconciled against OLTP v2.300003 on 2026-09-04. Added OLTP-only repayment and charge helpers, then updated Borrowers[Todays Amount Collected] to show payments dated today. OLAP v1.000192 is unchanged. Live formulas and affected counts were verified. The user confirmed the Collection result was tested and working; this change is accepted. The review remains limited to the three affected fields."
]];
readme.getRange("A5:B5").format.rowHeightPx = 92;
readme.getRange("A6:B6").format.rowHeightPx = 72;
readme.getRange("A24:B24").format.rowHeightPx = 84;

const tables = workbook.worksheets.getItem("Tables");
tables.getRange("A8:G8").format.rowHeightPx = 34;
tables.getRange("A13:G13").format.rowHeightPx = 34;

const columns = workbook.worksheets.getItem("Columns");
columns.getRange("F39:H39").values = [[
  "Intentional formula variance",
  "OLTP uses payments dated today; OLAP retains the cumulative paid amount.",
  "OLTP: SUM([Todays Collection Charges][Payment Received Today]); OLAP: SUM([Todays Collection Charges][Total Paid])"
]];
columns.getRange("F130:G130").values = [[
  "Show; 0 decimals; OLTP #23",
  "Related repayment amount dated today for the Collection display."
]];
columns.getRange("F265:G265").values = [[
  "Show; 0 decimals; OLTP #14",
  "Amount Received when Payment Date is today; otherwise zero."
]];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await output.save(sourcePath);
console.log(JSON.stringify({ sourcePath, outputPath }));
