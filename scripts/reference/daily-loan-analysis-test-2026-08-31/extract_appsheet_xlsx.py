import json
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_DOC_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def column_index(cell_ref):
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    value = 0
    for ch in letters.upper():
        value = value * 26 + ord(ch) - 64
    return value - 1


def excel_datetime(serial):
    value = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=float(serial))
    if abs(float(serial) - round(float(serial))) < 1e-10:
        return value.date().isoformat()
    return value.isoformat().replace("+00:00", "Z")


def shared_string_text(item):
    return "".join(node.text or "" for node in item.iter() if local_name(node.tag) == "t")


def parse_cell(cell, shared_strings):
    cell_type = cell.attrib.get("t")
    formula = next((child.text or "" for child in cell if local_name(child.tag) == "f"), None)
    value_node = next((child for child in cell if local_name(child.tag) == "v"), None)
    inline = next((child for child in cell if local_name(child.tag) == "is"), None)
    if inline is not None:
        value = "".join(node.text or "" for node in inline.iter() if local_name(node.tag) == "t")
    elif value_node is None or value_node.text is None:
        value = None
    elif cell_type == "s":
        value = shared_strings[int(value_node.text)]
    elif cell_type in {"str", "inlineStr"}:
        value = value_node.text
    elif cell_type == "b":
        value = value_node.text == "1"
    else:
        try:
            number = float(value_node.text)
            value = int(number) if number.is_integer() else number
        except ValueError:
            value = value_node.text
    return value, formula


def parse_sheet(xml_bytes, shared_strings):
    root = ET.fromstring(xml_bytes)
    candidates = [node for node in root.iter() if local_name(node.tag) == "sheetData"]
    sheet_data = max(candidates, key=lambda node: sum(1 for item in node.iter() if local_name(item.tag) == "c"))
    rows = []
    formulas = []
    for row in [node for node in sheet_data if local_name(node.tag) == "row"]:
        values_by_col = {}
        formulas_by_col = {}
        for cell in [node for node in row if local_name(node.tag) == "c"]:
            idx = column_index(cell.attrib.get("r", "A1"))
            value, formula = parse_cell(cell, shared_strings)
            values_by_col[idx] = value
            if formula is not None:
                formulas_by_col[idx] = formula
        width = max(values_by_col.keys() | formulas_by_col.keys(), default=-1) + 1
        rows.append([values_by_col.get(idx) for idx in range(width)])
        formulas.append([formulas_by_col.get(idx) for idx in range(width)])
    max_width = max((len(row) for row in rows), default=0)
    rows = [row + [None] * (max_width - len(row)) for row in rows]
    formulas = [row + [None] * (max_width - len(row)) for row in formulas]
    return rows, formulas, len(candidates)


def main(input_path, output_path):
    with zipfile.ZipFile(input_path) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [shared_string_text(item) for item in shared_root if local_name(item.tag) == "si"]

        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in relationships_root
            if local_name(rel.tag) == "Relationship"
        }

        result = {"sheets": {}}
        for sheet in [node for node in workbook_root.iter() if local_name(node.tag) == "sheet"]:
            name = sheet.attrib["name"]
            rel_id = sheet.attrib[f"{{{REL_DOC_NS}}}id"]
            target = PurePosixPath("xl") / rel_targets[rel_id].lstrip("/")
            if str(target).startswith("xl/xl/"):
                target = PurePosixPath(str(target)[3:])
            rows, formulas, sheet_data_count = parse_sheet(archive.read(str(target)), shared_strings)
            headers = rows[0] if rows else []
            data_rows = rows[1:] if rows else []
            records = []
            for row in data_rows:
                record = {}
                for idx, header in enumerate(headers):
                    if header in (None, ""):
                        continue
                    value = row[idx] if idx < len(row) else None
                    if isinstance(value, (int, float)) and ("Date" in str(header) or "Timestamp" in str(header)) and value > 30000:
                        value = excel_datetime(value)
                    record[str(header)] = value
                if any(value not in (None, "") for value in record.values()):
                    records.append(record)
            result["sheets"][name] = {
                "headers": headers,
                "records": records,
                "formula_count": sum(1 for row in formulas for value in row if value),
                "sheet_data_element_count": sheet_data_count,
            }

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)

    print(json.dumps({
        "sheets": {
            name: {
                "row_count": len(sheet["records"]),
                "column_count": len(sheet["headers"]),
                "formula_count": sheet["formula_count"],
                "sheet_data_element_count": sheet["sheet_data_element_count"],
                "first_record": sheet["records"][0] if sheet["records"] else None,
            }
            for name, sheet in result["sheets"].items()
        }
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_appsheet_xlsx.py <input.xlsx> <output.json>")
    main(sys.argv[1], sys.argv[2])
