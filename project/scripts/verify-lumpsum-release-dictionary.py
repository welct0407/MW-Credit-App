"""Read-only verification of intended release cells and workbook preservation."""
import copy, json, sys
from pathlib import Path
import openpyxl
root=Path(__file__).resolve().parents[1]
stage='production' if '--production' in sys.argv else 'development'
out=root/'outputs/lumpsum-promotion-20260915'
changes=json.loads((out/f'dictionary-changes-{stage}.json').read_text())['changes']
allowed={(c['sheet'],c['row']) for c in changes}
a=openpyxl.load_workbook(f'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-promotion-20260915/dictionary-before-{stage}.xlsx')
b=openpyxl.load_workbook(root/'Documents/AppSheet_Data_Dictionary.xlsx')
assert a.sheetnames==b.sheetnames
assert list(a.defined_names)==list(b.defined_names)
count=0
for name in a.sheetnames:
    x,y=a[name],b[name]
    for attr in ['freeze_panes','auto_filter','protection']:
        assert getattr(x,attr)==getattr(y,attr),(name,attr)
    assert list(x.tables)==list(y.tables)
    assert len(x._charts)==len(y._charts)
    assert str(x.merged_cells)==str(y.merged_cells)
    assert str(x.data_validations)==str(y.data_validations)
    for row in x:
        for cell in row:
            target=y[cell.coordinate]
            if (name,cell.row) not in allowed:
                assert cell.value==target.value,(name,cell.coordinate,'value')
                assert cell.data_type==target.data_type,(name,cell.coordinate,'type')
            for attr in ['font','fill','border','alignment','number_format','protection']:
                assert copy.copy(getattr(cell,attr))==copy.copy(getattr(target,attr)),(name,cell.coordinate,attr)
            count+=1
result=dict(stage=stage,sheets=len(a.sheetnames),existingCellsChecked=count,unrelatedValuesAndStylesPreserved=True,nativePropertiesPreserved=True)
(out/f'dictionary-native-verification-{stage}.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
