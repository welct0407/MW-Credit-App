import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/GitHub/AppSheet-Loan-Project/Documents/AppSheet_Data_Dictionary.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

for (const [sheetId, range] of [
  ["README", "A4:B10"],
  ["Tables", "A4:G6"],
  ["Columns", "A58:H68"],
  ["App Variances", "A35:F42"],
  ["App Variances", "A178:F182"],
  ["Change Log", "A4:I6"],
]) {
  const result = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 12,
    maxChars: 16000,
  });
  console.log(`${sheetId}!${range}`);
  console.log(result.ndjson);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 12000,
});
console.log("FORMULA_ERRORS");
console.log(errors.ndjson);

const inventory = await workbook.inspect({
  kind: "table",
  sheetId: "Columns",
  range: "A5:C310",
  include: "values",
  tableMaxRows: 400,
  tableMaxCols: 3,
  maxChars: 200000,
});
const inventoryObject = JSON.parse(inventory.ndjson.split("\n")[0]);
const rows = inventoryObject.values.filter((row) => row[0]);
const counts = {};
const orderErrors = [];
for (const row of rows) {
  const [table, order] = row;
  counts[table] = (counts[table] || 0) + 1;
  if (order !== counts[table]) orderErrors.push({ table, expected: counts[table], actual: order, column: row[2] });
}
console.log("INVENTORY_COUNTS");
console.log(JSON.stringify({ total: rows.length, counts, orderErrors }, null, 2));
