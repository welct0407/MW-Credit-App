"""Local-only V70 GUI fixture/date/key rehearsal; never uses DEV transport."""
import argparse
import tempfile
import hashlib
import json
from datetime import date
from pathlib import Path
import psycopg
import R051UiAdditionalFixtures as fixtures
import ReceiptCorrectionDev as transport


def run(port,data_directory):
    class GuardProbe:
        def __init__(self,identity,version):self.answers=iter([identity,version])
        def execute(self,*args):self.answer=next(self.answers);return self
        def fetchone(self):return self.answer
    for identity,version in [(('loan_manager_prod','postgres'),('70',124258995)),(('loan_manager_dev','postgres'),('69',245428688)),(('loan_manager_dev','postgres'),('70',124258996))]:
        for verify in (fixtures.verify_target,transport.verify_ui_fixture_target):
            try:verify(GuardProbe(identity,version))
            except ValueError:pass
            else:raise AssertionError('Wrong target/version/checksum accepted')
    for verify in (fixtures.verify_target,transport.verify_ui_fixture_target):
        verify(GuardProbe(('loan_manager_dev','postgres'),('70',124258995)))
    assert not fixtures.private_state_path_allowed(Path(fixtures.__file__).resolve().parents[2]/'private.json')
    with tempfile.TemporaryDirectory(prefix='r051-state-classification-') as d:
        private=Path(d);assert fixtures.private_state_path_allowed(private/'state.json')
        (private/'.git').mkdir();assert fixtures.private_state_path_allowed(private/'state.json')
        (private/'.git/HEAD').write_text('ref: refs/heads/test\n');assert not fixtures.private_state_path_allowed(private/'state.json')
    with psycopg.connect(host='127.0.0.1',port=port,dbname='postgres',user='postgres',connect_timeout=5) as c:
        if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=data_directory.resolve():
            raise ValueError('Expected exact private local cluster')
        assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('postgres','127.0.0.1')
        assert c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==('70',124258995)
        c.rollback()
        # Production guard correctly rejects this private postgres database.
        try:fixtures.verify_target(c)
        except ValueError as e:assert str(e)=='DEV identity mismatch'
        else:raise AssertionError('Private database accepted as DEV')
        c.rollback()
        fixtures.setup(c,readonly=True)
        for timestamp,expected in [('2026-10-05T16:59:59+00:00',date(2026,10,5)),('2026-10-05T17:00:00+00:00',date(2026,10,6))]:
            assert c.execute("SELECT (%s::timestamptz AT TIME ZONE current_setting('TimeZone'))::date",[timestamp]).fetchone()[0]==expected
        c.rollback()
        c.execute("SET LOCAL timezone='UTC'");before=transport.fingerprints(c);c.rollback()
        # Local-only alternate namespace preserves copied current GUI fixture rows.
        fixtures.PREFIX='LOCAL-R051-UI-'
        real_insert=fixtures.insert
        def local_insert(connection,table,values):
            values=dict(values)
            if table=='Cash Accounts':values['Account Label']='LOCAL '+values['Account Label']
            return real_insert(connection,table,values)
        fixtures.insert=local_insert
        results=[]
        for batch in fixtures.BATCHES:
            try:
                fixtures.setup(c)
                pre=fixtures.preflight(c,batch)
                assert pre['version']==70 and pre['timezone']=='Asia/Bangkok'
                original_accounts={table:c.execute('SELECT to_jsonb(t) FROM "'+table+'" t ORDER BY "Row ID"').fetchall() for table in ('Cash Accounts','Cash Holders')} if batch=='REIMBURSE' else None
                seeded=fixtures.seed(c,batch)
                for table,keys in pre['plan']['source_keys'].items():
                    assert sorted(fixtures.keys(seeded,table))==sorted(keys),(batch,table)
                assert not any(r['Auto Charge Enabled'] for r in seeded['Loans'])
                if batch in ('DAILY','DEFAULT','PREPARED'):
                    assert all(r['Interest Payment Interval']==1 and r['Interest Schedule Anchor Date'] is None for r in seeded['Loans'])
                for table,field,plan_key in [('Loans','Loan Date','loan'),('Charges','Charge Date','charge'),('Payments','Payment Date','payment'),('Repayments','Payment Date','repayment'),('Business Expenses','Expense Date','expense')]:
                    if plan_key not in pre['plan']['dates']:continue
                    exact_key=fixtures.ids(batch)['charge'] if table=='Charges' else None
                    for row in seeded[table]:
                        if exact_key and row['Row ID']!=exact_key:continue
                        assert row[field]==pre['plan']['dates'][plan_key],(batch,table,field)
                if batch=='DAILY':
                    assert next(r for r in seeded['Charges'] if r['Row ID']==fixtures.ids(batch)['later'])['Charge Date']==pre['plan']['dates']['later_charge']
                if batch=='PARTNER-A':
                    assert not seeded['Cash Pool Contributions'] and not seeded['Settlements']
                    assert all(not row.get('Email') and not row.get('Login Email') and not row.get('IG Integration Enabled') for row in seeded['Partners'])
                if batch=='REIMBURSE':
                    i=fixtures.ids(batch);key=i['root']+'-LOCAL-R'
                    def add():
                        c.execute('INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense") VALUES(%s,current_date,\'Expense Reimbursement\',5,\'ch:lisa\',\'ch:tommy\',%s,%s,%s)',[key,i['lisa'],i['tommy'],i['expense']])
                    add()
                    c.execute('UPDATE "Cash Ledger" SET "Amount"=6 WHERE "Row ID"=%s',[key])
                    c.execute('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s WHERE "Row ID"=%s',[i['tommy2'],i['expense']])
                    assert c.execute('SELECT "Amount"=6 AND "Ref To Cash Account"=%s FROM "Cash Ledger" WHERE "Row ID"=%s',[i['tommy'],key]).fetchone()[0]
                    protected_before={t:c.execute('SELECT to_jsonb(x) FROM "'+t+'" x ORDER BY "Row ID"').fetchall() for t in ('Business Expenses','Cash Ledger')}
                    for query,args in [('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s, "Ref Paid By Cash Holder"=\'ch:tommy\' WHERE "Row ID"=%s',[i['lisa'],i['expense']]),('UPDATE "Business Expenses" SET "Amount"=0::money WHERE "Row ID"=%s',[i['expense']])]:
                        try:
                            with c.transaction():c.execute(query,args)
                        except psycopg.Error as e:assert 'Correct linked reimbursement' in str(e)
                        else:raise AssertionError('Linked invariant accepted invalid source')
                        assert {t:c.execute('SELECT to_jsonb(x) FROM "'+t+'" x ORDER BY "Row ID"').fetchall() for t in protected_before}==protected_before
                    c.execute('UPDATE "Cash Ledger" SET "Ref Business Expense"=%s WHERE "Row ID"=%s',[i['expense2'],key])
                    c.execute('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s, "Ref Paid By Cash Holder"=\'ch:tommy\' WHERE "Row ID"=%s',[i['lisa'],i['expense']])
                    assert c.execute('SELECT count(*)=1 AND bool_and("Ref From Cash Account"=%s AND "Ref From Cash Holder"=\'ch:lisa\') FROM "Cash Ledger" WHERE "Row ID"=%s',[i['lisa'],'cash:EXPENSE:'+i['expense']]).fetchone()[0]
                    assert c.execute('SELECT "Ref Paid By Cash Holder"=\'ch:lisa\' FROM "Business Expenses" WHERE "Row ID"=%s',[i['expense']]).fetchone()[0]
                    c.execute('DELETE FROM "Cash Ledger" WHERE "Row ID"=%s',[key])
                    assert c.execute('SELECT count(*) FROM "Cash Ledger" WHERE "Row ID"=%s',[key]).fetchone()[0]==0
                    c.execute('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s WHERE "Row ID"=%s',[i['tommy2'],i['expense']]);add()
                    # Cleanup must delete captured independent reimbursement before its expense.
                    seeded=fixtures.readback(c,batch)
                fixtures.cleanup(c,batch,{table:fixtures.keys(seeded,table) for table in seeded})
                assert not any(fixtures.readback(c,batch).values())
                if original_accounts is not None:
                    assert {table:c.execute('SELECT to_jsonb(t) FROM "'+table+'" t ORDER BY "Row ID"').fetchall() for table in original_accounts}==original_accounts
                results.append({'batch':batch,'passed':True,'plan':pre['plan']})
            finally:c.rollback()
            c.execute("SET LOCAL timezone='UTC'");assert transport.fingerprints(c)==before;c.rollback()
        # Rehearse the original scripts with a separate local-only namespace.
        # Copied live GUI rows, including unknown generated receipt IDs, stay intact.
        original_prefix='LOCAL-R051-ORIGINAL-'
        try:
            fixtures.setup(c)
            for filename in ('R051-UiFixtures.sql','R051-UiCleanup.sql'):
                body=(Path(__file__).parent/filename).read_text().replace('SYN-R051-UI-',original_prefix).replace('SYNTHETIC R051 UI','LOCAL R051 ORIGINAL')
                c.execute(body)
                if filename=='R051-UiFixtures.sql':
                    assert c.execute('SELECT count(*) FROM "Payments" WHERE "Row ID"=ANY(%s) AND "Status"=\'Posted\' ',[[original_prefix+'P1',original_prefix+'P2']]).fetchone()[0]==2
                    assert c.execute('SELECT count(*) FROM "Cash Ledger" WHERE "Ref Loan"=ANY(%s)',[[original_prefix+'L1',original_prefix+'L2']]).fetchone()[0]==2
            for table in ('Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Business Expenses','Cash Ledger','Cash Accounts','Cash Account Daily Analytics'):
                assert c.execute('SELECT count(*) FROM "'+table+'" t WHERE row_to_json(t)::text LIKE %s',['%'+original_prefix+'%']).fetchone()[0]==0,table
        finally:c.rollback()
        c.execute("SET LOCAL timezone='UTC'");assert transport.fingerprints(c)==before;c.rollback()
        fixtures.insert=real_insert
        return {'passed':True,'scope':'LOCAL restored V70; seven additional workflows plus original seed/readback/exact cleanup rolled back; no DEV access',
                'original_fixture_scripts':{'seed_readback_cleanup_passed':True,'derived_account_snapshots_removed':True,'copied_current_gui_rows_preserved':True,'live_generated_key_cleanup_ready':False},
                'explicit_old_holder_payload':{'unlinked_cross_holder_derived':True,'linked_cross_holder_rejected_full_source_cash_preserved':True},'strict_identity_version_checksum_cases':8,'private_state_path_cases':4,'bangkok_midnight_boundary_cases':2,'table_fingerprints_unchanged':len(before),'batches':results,
                'fixture_script_sha256':hashlib.sha256(Path(fixtures.__file__).read_bytes()).hexdigest()}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,required=True)
    p.add_argument('--data-directory',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();result=run(a.port,a.data_directory)
    a.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='batches'},indent=2))
