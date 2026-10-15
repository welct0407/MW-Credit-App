"""Independent XML source read + reconstruction from saved YAML; migration-time only."""
import argparse
import collections
import json
import posixpath
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from common import REPO, ROOT, at, digest, equal, load, write_json

S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_xml(path):
    result = {}
    with zipfile.ZipFile(path) as z:
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(t.text or "" for t in item.iter(S + "t")) for item in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(z.read("xl/workbook.xml")).find(S + "sheets"):
            target = rels[sheet.get(R + "id")]
            file = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            rows = {}
            for row in ET.fromstring(z.read(file)).find(S + "sheetData"):
                cells = {}
                for cell in row:
                    ref = cell.get("r")
                    letters = "".join(c for c in ref if c.isalpha())
                    column = 0
                    for letter in letters:
                        column = column * 26 + ord(letter) - 64
                    node = cell.find(S + "v")
                    raw = node.text if node is not None else None
                    kind = cell.get("t")
                    if kind == "s":
                        value = strings[int(raw)]
                    elif kind == "inlineStr":
                        item = cell.find(S + "is")
                        value = "".join(t.text or "" for t in item.iter(S + "t")) if item is not None else None
                    elif raw is None:
                        value = None
                    elif kind == "b":
                        value = raw == "1"
                    elif kind in ("str", "d"):
                        value = raw
                    elif kind == "e":
                        value = {"excel_error": raw}
                    else:
                        value = float(raw) if any(c in raw.lower() for c in ".e") else int(raw)
                    formula = cell.find(S + "f")
                    if formula is not None:
                        value = {"excel_formula": "=" + (formula.text or ""), "cached_value": value}
                    cells[column] = value
                if any(v is not None for v in cells.values()):
                    rows[int(row.get("r"))] = cells
            headers = [rows[1][i] for i in range(1, max(rows[1]) + 1)]
            result[sheet.get("name")] = {"headers": headers, "rows": {
                n: [cells.get(i) for i in range(1, len(headers) + 1)] for n, cells in rows.items() if n != 1}}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--evidence", type=Path, default=REPO / "outputs/dictionary-migration-20260923")
    args = parser.parse_args()
    manifest = json.loads((args.evidence / "source-manifest.json").read_text(encoding="utf-8"))
    workbook = REPO / manifest["source"]
    assert digest(workbook.read_bytes()) == manifest["sha256"], "Frozen workbook hash changed"
    source = read_xml(workbook)
    assert set(source) == set(manifest["sheets"]), "Sheet coverage mismatch"
    docs = {file: load(args.root / file) for file in manifest["files"]}
    for file, expected in manifest["files"].items():
        assert digest((args.root / file).read_bytes()) == expected, f"Imported file changed: {file}"
    locations = [json.loads(line) for line in (args.evidence / "row-map.jsonl").read_text(encoding="utf-8").splitlines()]
    seen = set()
    targets = set()
    checked = collections.Counter()
    values_checked = 0
    for loc in locations:
        key = (loc["sheet"], loc["row"])
        target = (loc["file"], loc["pointer"])
        assert key not in seen and target not in targets, f"Duplicated source/target: {key}"
        seen.add(key)
        targets.add(target)
        doc = docs[loc["file"]]
        value = at(doc, loc["pointer"])
        if loc["shape"] == "rule":
            reconstructed = [doc["content"]["source_app"], doc["content"]["source_table"], loc["column"], loc["property"], value]
        else:
            assert set(value) == set(source[loc["sheet"]]["headers"]), f"Record header mismatch: {key}"
            reconstructed = [value[h] for h in source[loc["sheet"]]["headers"]]
        expected = source[loc["sheet"]]["rows"][loc["row"]]
        assert equal(reconstructed, expected), f"Typed value mismatch: {key}"
        checked[loc["sheet"]] += 1
        values_checked += len(expected)
    expected_keys = {(name, n) for name, s in source.items() for n in s["rows"]}
    assert seen == expected_keys, f"Unaccounted source rows: {len(expected_keys - seen)}"
    for name, sheet in source.items():
        recorded = manifest["sheets"][name]
        assert equal(sheet["headers"], recorded["headers"]), "Source headers changed"
        assert sorted(sheet["rows"]) == recorded["row_numbers"], "Source row positions changed"
    result = {"passed": True, "method": "Independent workbook XML extraction versus YAML row reconstruction",
              "source_sha256": manifest["sha256"], "sheets": len(source), "records": len(seen),
              "typed_cell_values": values_checked, "documents": len(docs), "per_sheet": dict(checked),
              "duplicate_source_or_target_rows": 0, "unaccounted_source_rows": 0,
              "formula_and_cached_values_preserved": True, "workbook_unchanged": True,
              "live_access": False, "semantic_reconciliation": False}
    write_json(args.evidence / "verification.json", result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
