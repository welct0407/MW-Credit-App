"""Read-only XLSX native-feature comparison against the private release backup."""
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

baseline = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/core-promotion-20260915/dictionary-before.xlsx')
current = Path('Documents/AppSheet_Data_Dictionary.xlsx')
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
tags = ['f', 'mergeCell', 'dataValidation', 'conditionalFormatting', 'tablePart', 'drawing', 'hyperlink', 'pane', 'sheetProtection', 'autoFilter']

def inspect(path):
    with ZipFile(path) as z:
        root = ET.fromstring(z.read('xl/workbook.xml'))
        names = [e.attrib['name'] for e in root.findall('m:sheets/m:sheet', ns)]
        result = []
        for i, name in enumerate(names, 1):
            sheet = ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
            result.append({tag: [ET.tostring(e, encoding='unicode') for e in sheet.findall(f'.//m:{tag}', ns)] for tag in tags})
        extras = {n: z.read(n) for n in z.namelist() if n.startswith(('xl/charts/', 'xl/pivotTables/', 'xl/externalLinks/'))}
        return names, result, extras

old, new = inspect(baseline), inspect(current)
assert old[0] == new[0], 'Sheet names/order changed'
assert old[1] == new[1], 'Native worksheet feature changed'
assert old[2] == new[2], 'Native chart/pivot/external link changed'
evidence = {'sheetCount': len(new[0]), 'sheetNamesOrderPreserved': True, 'nativeFeaturesPreserved': tags, 'chartPivotExternalPartsPreserved': True, 'scope': 'Native XML feature definitions compared, not just counts; workbook contents separately round-tripped with Artifact Tool.'}
Path('outputs/core-promotion-20260915/dictionary-native-features.json').write_text(json.dumps(evidence, indent=2)+'\n', encoding='utf-8')
print(json.dumps(evidence))
