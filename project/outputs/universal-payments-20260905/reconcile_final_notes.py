from pathlib import Path
import shutil

root = Path(__file__).parent
project = root.parents[1]
overview = project / 'Documents/AppSheet_Data_Model_Overview.md'
s = overview.read_text(encoding='utf-8')
s = s.replace('snapshot. duplicate charge allocations', 'snapshot. Duplicate charge allocations')
s = s.replace('Borrower cascade and loan/charge deletion interactions still require testing.', 'Borrower cascade passed after completed sync in T034. Loan/charge delete guards were configured to retain referenced allocation targets; further deletion edge cases remain in the coverage matrix.')
s = s.replace('broader regressions, borrower cascade, competing submissions, permissions and offline behavior remain pending.', 'borrower cascade passed after completed sync and the sequential pending-receipt guard passed. Broader regressions, simultaneous submissions, permissions and offline behavior remain pending.')
overview.write_text(s, encoding='utf-8')

log = project / 'Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md'
s = log.read_text(encoding='utf-8').replace('Native Undo is the immediate grid recovery mechanism; these unlinked empty rows are not production migration data.', 'These unlinked empty rows are not production migration data. No grid undo recovery was verified; disposable blank rows can be recreated if needed.')
log.write_text(s, encoding='utf-8')

report = root / 'functional-test-results.md'
s = report.read_text(encoding='utf-8')
s = s.replace('Pass for Payments→Payment Allocations cascade; borrower cascade remains pending', 'Pass for Payments→Payment Allocations cascade; borrower cascade subsequently passed in T034')
s = s.replace('## Later executed scenarios and open cascade defect (September 6)', '## Later executed scenarios (September 6)')
s = s.replace('| T034 Borrower full cascade | Deleted B through normal Visible Borrowers detail. Old branch deleted including three repayments (448→445), but two Posted receipts and three PAs remained with orphan references and no repayments | **FAIL; investigation pending; borrower-cascade requirement not complete** |', '| T034 Borrower full cascade | Deleted B through normal Visible Borrowers detail. An intermediate sync check still showed two receipts and three allocations; after completed sync both branches were absent, including three repayments (448→445). A control records remained. No configuration fix required | **Pass after completed sync; initial FAIL label corrected** |')
s = s.replace('Orphan receipts/allocations are retained temporarily for diagnosis; see TEST-009 in authoritative change log. Four blank records in each new table also remain pending cleanup. Borrower A evidence retained.', 'The temporary intermediate references subsequently disappeared after sync; see the completed-sync correction to TEST-009. Four blank records in each new table were removed in T035. Borrower A evidence is retained.')
s = s.replace('Still incomplete: borrower cascade correction/retest; multi-allocation partial-posting fault,', 'Still incomplete: multi-allocation partial-posting fault,')
s = s.replace('The initial Payments and Payment Allocations tables each contain four actual blank records created with the native table, rather than purely visual placeholders. Payments displays their keys in the app. Cleanup is pending; they are confined to the new clone tables.', 'The initial Payments and Payment Allocations tables each contained four actual blank starter records. T035 subsequently removed all eight.')
report.write_text(s, encoding='utf-8')

shutil.copy2(root / 'AppSheet_Data_Dictionary.xlsx', project / 'Documents/AppSheet_Data_Dictionary.xlsx')
print('Published verified v1.000065 workbook and reconciled current status prose.')
