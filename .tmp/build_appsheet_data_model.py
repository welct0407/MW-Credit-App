from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".tmp" / "model_inventory.json"
OUTPUT = ROOT / "AppSheet_Data_Model_Reference.docx"

NAVY = "163A5F"
BLUE = "2E74B5"
DARK_BLUE = "1F4D78"
INK = "172B3A"
MUTED = "5E6B75"
HEADER_FILL = "E8EEF5"
LIGHT_FILL = "F4F6F9"
WHITE = "FFFFFF"
BORDER = "B8C5D1"
CAUTION = "7A5A00"
RED = "9B1C1C"
LATIN_FONT = "Calibri"
THAI_FONT = "Leelawadee UI"
USABLE_DXA = 14256  # 9.9 in; landscape Letter with 0.55 in side margins.
TABLE_INDENT_DXA = 120


TABLE_PURPOSES = {
    "Borrowers": "Borrower master records and borrower-level operational or portfolio indicators.",
    "Loans": "Loan contracts, commercial terms, lifecycle state, balances, and loan-level risk metrics.",
    "Charges": "Scheduled amounts due and collection state at charge level, including principal and interest allocation.",
    "Repayments": "Posted payment transactions and their allocation to loans and charges.",
    "Statistics": "Small KPI/control table used to expose app-level operational and reporting aggregates.",
    "Partners": "Partner master records used for capital participation and settlement reporting.",
    "Cash Pool Contributions": "Partner capital-contribution movements that build the lendable cash pool.",
    "Settlements": "Auditable partner settlement records and settlement status.",
    "Loan Assessment": "Input/control record for evaluating a proposed loan against projected coverage and return.",
    "Daily Analytics": "Persisted daily portfolio snapshot fact table for historical reporting and governed feeds.",
    "Calendar": "Google Sheets-backed date spine used by OLAP loan-assessment projections; not part of Money database.",
}

SLICE_PURPOSES = {
    "Todays Collection Board": "Read-only borrower workboard restricted to borrowers with a current collection status.",
    "Payment Collection": "Operational charge queue containing pending or partially paid items plus items completed today.",
    "Borrowers with Outstanding Loans": "Read-only OLAP subset of borrowers whose outstanding principal is greater than zero.",
    "Profit Contribution 30D": "Read-only OLAP subset of borrowers contributing positive interest profit in the last 30 days.",
    "Reporting Borrowers": "Curated, read-only borrower feed for downstream reporting and dashboard reconciliation.",
    "Reporting Charges": "Curated, read-only charge feed with due, paid, remaining, lateness, and borrower fields.",
    "Daily Analytics 7 Days": "Rolling seven-day daily-analytics window for recent trend analysis.",
    "Daily Analytics 30 Days": "Rolling 30-day daily-analytics window for monthly and near-term trend analysis.",
    "Daily Analytics 90 Days": "Rolling 90-day daily-analytics window for medium-term portfolio trends.",
    "Reporting Daily Analytics": "Curated, read-only daily snapshot feed for governed downstream reporting.",
    "Reporting Loans": "Curated, read-only loan feed containing contract, balance, rate, age, and default fields.",
    "Reporting Repayments": "Curated, read-only posted-payment feed with loan and charge references.",
    "Reporting Statistics": "Curated, read-only KPI feed for governed dashboard totals.",
}


def set_font(run, size=None, bold=None, italic=None, color=None, name=LATIN_FONT):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)
    rfonts.set(qn("w:eastAsia"), THAI_FONT)
    rfonts.set(qn("w:cs"), THAI_FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for tag, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{tag}"))
        if node is None:
            node = OxmlElement(f"w:{tag}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_geometry(table, widths, indent=TABLE_INDENT_DXA):
    if sum(widths) != USABLE_DXA:
        raise ValueError(f"Table widths must total {USABLE_DXA}: {widths}")
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(USABLE_DXA))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent))
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        grid_col = OxmlElement("w:gridCol")
        grid_col.set(qn("w:w"), str(width))
        grid.append(grid_col)
    for row in table.rows:
        for idx, (cell, width) in enumerate(zip(row.cells, widths)):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)


def add_field(paragraph, instruction):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, text, end])
    set_font(run, size=8, color=MUTED)


