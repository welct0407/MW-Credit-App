"""Read-only XLSX scope check against the pre-task Git version."""
import io
import json
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'ce6f6114da6b9c9fbe078a46fe12085cc1c475c3'
old = zipfile.ZipFile(io.BytesIO(subprocess.check_output(
    ['git', 'show', f'{BASE}:Documents/AppSheet_Data_Dictionary.xlsx'], cwd=ROOT)))
new = zipfile.ZipFile(ROOT / 'Documents/AppSheet_Data_Dictionary.xlsx')
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
assert set(old.namelist()) == set(new.namelist()), 'Package parts changed'
assert old.read('xl/styles.xml') == new.read('xl/styles.xml'), 'Style definitions changed'

def normalized(xml, target=False):
    root = ET.fromstring(xml)
    for el in root.iter():
        # Export regenerates relationship ids. Targets are checked separately.
        el.attrib.pop(R + 'id', None)
        if target and el.tag == M + 'row' and el.get('r') == '215':
            el.attrib.pop('ht', None)
            el.attrib.pop('customHeight', None)
        if target and el.tag == M + 'c' and el.get('r') in {f'{c}215' for c in 'ABCDEFGH'}:
            el.attrib.pop('s', None)
        if target and el.tag == M + 'c' and el.get('r') in {'F215', 'G215', 'H215'}:
            for child in list(el):
                el.remove(child)
    return ET.tostring(root)

sheet_parts = [p for p in old.namelist() if p.startswith('xl/worksheets/sheet') and p.endswith('.xml')]
for part in sheet_parts:
    assert normalized(old.read(part), part == 'xl/worksheets/sheet3.xml') == normalized(new.read(part), part == 'xl/worksheets/sheet3.xml'), f'Unexpected worksheet change: {part}'
for part in old.namelist():
    if part.endswith('.rels'):
        def targets(z):
            return sorted((x.get('Type'), x.get('Target'), x.get('TargetMode', '')) for x in ET.fromstring(z.read(part)))
        assert targets(old) == targets(new), f'Relationship targets changed: {part}'
assert normalized(old.read('xl/workbook.xml')) == normalized(new.read('xl/workbook.xml')), 'Workbook structure changed'
report = {'worksheetCount': len(sheet_parts), 'onlyAllowedChanges': ['Columns!F215:H215 values', 'Columns row 215 height and wrapping'], 'styleDefinitionsIdentical': True, 'relationshipTargetsUnchanged': True, 'workbookStructureUnchanged': True}
dest = ROOT / 'outputs/loan-duration-visibility-20260911/xlsx-scope-verification.json'
dest.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
