"""Bounded synthetic assessment setup/readback for the GUI-created VM borrower."""
import json
import sys
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

mode = sys.argv[1]
assert mode in ('seed', 'verify', 'cleanup')
root = Path(__file__).resolve().parents[2]
target = json.loads((root / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
private = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r051-receipt-corrections')
borrower = json.loads((private / 'vm01-optional-borrower.json').read_text())
assert borrower['Row ID'] == 'C6dHbB4yx2sneL4Xy9AO8x' and borrower['Borrower Name'] == 'SYNTHETIC R051 OPTIONAL ASSESSMENT'
assert borrower['AI Collection Enabled'] is False and not borrower['Instagram Username']
state_path = private / 'vm01-optional-assessments.json'
tables = {'Loan Assessment': 'SYN-R051-VM-OPTIONAL-OLD', 'Loan Assessment SQL Lab': 'SYN-R051-VM-OPTIONAL-LAB'}
with psycopg.connect(host=target['host'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    c.execute("SET LOCAL timezone='Asia/Bangkok'")
    c.execute("SET LOCAL statement_timeout='30s'")
    c.execute("SET LOCAL lock_timeout='3s'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone() == ('loan_manager_dev', target['host'])
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    if mode == 'seed':
        assert not state_path.exists(), 'Prior attempt exists; reconcile before retry'
        assert c.execute('SELECT "AI Collection Enabled","Instagram Username" FROM "Borrowers" WHERE "Row ID"=%s AND "Borrower Name"=%s', [borrower['Row ID'], borrower['Borrower Name']]).fetchone() == (False, None)
        state_path.write_text(json.dumps({'outcome': 'pending', 'borrower': borrower['Row ID']}))
        for table, key in tables.items():
            c.execute(sql.SQL('INSERT INTO public.{}("Row ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate") VALUES(%s,%s,100::money,0.1)').format(sql.Identifier(table)), [key, borrower['Row ID']])
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        before = {table: c.execute(sql.SQL('SELECT to_jsonb(t) FROM public.{} t WHERE "Row ID"=%s').format(sql.Identifier(table)), [key]).fetchone()[0] for table, key in tables.items()}
        state_path.write_text(json.dumps({'outcome': 'pending', 'before': before}, indent=2, default=str))
        c.commit()
        state_path.write_text(json.dumps({'outcome': 'committed', 'before': before}, indent=2, default=str))
        print(json.dumps({'seeded': tables, 'borrower': borrower['Row ID']}))
    else:
        before = json.loads(state_path.read_text())['before']
        assert not c.execute('SELECT 1 FROM "Borrowers" WHERE "Row ID"=%s', [borrower['Row ID']]).fetchone(), 'GUI borrower deletion not complete'
        for table, key in tables.items():
            actual = c.execute(sql.SQL('SELECT to_jsonb(t) FROM public.{} t WHERE "Row ID"=%s').format(sql.Identifier(table)), [key]).fetchone()[0]
            assert actual['Ref Borrower'] is None
            expected = dict(before[table], **{'Ref Borrower': None})
            assert actual == expected, 'Assessment snapshot differs'
            if mode == 'cleanup':
                c.execute(sql.SQL('DELETE FROM public.{} WHERE "Row ID"=%s AND "Ref Borrower" IS NULL').format(sql.Identifier(table)), [key])
        c.commit() if mode == 'cleanup' else c.rollback()
        print(json.dumps({'borrower_absent': True, 'two_assessment_snapshots_retained_exactly': True, 'synthetic_assessments_cleaned': mode == 'cleanup'}))