def add_footer(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("AppSheet Data Model Reference  |  Page ")
    set_font(r, size=8, color=MUTED)
    add_field(p, " PAGE ")
    r = p.add_run(" of ")
    set_font(r, size=8, color=MUTED)
    add_field(p, " NUMPAGES ")


def add_header(section):
    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("LOAN SOLUTION  /  GOVERNED MODEL REFERENCE")
    set_font(r, size=8, bold=True, color=MUTED)


def configure_section(section):
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Inches(11)
    section.page_height = Inches(8.5)
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.55)
    section.right_margin = Inches(0.55)
    section.header_distance = Inches(0.30)
    section.footer_distance = Inches(0.30)
    add_header(section)
    add_footer(section)


def configure_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = LATIN_FONT
    normal.font.size = Pt(10.5)
    normal._element.rPr.rFonts.set(qn("w:ascii"), LATIN_FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), LATIN_FONT)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), THAI_FONT)
    normal._element.rPr.rFonts.set(qn("w:cs"), THAI_FONT)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25
    style_tokens = {
        "Title": (28, NAVY, 0, 8),
        "Subtitle": (13, MUTED, 0, 12),
        "Heading 1": (16, BLUE, 18, 10),
        "Heading 2": (13, BLUE, 14, 7),
        "Heading 3": (12, DARK_BLUE, 10, 5),
    }
    for style_name, (size, color, before, after) in style_tokens.items():
        style = doc.styles[style_name]
        style.font.name = LATIN_FONT
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style._element.rPr.rFonts.set(qn("w:ascii"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), LATIN_FONT)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), THAI_FONT)
        style._element.rPr.rFonts.set(qn("w:cs"), THAI_FONT)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True
    doc.styles["Title"].font.bold = True


def add_para(doc, text="", size=10.5, bold=False, italic=False, color=INK, after=6, align=None, keep=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.25
    p.paragraph_format.keep_with_next = keep
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    set_font(r, size=size, bold=bold, italic=italic, color=color)
    return p


def add_label_value(doc, label, value, after=3):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run(label + ": ")
    set_font(r, size=9.5, bold=True, color=NAVY)
    r = p.add_run(value)
    set_font(r, size=9.5, color=INK)
    return p


def add_callout(doc, label, text, fill=LIGHT_FILL, color=NAVY):
    table = doc.add_table(rows=1, cols=1)
    set_table_geometry(table, [USABLE_DXA])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run(label + "  ")
    set_font(r, size=9.5, bold=True, color=color)
    r = p.add_run(text)
    set_font(r, size=9.5, color=INK)
    return table


def make_table(doc, headers, widths, rows, font_size=8.2, repeat=True):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0]
    if repeat:
        set_repeat_table_header(hdr)
    for i, text in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_shading(cell, HEADER_FILL)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        r = p.add_run(str(text))
        set_font(r, size=8, bold=True, color=NAVY)
    for values in rows:
        row = table.add_row()
        row.height_rule = WD_ROW_HEIGHT_RULE.AUTO
        for i, value in enumerate(values):
            cell = row.cells[i]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            r = p.add_run("" if value is None else str(value))
            set_font(r, size=font_size, color=INK)
    set_table_geometry(table, widths)
    return table


def source_kind(table, row):
    if table == "Calendar":
        return "VC" if row.get("initialDisabled") else "Physical"
    return "Physical" if row.get("nameDisabled") else "VC"


