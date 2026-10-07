"""Local-only reproduction of separately committed cascade requests; never DEV transport."""
import argparse
import json
from pathlib import Path
import psycopg
from psycopg import sql


def run(port, data_directory):
    target='r051_borrower_cascade_local'
    with psycopg.connect(host='127.0.0.1',port=port,dbname='postgres',user='postgres',autocommit=True,connect_timeout=5) as admin:
        assert Path(admin.execute('SHOW data_directory').fetchone()[0]).resolve()==data_directory.resolve()
        assert admin.execute('SELECT host(inet_server_addr())').fetchone()[0]=='127.0.0.1'
        assert admin.execute('SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()[0]=='67'
        assert not admin.execute('SELECT 1 FROM pg_database WHERE datname=%s',[target]).fetchone()
        admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE postgres').format(sql.Identifier(target)))
        try:
            with psycopg.connect(host='127.0.0.1',port=port,dbname=target,user='postgres',connect_timeout=5) as c:
                c.execute("SET timezone='Asia/Bangkok'")
                c.execute("SET statement_timeout='30s'")
                c.execute("SET lock_timeout='3s'")
                c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES(\'CASCADE-LISA\',\'ch:lisa\',\'Synthetic cascade\',\'Synthetic\'),(\'CASCADE-DAD\',\'ch:dad\',\'Synthetic cascade\',\'Synthetic\')')
                c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES(\'CASCADE-B\',\'Synthetic cascade\')')
                c.execute('INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Ref Disbursed From Cash Account") VALUES(\'CASCADE-UNPAID\',\'CASCADE-B\',current_date,100::money,\'กำหนดวันชำระ\',\'ยังไม่ปิดยอด\',false,\'CASCADE-LISA\'),(\'CASCADE-PAID\',\'CASCADE-B\',current_date,100::money,\'กำหนดวันชำระ\',\'ยังไม่ปิดยอด\',false,\'CASCADE-LISA\')')
                c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES(\'CASCADE-UNPAID-C\',\'CASCADE-UNPAID\',current_date,100::money,10::money),(\'CASCADE-PAID-C\',\'CASCADE-PAID\',current_date,100::money,10::money)')
                c.execute('INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES(\'CASCADE-P\',\'CASCADE-B\',\'Processing\',1::money,current_date,\'Single Partial\',\'CASCADE-PAID-C\',\'CASCADE-DAD\')')
                c.commit()
                def snapshot():
                    return {t:c.execute(sql.SQL('SELECT to_jsonb(x) FROM {} x WHERE "Row ID" LIKE %s ORDER BY "Row ID"').format(sql.Identifier(t)),['%CASCADE%']).fetchall() for t in ('Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Cash Ledger')}
                before=snapshot();c.rollback()
                try:c.execute('DELETE FROM "Borrowers" WHERE "Row ID"=\'CASCADE-B\'');c.commit()
                except psycopg.errors.ForeignKeyViolation:c.rollback()
                else:raise AssertionError('Referenced parent unexpectedly deleted')
                assert snapshot()==before;c.rollback()
                # Simulate independent provider requests; do not claim actual AppSheet ordering.
                c.execute('DELETE FROM "Loans" WHERE "Row ID"=\'CASCADE-UNPAID\'');c.commit()
                after_unpaid=snapshot();c.rollback()
                try:c.execute('DELETE FROM "Loans" WHERE "Row ID"=\'CASCADE-PAID\'');c.commit()
                except psycopg.Error as e:
                    assert 'has receipts' in str(e);c.rollback()
                else:raise AssertionError('Paid child unexpectedly deleted')
                assert snapshot()==after_unpaid
                assert not c.execute('SELECT 1 FROM "Loans" WHERE "Row ID"=\'CASCADE-UNPAID\'').fetchone()
                assert c.execute('SELECT 1 FROM "Loans" WHERE "Row ID"=\'CASCADE-PAID\'').fetchone()
                assert c.execute('SELECT 1 FROM "Borrowers" WHERE "Row ID"=\'CASCADE-B\'').fetchone()
                assert c.execute('SELECT 1 FROM "Payments" WHERE "Row ID"=\'CASCADE-P\'').fetchone()
                c.rollback()
            return {'passed':True,'scope':'Private localhost V67 copy only; separate committed requests are a risk reproduction, not observed AppSheet request order','parent_sql_delete':'FK rejection; exact scoped source/child/cash equality','separate_child_requests':'Unpaid loan/own charge/cash deletion committed; later paid-loan delete rejected; parent/paid loan/receipt retained','implication':'A final failure cannot roll back an earlier committed sibling request. Do not expose borrower cascade as all-or-none.','temporary_database_removed':True}
        finally:admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(target)))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,required=True);p.add_argument('--data-directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();result=run(a.port,a.data_directory);a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
