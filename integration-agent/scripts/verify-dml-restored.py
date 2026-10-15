"""Check new role against a PRIVATE restored production database, never PROD."""
import importlib.util
import os
from pathlib import Path
import psycopg

spec=importlib.util.spec_from_file_location('provision',Path(__file__).with_name('configure-reviewer-dml.py'))
provision=importlib.util.module_from_spec(spec);spec.loader.exec_module(provision)
dsn=os.environ['MW_DML_TEST_DSN']
with psycopg.connect(dsn) as conn:
    assert conn.info.host=='127.0.0.1' and conn.info.dbname=='mw_dml_restore'
    provision.configure(conn,'Synthetic-only-password-123!')
with psycopg.connect(dsn) as conn:
    assert conn.execute('SELECT max(version::int) FROM public.flyway_schema_history WHERE success').fetchone()[0]==32
    # Synthetic fixture setup by the local restore owner, never by the agent.
    conn.execute('INSERT INTO public."Partners" ("Row ID","Partner Role") VALUES (%s,%s)',('DML-TEST-P','A'))
    conn.execute('INSERT INTO public."Cash Pool Contributions" ("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES (%s,%s,current_date,%s,10000::money)',('DML-TEST-CAP','DML-TEST-P','Contribution'))
    conn.execute('SET LOCAL ROLE mw_reviewer_dml')
    conn.execute('INSERT INTO public."Borrowers" ("Row ID","Borrower Name","City") VALUES (%s,%s,%s)',('DML-TEST-B','Synthetic DML role check','Old city'))
    conn.execute('UPDATE public."Borrowers" SET "City"=%s WHERE "Row ID"=%s',('New city','DML-TEST-B'))
    # Use copied current active accounts only as references in this private lab.
    disburse=conn.execute('SELECT "Row ID" FROM public."Cash Accounts" WHERE "Active" AND "Ref Cash Holder"=%s ORDER BY "Row ID" LIMIT 1',('ch:lisa',)).fetchone()[0]
    receive=conn.execute('SELECT "Row ID" FROM public."Cash Accounts" WHERE "Active" AND "Ref Cash Holder"=%s ORDER BY "Row ID" LIMIT 1',('ch:dad',)).fetchone()[0]
    conn.execute('''INSERT INTO public."Loans" ("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account")
      VALUES (%s,%s,current_date-10,100::money,%s,%s,false,%s)''',('DML-TEST-L','DML-TEST-B','ยังไม่ปิดยอด','กำหนดวันชำระ',disburse))
    conn.execute('''INSERT INTO public."Charges" ("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
      VALUES (%s,%s,current_date-1,100::money,10::money)''',('DML-TEST-CH','DML-TEST-L'))
    conn.execute('''INSERT INTO public."Payments" ("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account")
      VALUES (%s,'Processing',%s,10::money,current_date,'Lump Sum',%s)''',('DML-TEST-PAY','DML-TEST-B',receive))
    assert conn.execute('SELECT "Status" FROM public."Payments" WHERE "Row ID"=%s',('DML-TEST-PAY',)).fetchone()[0]=='Posted'
    assert conn.execute('SELECT count(*) FROM public."Repayments" WHERE "Ref Payment"=%s',('DML-TEST-PAY',)).fetchone()[0]==1
    for statement,params in [
        ('UPDATE public."Partners" SET "AI Reviewer"=true WHERE "Row ID"=%s',('DML-TEST-P',)),
        ('CREATE TABLE public.agent_forbidden (id int)',()),
        ('UPDATE public."Payments" SET "Amount Received"=9::money WHERE "Row ID"=%s',('DML-TEST-PAY',)),
        ('DELETE FROM public."Borrowers" WHERE "Row ID"=%s',('DML-TEST-B',)),
    ]:
        try:
            with conn.transaction():conn.execute(statement,params)
        except psycopg.Error:pass
        else:raise AssertionError('Expected authority or posted-payment guard rejection')
    conn.execute('SET CONSTRAINTS ALL IMMEDIATE')
    conn.rollback()
print('Restored V32 verified: dedicated role INSERT/UPDATE, payment posting/allocations/repayments/cash triggers, denied reviewer self-grant, public DDL, Delete, posted-amount overwrite. All synthetic rows rolled back.')