def column_purpose(name, kind, col_type, formula):
    n = name.lower()
    if name == "_RowNumber":
        return "System-generated source-row ordinal; not a stable business key."
    if name == "Row ID":
        return "Immutable row key generated by the source database."
    if col_type == "Ref":
        return "Reference key that links this row to the configured parent table."
    if kind == "Physical":
        if "date" in n:
            return f"Stores the source date for {name}."
        if any(x in n for x in ("amount", "principal", "interest", "profit", "cash", "balance", "fee")):
            return f"Stores the financially material source value for {name}."
        if "status" in n:
            return f"Stores the controlled workflow state for {name}."
        return f"Stores the authoritative source value for {name}."
    if n.startswith("related "):
        return "Reverse-reference list of child rows that point to this record."
    if "header" in n or n.endswith(" te") or "summary -" in n:
        return "Presentation-oriented label or bilingual display value."
    if any(x in n for x in ("join key", "slice", "bucket", "order")):
        return "Derived grouping, ordering, or join value used by reporting or app presentation."
    if any(x in n for x in ("count", "number of", "active loans")):
        return "Derived count used for workload, portfolio, or risk analysis."
    if any(x in n for x in ("rate", "return", "yield", "%", "share", "coverage")):
        return "Derived ratio or performance measure calculated from governed source values."
    if any(x in n for x in ("status", "flag", "eligible", "defaulted", "has ", "on time", "late")):
        return "Derived business-state or risk indicator."
    if any(x in n for x in ("days", "age", "duration", "month", "week", "year", "date")):
        return "Derived date, time-window, age, or delinquency measure."
    if any(x in n for x in ("amount", "principal", "interest", "profit", "cash", "balance", "settlement", "contribution")):
        return "Derived financial aggregate or balance for operational or analytical use."
    return "Derived AppSheet value used by the app workflow, presentation, or reporting model."


def compact_formula(text):
    return re.sub(r"\s+", " ", (text or "").strip())


def definition_for(table, oltp_row, olap_row):
    rows = [r for r in (oltp_row, olap_row) if r]
    kind = source_kind(table, rows[0])
    if kind == "Physical":
        init = next((compact_formula(r.get("initial")) for r in rows if r.get("initial")), "")
        return "Stored source column" + (f"; initial value: {init}" if init else "")
    f1 = compact_formula(oltp_row.get("formula")) if oltp_row else ""
    f2 = compact_formula(olap_row.get("formula")) if olap_row else ""
    if oltp_row and olap_row and f1 != f2:
        return f"OLTP: {f1 or '[no expression captured]'}\nOLAP: {f2 or '[no expression captured]'}"
    return f2 or f1 or "Virtual column; no expression captured in the grid."


def table_map(model):
    return {t["table"]: t for t in model}


def col_map(table):
    return {r["name"]: r for r in table.get("rows", [])} if table else {}


def availability(oltp_row, olap_row):
    if oltp_row and olap_row:
        return "OLTP + OLAP"
    if oltp_row:
        return "OLTP only"
    return "OLAP only"


