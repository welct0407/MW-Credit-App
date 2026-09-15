"""Read-only OOXML preservation check for the V10 dictionary update."""
import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

baseline = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/default-loan-20260915/dictionary-before.xlsx')
current = Path('Documents/AppSheet_Data_Dictionary.xlsx')
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
features = ('f', 'mergeCell', 'dataValidation', 'conditionalFormatting', 'tablePart', 'drawing', 'hyperlink', 'pane')

def inspect(path):
    with ZipFile(path) as archive:
        sheets = {}
        for name in archive.namelist():
            if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                root = ET.fromstring(archive.read(name))
                sheets[name] = {tag: [ET.tostring(e, encoding='unicode') for e in root.findall('.//s:' + tag, ns)] for tag in features}
        names = [e.attrib['name'] for e in ET.fromstring(archive.read('xl/workbook.xml')).findall('.//s:sheet', ns)]
        return names, sheets

before_names, before = inspect(baseline)
after_names, after = inspect(current)
assert before_names == after_names, 'Worksheet names/order changed'
assert before == after, 'Existing native worksheet features changed'
result = {'sheetCount': len(after), 'sheetNamesOrderPreserved': True,
          'nativeFeaturesPreserved': list(features), 'allFormulaCounts': [len(v['f']) for v in after.values()]}
Path('outputs/default-loan-20260915/dictionary-native-features.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
