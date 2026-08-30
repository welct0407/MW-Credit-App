import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = path.resolve(process.cwd(), "..", "..");
const sourcePath = path.join(projectRoot, ".tmp", "conversion_data.json");
const outputPath = path.join(projectRoot, "Documents", "AppSheet_Data_Dictionary.xlsx");
const previewDir = path.join(projectRoot, ".tmp", "conversion", "previews");
const data = JSON.parse(await fs.readFile(sourcePath, "utf8"));

const workbook = Workbook.create();

const palette = {
  navy: "#17365D",
  blue: "#2F75B5",
  paleBlue: "#D9EAF7",
  paleGreen: "#E2F0D9",
  paleAmber: "#FFF2CC",
  paleRed: "#FCE4D6",
  gray: "#667085",
  lightGray: "#F3F6F9",
  border: "#C9D3DD",
  ink: "#172B3A",
  white: "#FFFFFF",
};

const literal = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && value.startsWith("=")) return `'${value}`;
  return value;
};

const colLetter = (n) => {
  let value = n;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const applyTitle = (sheet, title, subtitle, colCount) => {
  const end = colLetter(colCount);
  sheet.mergeCells(`A1:${end}1`);
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${end}1`).format = {
    fill: palette.navy,
    font: { bold: true, color: palette.white, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${end}1`).format.rowHeight = 30;
  sheet.mergeCells(`A2:${end}2`);
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${end}2`).format = {
    fill: palette.lightGray,
    font: { italic: true, color: palette.gray, size: 10 },
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange(`A2:${end}2`).format.rowHeight = 30;
};

const addDataSheet = ({ name, title, subtitle, headers, rows, widths, tableName, wrapColumns = [] }) => {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  applyTitle(sheet, title, subtitle, headers.length);

  const matrix = [headers, ...rows.map((row) => row.map(literal))];
  const endCol = colLetter(headers.length);
  const endRow = 3 + matrix.length;
  const writeRange = sheet.getRange(`A4:${endCol}${endRow}`);
  writeRange.values = matrix;

  const table = sheet.tables.add(`A4:${endCol}${endRow}`, true, tableName);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  table.showBandedRows = true;

  sheet.getRange(`A4:${endCol}4`).format = {
    fill: palette.blue,
    font: { bold: true, color: palette.white },
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: palette.navy },
  };
  sheet.getRange(`A4:${endCol}4`).format.rowHeight = 30;
  if (rows.length) {
    sheet.getRange(`A5:${endCol}${endRow}`).format = {
      font: { color: palette.ink, size: 9 },
      verticalAlignment: "top",
      borders: {
        insideHorizontal: { style: "thin", color: palette.border },
        bottom: { style: "thin", color: palette.border },
      },
    };
  }

  widths.forEach((width, i) => {
    sheet.getRange(`${colLetter(i + 1)}:${colLetter(i + 1)}`).format.columnWidth = width;
  });
  for (const columnIndex of wrapColumns) {
    if (rows.length) {
      sheet.getRange(`${colLetter(columnIndex)}5:${colLetter(columnIndex)}${endRow}`).format.wrapText = true;
    }
  }
  if (rows.length) sheet.getRange(`A5:${endCol}${endRow}`).format.autofitRows();
  sheet.freezePanes.freezeRows(4);
  return { sheet, endCol, endRow };
};

// README
const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
applyTitle(readme, "AppSheet Data Dictionary", "Technical companion to AppSheet_Data_Model_Overview.docx", 6);
readme.getRange("A4:B11").values = [
  ["Control", "Value"],
  ["Conversion status", data.conversionStatus],
  ["Source baseline", `${data.sourceFile} (${data.sourceBaselineDate})`],
  ["Conversion date", data.conversionDate],
  ["Tables", null],
  ["Columns", null],
  ["Relationships", null],
  ["Slices", null],
];
readme.getRange("B8").formulas = [["=COUNTA('Tables'!A5:A100)"]];
readme.getRange("B9").formulas = [["=COUNTA('Columns'!A5:A1000)"]];
readme.getRange("B10").formulas = [["=COUNTA('Relationships'!A5:A100)"]];
readme.getRange("B11").formulas = [["=COUNTA('Slices'!A5:A100)"]];
readme.getRange("A4:B4").format = { fill: palette.blue, font: { bold: true, color: palette.white } };
readme.getRange("A5:A11").format = { fill: palette.lightGray, font: { bold: true, color: palette.navy } };
readme.getRange("A4:B11").format.borders = { preset: "all", style: "thin", color: palette.border };
readme.getRange("A4:A11").format.columnWidth = 24;
readme.getRange("B4:B11").format.columnWidth = 76;
readme.getRange("B5:B11").format.wrapText = true;
readme.getRange("A5:B11").format.autofitRows();

readme.getRange("A14:B22").values = [
  ["Worksheet", "Maintenance purpose"],
  ["Tables", "One row per source table with loading scope, physical/VC counts, and purpose."],
  ["Columns", "One row per unioned column definition. This is the authoritative column-level inventory for the reference pair."],
  ["Relationships", "Direct Ref relationships and documented part-of behavior."],
  ["Slices", "Slice source, filter, update mode, purpose, and column count."],
  ["Slice Columns", "One row per included column, preserving slice column order."],
  ["App Variances", "Tables and columns present in only one app."],
  ["Change Log", "Append-only record of accepted reference changes and reconciliation status."],
  ["Maintenance rule", "Update the technical rows first, append a Change Log entry, then revise Word only when narrative meaning or governance changes."],
];
readme.getRange("A14:B14").format = { fill: palette.blue, font: { bold: true, color: palette.white } };
readme.getRange("A15:A22").format = { fill: palette.lightGray, font: { bold: true, color: palette.navy } };
readme.getRange("A14:B22").format.borders = { preset: "all", style: "thin", color: palette.border };
readme.getRange("A15:B22").format.wrapText = true;
readme.getRange("A15:B22").format.autofitRows();
readme.getRange("A24:F26").merge();
readme.getRange("A24").values = [["Important: this workbook was created by splitting the existing Word reference. It was not reconciled with the live AppSheet database, OLTP app, or OLAP app during conversion. Update the Change Log after reconciliation."]];
readme.getRange("A24:F26").format = {
  fill: palette.paleAmber,
  font: { bold: true, color: palette.ink },
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#C9A227" },
};
readme.getRange("C:F").format.columnWidth = 14;
readme.freezePanes.freezeRows(3);

const tableHeaders = data.tables[0];
const tableRows = data.tables.slice(1);
addDataSheet({
  name: "Tables",
  title: "Tables",
  subtitle: "Source ownership, application loading, physical/virtual column counts, and table purpose.",
  headers: tableHeaders,
  rows: tableRows,
  widths: [24, 28, 18, 12, 12, 12, 66],
  tableName: "DataModelTables",
  wrapColumns: [2, 7],
});

const columnHeaders = ["Table", "Column Order", "Column", "Kind / type", "Availability", "Flags", "Purpose", "Definition / expression"];
const columnRows = data.columns.map((row) => columnHeaders.map((header) => row[header]));
const columnsResult = addDataSheet({
  name: "Columns",
  title: "Columns",
  subtitle: "Union of OLTP and OLAP physical columns and virtual columns. Expressions are stored as text for auditability.",
  headers: columnHeaders,
  rows: columnRows,
  widths: [24, 13, 34, 22, 18, 14, 58, 78],
  tableName: "DataModelColumns",
  wrapColumns: [3, 4, 7, 8],
});
columnsResult.sheet.getRange(`E5:E${columnsResult.endRow}`).conditionalFormats.add("containsText", { text: "OLAP only", format: { fill: palette.paleBlue, font: { color: palette.navy } } });
columnsResult.sheet.getRange(`E5:E${columnsResult.endRow}`).conditionalFormats.add("containsText", { text: "OLTP only", format: { fill: palette.paleAmber, font: { color: "#7F6000" } } });

const relationshipHeaders = data.relationships[0];
const relationshipRows = data.relationships.slice(1);
addDataSheet({
  name: "Relationships",
  title: "Relationships",
  subtitle: "Direct Ref relationships converted from the Word baseline; confirm against AppSheet during reconciliation.",
  headers: relationshipHeaders,
  rows: relationshipRows,
  widths: [28, 28, 28, 42, 40],
  tableName: "DataModelRelationships",
  wrapColumns: [4, 5],
});

const sliceHeaders = ["App", "Slice", "Source", "Row Filter", "Update Mode", "Column Count", "Purpose", "Comment"];
const sliceRows = data.slices.map((row) => sliceHeaders.map((header) => row[header]));
addDataSheet({
  name: "Slices",
  title: "Slices",
  subtitle: "Slice filters, update permissions, purposes, and included-column counts.",
  headers: sliceHeaders,
  rows: sliceRows,
  widths: [10, 34, 24, 62, 22, 14, 58, 28],
  tableName: "DataModelSlices",
  wrapColumns: [2, 4, 7, 8],
});

const sliceColumnHeaders = ["App", "Slice", "Column Order", "Column"];
const sliceColumnRows = data.sliceColumns.map((row) => sliceColumnHeaders.map((header) => row[header]));
addDataSheet({
  name: "Slice Columns",
  title: "Slice Columns",
  subtitle: "One row per included slice column. Sort by App, Slice, and Column Order to restore display order.",
  headers: sliceColumnHeaders,
  rows: sliceColumnRows,
  widths: [10, 38, 15, 42],
  tableName: "DataModelSliceColumns",
  wrapColumns: [2, 4],
});

const varianceHeaders = ["Object Type", "Table", "Object", "OLTP Presence", "OLAP Presence", "Notes"];
const varianceRows = data.appVariances.map((row) => varianceHeaders.map((header) => row[header]));
const varianceResult = addDataSheet({
  name: "App Variances",
  title: "Application Variances",
  subtitle: "Tables and columns documented in only one application definition.",
  headers: varianceHeaders,
  rows: varianceRows,
  widths: [16, 28, 38, 16, 16, 68],
  tableName: "DataModelAppVariances",
  wrapColumns: [3, 6],
});
varianceResult.sheet.getRange(`D5:E${varianceResult.endRow}`).conditionalFormats.add("containsText", { text: "No", format: { fill: palette.paleRed, font: { color: "#9C0006" } } });

const changeHeaders = ["Date", "Artifact", "Object Type", "Object Name", "Change Type", "Summary", "Source Baseline", "Reconciled with AppSheet?", "Updated By"];
const changeRows = [[
  new Date("2026-08-30T00:00:00+08:00"),
  "Word + Excel reference pair",
  "Reference structure",
  "Initial split",
  "Conversion",
  "Split the existing Word baseline into a descriptive Word overview and a filterable Excel technical dictionary. No live AppSheet comparison was performed.",
  `${data.sourceFile} (${data.sourceBaselineDate})`,
  "Pending",
  "Codex",
]];
const changeResult = addDataSheet({
  name: "Change Log",
  title: "Change Log",
  subtitle: "Append one row for every accepted reference update. Do not overwrite prior entries.",
  headers: changeHeaders,
  rows: changeRows,
  widths: [14, 30, 22, 28, 18, 72, 36, 24, 18],
  tableName: "DataModelChangeLog",
  wrapColumns: [2, 4, 6, 7],
});
changeResult.sheet.getRange("A5:A100").format.numberFormat = "yyyy-mm-dd";
changeResult.sheet.getRange("H5:H100").dataValidation = { rule: { type: "list", values: ["Pending", "Yes", "No", "Partial"] } };
changeResult.sheet.getRange("H5:H100").conditionalFormats.add("containsText", { text: "Pending", format: { fill: palette.paleAmber, font: { color: "#7F6000", bold: true } } });

await fs.mkdir(previewDir, { recursive: true });
const previewRanges = {
  README: "A1:F26",
  Tables: "A1:G16",
  Columns: "A1:H22",
  Relationships: "A1:E14",
  Slices: "A1:H18",
  "Slice Columns": "A1:D28",
  "App Variances": "A1:F24",
  "Change Log": "A1:I8",
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
  const safeName = sheetName.replaceAll(" ", "_");
  await fs.writeFile(path.join(previewDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const keyInspect = await workbook.inspect({
  kind: "table",
  range: "README!A4:B22",
  include: "values,formulas",
  tableMaxRows: 24,
  tableMaxCols: 4,
  maxChars: 5000,
});
console.log(keyInspect.ndjson);
const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