def update_mode(slice_def):
    enabled = [label for label, key in (("Updates", "updates"), ("Adds", "adds"), ("Deletes", "deletes")) if slice_def.get(key)]
    return ", ".join(enabled) if enabled else "Read-only"


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    doc = Document()
    doc.core_properties.title = "AppSheet Data Model Reference"
    doc.core_properties.subject = "Money database, OLTP app, and OLAP app data dictionary"
    doc.core_properties.author = "Codex"
    doc.core_properties.keywords = "AppSheet, data model, schema, OLTP, OLAP, slices, virtual columns"
    configure_styles(doc)
    for section in doc.sections:
        configure_section(section)

    # Cover: compact editorial-cover pattern adapted for a technical reference.
    add_para(doc, "GOVERNED MODEL REFERENCE", size=10, bold=True, color=BLUE, after=22, align=WD_ALIGN_PARAGRAPH.CENTER)
    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run("AppSheet Data Model Reference")
    set_font(r, size=28, bold=True, color=NAVY)
    p = doc.add_paragraph(style="Subtitle")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Money database  |  Loan Manager ผู้จัดการสินเชื่อ  |  Loan Business Insights")
    set_font(r, size=13, color=MUTED)
    add_para(doc, "Foundation reference for future development, impact analysis, and governed reporting", size=11, italic=True, color=MUTED, after=24, align=WD_ALIGN_PARAGRAPH.CENTER)
    cover_rows = [
        ("Document status", "Baseline - live configuration inventory"),
        ("Configuration inspected", "29 August 2026 (Asia/Singapore)"),
        ("Database", "Money database - 10 tables"),
        ("OLTP app", f"{data['apps']['oltp']['name']} - 6 loaded tables, 2 slices"),
        ("OLAP app", f"{data['apps']['olap']['name']} - 11 loaded tables, 11 slices"),
        ("External helper", "Calendar Help Table / Sheet1 - loaded only in OLAP"),
    ]
    make_table(doc, ["Control", "Value"], [2700, 11556], cover_rows, font_size=9.3)
    add_para(doc, "", after=8)
    add_callout(doc, "Authority", "The AppSheet Database and live app editors remain authoritative. Update this document in the same change set whenever a table, Ref, physical column, virtual column, formula, or slice changes.")
    doc.add_page_break()

    doc.add_heading("1. Scope and maintenance contract", level=1)
    add_para(doc, "This document records the current structure of the shared operational database, the OLTP Operations app, and the OLAP Reporting app. It is a model inventory and dependency reference; it does not expose production records, borrower documents, bank details, or credentials.")
    doc.add_heading("1.1 Source and confidence", level=2)
    add_label_value(doc, "Live sources inspected", "AppSheet My Apps, Money database, OLTP Data > Columns/Slices, and OLAP Data > Columns/Slices")
    add_label_value(doc, "Evidence basis", "Editor-reported table sources, column types and formulas, slice definitions, Ref targets, and Is a part of? settings")
    add_label_value(doc, "Testing claim", "No live workflow or production-data test was performed; this was a read-only configuration review")
    add_label_value(doc, "Backup status", "Not applicable - no AppSheet or dashboard configuration was changed")
    doc.add_heading("1.2 Required update procedure", level=2)
    for number, (label, text) in enumerate([
        ("Inspect", "Read the affected database table and both app column/slice definitions before editing this file."),
        ("Back up", "For an implementation change, record affected AppSheet version numbers before development, as required by AGENTS.md."),
        ("Update", "Change the component catalog, relationship table, slice catalog, and affected table dictionary in one document revision."),
        ("Verify", "Reconcile physical columns to the source schema, Ref targets to the Type Details panel, and VC formulas to each app."),
        ("Record", "Set the baseline date/status and summarize changed dependencies in the change notes."),
    ], start=1):
        add_label_value(doc, f"Step {number} - {label}", text, after=4)
    add_callout(doc, "Change discipline", "Do not infer payment, delinquency, settlement, or default state from row existence. Preserve auditable posted amounts, reversals/adjustments, due dates, grace rules, and an explicit as-of date.", fill="FFF8E8", color=CAUTION)

    doc.add_heading("2. Architecture overview", level=1)
    component_rows = [
        ("Money database", "Operational system of record", "10 AppSheet Database tables", "Physical keys, stored fields, and referential integrity"),
        ("OLTP Operations", data["apps"]["oltp"]["name"], "6 loaded tables; 2 slices", "Data entry, validation, collection workflow, and lightweight operational indicators"),
        ("OLAP Reporting", data["apps"]["olap"]["name"], "11 loaded tables; 11 slices", "Historical analytics, partner analysis, loan assessment, and curated reporting feeds"),
        ("External helper", "Calendar Help Table / Sheet1", "1 Google Sheets table", "Date-spine calculations for the OLAP loan-assessment model"),
    ]
    make_table(doc, ["Component", "Named asset", "Current scope", "Ownership / purpose"], [2100, 3450, 2350, 6356], component_rows, font_size=8.7)
    add_para(doc, "The OLTP and OLAP apps share the same Money database. Application-specific variance is primarily expressed through which tables are loaded, which VCs exist, and which slices expose curated row/column populations.", after=8)

    oltp_tables = table_map(data["apps"]["oltp"]["tables"])
    olap_tables = table_map(data["apps"]["olap"]["tables"])
    ordered_tables = [t["table"] for t in data["apps"]["olap"]["tables"]]

    doc.add_heading("3. Table catalog", level=1)
    summary_rows = []
    for name in ordered_tables:
        ot = oltp_tables.get(name)
        at = olap_tables.get(name)
        source = "Calendar Help Table / Sheet1" if name == "Calendar" else "Money database"
        source_rows = (at or ot)["rows"]
        physical = sum(1 for r in source_rows if source_kind(name, r) == "Physical")
        oltp_vcs = sum(1 for r in (ot or {}).get("rows", []) if source_kind(name, r) == "VC")
        olap_vcs = sum(1 for r in (at or {}).get("rows", []) if source_kind(name, r) == "VC")
        app_scope = "OLTP + OLAP" if ot and at else ("OLTP only" if ot else "OLAP only")
        summary_rows.append((name, source, app_scope, physical, oltp_vcs, olap_vcs, TABLE_PURPOSES[name]))
    make_table(doc, ["Table", "Source", "Loaded in", "Physical", "OLTP VCs", "OLAP VCs", "Purpose"], [1900, 2050, 1450, 900, 900, 900, 6156], summary_rows, font_size=8.0)
    add_para(doc, "Physical count includes the AppSheet/Sheets row ordinal where exposed. Row ID is the stable key for AppSheet Database tables; Calendar uses Date as its key.", size=8.5, italic=True, color=MUTED, after=8)

    doc.add_heading("4. Relationship model", level=1)
    rel_rows = []
    for rel in data["relationships"]:
        cardinality = f"{rel['toTable']} 1 -> many {rel['fromTable']}"
        behavior = "Child rows are marked part-of parent" if rel["isPartOf"] else "Independent child lifecycle"
        rel_rows.append((rel["fromTable"], rel["column"], rel["toTable"], cardinality, behavior))
    make_table(doc, ["Child table", "Ref column", "Parent table", "Cardinality", "Is a part of?"], [2400, 2300, 2200, 3600, 3756], rel_rows, font_size=8.5)
    add_callout(doc, "Cascade caution", "Is a part of? is enabled for Loans.Ref Borrowers, Charges.Ref Loans, and Repayments.Ref Charges. AppSheet describes these rows as line items and may delete them with the referenced parent; financially material corrections should still use an auditable void, reversal, or adjustment process.", fill="FFF1F0", color=RED)
    add_para(doc, "Reverse relationships such as Related Loans, Related Repayments, Related Cash Pool Contributions, and Related Settlements are VCs generated or configured from these direct Ref links. Their exact formulas appear in the table dictionaries.", after=8)

    doc.add_heading("5. Slice catalog", level=1)
    all_slices = [("OLTP", s) for s in data["apps"]["oltp"]["slices"]] + [("OLAP", s) for s in data["apps"]["olap"]["slices"]]
    slice_summary = []
    for app, s in all_slices:
        slice_summary.append((app, s["name"], s["source"], s["filter"] or "TRUE / all rows", update_mode(s), len(s["columns"]), SLICE_PURPOSES[s["name"]]))
    make_table(doc, ["App", "Slice", "Source", "Row filter", "Mode", "Cols", "Purpose"], [850, 2450, 1650, 3600, 1250, 650, 3806], slice_summary, font_size=7.7)
    doc.add_heading("5.1 Slice column membership", level=2)
    for app, s in all_slices:
        p = doc.add_paragraph(style="Heading 3")
        r = p.add_run(f"{s['name']} ({app})")
        set_font(r, size=11.5, bold=True, color=DARK_BLUE)
        add_label_value(doc, "Source / filter", f"{s['source']} / {s['filter'] or 'TRUE'}", after=2)
        add_label_value(doc, "Update mode", update_mode(s), after=2)
        add_label_value(doc, "Included columns", ", ".join(s["columns"]), after=6)

    doc.add_heading("6. Detailed table dictionaries", level=1)
    add_para(doc, "Each dictionary is the union of the two app definitions. Availability is column-specific. For a shared VC whose formula differs between apps, the Definition cell records both expressions. Physical fields are authoritative source columns; VCs are application calculations.")

    for table_name in ordered_tables:
        doc.add_page_break()
        # Word can place a heading flush against the physical page edge when a
        # short preceding table is followed by a page-break paragraph. Keep a
        # small spacer before the final Statistics dictionary so the running
        # header and top margin render consistently.
        if table_name == "Statistics":
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_after = Pt(2)
            spacer.paragraph_format.line_spacing = Pt(2)
        doc.add_heading(f"6.{ordered_tables.index(table_name)+1} {table_name}", level=2)
        ot = oltp_tables.get(table_name)
        at = olap_tables.get(table_name)
        om = col_map(ot)
        am = col_map(at)
        order = []
        for table in (at, ot):
            if table:
                for row in table["rows"]:
                    if row["name"] not in order:
                        order.append(row["name"])
        source = "Calendar Help Table / Sheet1 (Google Sheets)" if table_name == "Calendar" else f"Money database / {table_name} (AppSheet Database)"
        apps = "OLTP + OLAP" if ot and at else ("OLTP only" if ot else "OLAP only")
        add_label_value(doc, "Source", source, after=2)
        add_label_value(doc, "Loaded in", apps, after=2)
        add_label_value(doc, "Purpose", TABLE_PURPOSES[table_name], after=5)
        rows = []
        for name in order:
            orow = om.get(name)
            arow = am.get(name)
            example = arow or orow
            kind = source_kind(table_name, example)
            otype = orow.get("type") if orow else None
            atype = arow.get("type") if arow else None
            col_type = atype or otype or ""
            type_text = f"{kind} / {col_type}"
            if orow and arow and otype != atype:
                type_text = f"{kind} / OLTP {otype}; OLAP {atype}"
            flags = []
            if (orow or {}).get("key") or (arow or {}).get("key"):
                flags.append("Key")
            if (orow or {}).get("label") or (arow or {}).get("label"):
                flags.append("Label")
            formula = compact_formula((arow or orow).get("formula"))
            purpose = column_purpose(name, kind, col_type, formula)
            definition = definition_for(table_name, orow, arow)
            rows.append((name, type_text, availability(orow, arow), ", ".join(flags) or "-", purpose, definition))
        table = make_table(doc, ["Column", "Kind / type", "Availability", "Flags", "Purpose", "Definition / expression"], [2400, 1800, 1450, 850, 3500, 4256], rows, font_size=7.2)
        # Make expression column slightly smaller and preserve long formulas without fixed heights.
        for row in table.rows[1:]:
            for idx in range(6):
                for run in row.cells[idx].paragraphs[0].runs:
                    set_font(run, size=6.7 if idx == 5 else 7.2, color=INK)

    doc.add_page_break()
    doc.add_heading("7. Known implications and follow-up checks", level=1)
    implication_rows = [
        ("OLTP/OLAP variance", "Shared physical tables have materially different VC layers. Changes to a shared field must be reviewed in both app dictionaries even when only one app appears to use it."),
        ("Reporting ownership", "OLAP-only VCs and Reporting * slices are the preferred governed feed surface. Do not move their heavy aggregation into OLTP without a performance assessment."),
        ("Calendar source", "Calendar is not in Money database. Its key/date population and refresh behavior depend on Calendar Help Table / Sheet1 and must be checked separately."),
        ("Slice comments", "All inspected slice descriptive-comment fields were blank. This document supplies purposes, but future changes should also populate AppSheet descriptive comments where practical."),
        ("Delete permissions", "OLTP Payment Collection currently permits updates, adds, and deletes. Any production correction to financial rows should remain auditable and avoid routine physical deletion."),
        ("Dashboard reconciliation", "Reporting slice totals should be reconciled to their governed base grains and refresh cutoff before Looker Studio changes are accepted."),
    ]
    make_table(doc, ["Area", "Implication"], [2700, 11556], implication_rows, font_size=9.0)
    doc.add_heading("7.1 Manual validation checklist for the baseline", level=2)
    for label, text in [
        ("Schema", "Confirm the Money database still reports 10 tables and that each physical field matches the detailed dictionary."),
        ("Relationships", "Open every listed Ref Type Details panel and confirm source table plus Is a part of? state."),
        ("App variance", "Confirm the OLTP and OLAP column counts shown at each table heading match this document."),
        ("Slices", "Confirm row filters, included-column order, and update mode for all 13 slices."),
        ("Permissions", "Verify reporting slices remain read-only and operational update access matches intended roles."),
        ("Financial logic", "Sample posted, partial, fully paid, overdue, reversed/adjusted, and defaulted scenarios against the documented VC dependencies."),
        ("Reconciliation", "Reconcile OLAP Reporting slice totals to Money database at a defined as-of time before dashboard use."),
    ]:
        add_label_value(doc, label, text, after=4)

    # Accessibility and table behavior.
    for table in doc.tables:
        for cell in table.rows[0].cells:
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_pr.append(OxmlElement("w:tblHeader"))
    for paragraph in doc.paragraphs:
        paragraph.paragraph_format.widow_control = True

    doc.save(OUTPUT)
    print(str(OUTPUT))


if __name__ == "__main__":
    main()
