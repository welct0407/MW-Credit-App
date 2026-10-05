"""One coordinated, rollback-only DEV V65 receipt-action acceptance check.

No disposable funding, role, trigger or schema changes. Additional GUI namespaces
must still be empty; no seeded GUI source is edited/deleted by this test.
"""
import json
import uuid
from pathlib import Path
import psycopg
import ReceiptCorrectionDev as transport
import R051UiAdditionalFixtures as fixtures


def run(window_reference):
    if not window_reference:
        raise ValueError("Coordinated DEV write-window reference required")
    result={'passed':False,'database':'loan_manager_dev','expected_version':65,'window_reference':window_reference,'application_name':'r051-v65-delete-'+uuid.uuid4().hex}
    def check(c,params):
        if c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]!=65:
            raise ValueError('Expected applied/tested V65 before live acceptance')
        c.execute("SET LOCAL timezone='UTC'")
        before=transport.fingerprints(c);c.rollback()
        fixtures.setup(c)
        c.execute("SELECT set_config('application_name',%s,true)",[result['application_name']])
        def reject(query,args,expected):
            try:
                with c.transaction(): c.execute(query,args)
            except psycopg.Error as error:
                if expected not in str(error): raise
            else: raise AssertionError('Expected '+expected)
        try:
            for batch in ('DAILY','CLOSE','PREPARED','DEFAULT'):
                seeded=fixtures.seed(c,batch);i=fixtures.ids(batch)
                if batch=='DEFAULT':
                    fixtures.payment(c,i,i['payment'],1,c.execute('SELECT current_date').fetchone()[0])
                    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[i['loan']])
                    c.execute('UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"=%s WHERE "Row ID"=%s',['synthetic-r051-v65',i['loan']])
                    reject('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s',[i['payment']],'later loan default')
                    assert c.execute('SELECT NOT "Delete Requested" FROM "Payments" WHERE "Row ID"=%s',[i['payment']]).fetchone()[0]
                    continue
                reject('DELETE FROM "Payment Allocations" WHERE "Ref Payment"=%s',[i['payment']],'immutable')
                reject('UPDATE "Payments" SET "Delete Requested"=true,"Notes"=%s WHERE "Row ID"=%s',['mixed',i['payment']],'separate action')
                returning=c.execute('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s RETURNING "Row ID","Delete Requested"',[i['payment']]).fetchall()
                assert returning==[(i['payment'],True)]
                c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                assert c.execute('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s',[i['payment']]).rowcount==0
                for table in ('Payments','Payment Allocations','Repayments','Cash Ledger'):
                    from psycopg import sql
                    column='Row ID' if table=='Payments' else 'Ref Payment'
                    assert c.execute(sql.SQL('SELECT count(*) FROM {} WHERE {}=%s').format(sql.Identifier(table),sql.Identifier(column)),[i['payment']]).fetchone()[0]==0
                assert c.execute('SELECT "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"=%s',[i['loan']]).fetchone()[0]
                if batch=='DAILY':
                    assert c.execute('SELECT "Interest Due"::numeric=9 FROM "Charges" WHERE "Row ID"=%s',[i['later']]).fetchone()[0]
                if batch=='CLOSE':
                    assert not fixtures.readback(c,batch)['Business Expenses']
                if batch=='PREPARED':
                    assert c.execute('SELECT "Principal Due"::numeric=100 AND "Interest Due"::numeric=10 FROM "Charges" WHERE "Row ID"=%s',[i['charge']]).fetchone()[0]
                    assert c.execute('SELECT "Posted Amount"=10 FROM "Payments" WHERE "Row ID"=%s',[i['first']]).fetchone()[0]
            result['functional_checks']='passed'
        except Exception as error:
            result['error_type']=type(error).__name__
            result['error']=str(error)
        finally:
            c.rollback()
        c.execute("SET LOCAL timezone='UTC'")
        after=transport.fingerprints(c);c.rollback()
        result['table_fingerprints_compared']=len(before)
        result['fingerprints_unchanged']=before==after
        result['passed']='error' not in result and before==after
        return result
    answer=transport.dev_connection(check)
    (transport.REPO/'outputs/r051-receipt-corrections/dev-receipt-delete-v65.json').write_text(json.dumps(answer,indent=2)+'\n')
    if not answer['passed']:
        raise RuntimeError('DEV receipt-delete checks failed; recorded rollback/fingerprint outcome must be reconciled')
    return answer


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--window-reference',required=True)
    args=p.parse_args()
    print(json.dumps(run(args.window_reference),indent=2))
