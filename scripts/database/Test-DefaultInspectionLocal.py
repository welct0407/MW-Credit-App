"""Local-only Default inspection and separate-request cascade proof; no DEV transport.

Creates/drops a temporary copy of the explicitly verified localhost V69 (historical) or V70 database.
The shared validate_defaulted function uses the real actor fields; generated loss
Charge.Notes is a generic description, never an actor field. No live write mode.
"""
import argparse
from decimal import Decimal
import json
from pathlib import Path
import uuid
import psycopg
from psycopg import sql

ANALYTICS=('Daily Analytics','Cash Account Daily Analytics')
ACTOR='synthetic@example.invalid'


def fingerprints(c):
    result={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        q=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        result[schema+'.'+table]=c.execute(q).fetchone()
    return result


def state(c,key):
    result={}
    for table,field in [('Loans','Row ID'),('Charges','Ref Loans'),('Repayments','Ref Loans'),('Cash Ledger','Ref Loan')]:
        result[table]=[r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(t) FROM {} t WHERE {}=%s ORDER BY "Row ID"').format(sql.Identifier(table),sql.Identifier(field)),[key])]
    return result


def money(value):
    # These local clusters use the established USD/C monetary representation.
    return Decimal(str(value).replace('$','').replace(',',''))


def validate_defaulted(rows,key,charge,actor,business_date,loss_amount,original_principal=100,original_interest=10):
    """Reusable state assertion; no connection, mutation, actor inference or transport."""
    loan=rows['Loans'][0];posting=f'df10:{len(key)}:{key}'
    assert loan['Row ID']==key and loan['Defaulted'] is True and loan['Auto Charge Enabled'] is False
    assert loan['Loan Status']=='ปิดยอดแล้ว' and loan['Outstanding Principal']==0 and money(loan['Current Daily Interest'])==0
    assert money(loan['Default Loss Amount'])==loss_amount and loan['Close Date']==str(business_date) and loan['Closed By']==actor
    original=next(r for r in rows['Charges'] if r['Row ID']==charge)
    evidence=json.loads(original['Notes'].rsplit('Default write-off ',1)[1])
    assert evidence['actor']==actor and evidence['date']==str(business_date) and evidence['posting']==posting
    assert evidence['original_principal']==original_principal and evidence['original_interest']==original_interest
    assert money(original['Principal Due'])==Decimal(str(original_principal))-Decimal(str(evidence['written_off_principal']))
    assert money(original['Interest Due'])==Decimal(str(original_interest))-Decimal(str(evidence['written_off_interest']))
    loss=next(r for r in rows['Charges'] if r['Row ID']==posting)
    assert money(loss['Principal Due'])==loss_amount and money(loss['Interest Due'])==-loss_amount and loss['Charge Date']==str(business_date)
    assert loss['Notes']=='Loan default - outstanding principal recorded as loss; zero cash'
    repayment=next(r for r in rows['Repayments'] if r['Row ID']==posting)
    assert repayment['Ref Loans']==key and repayment['Ref Charges']==posting and repayment['Ref Payment'] is None
    assert money(repayment['Principal Paid'])==loss_amount and money(repayment['Interest Paid'])==-loss_amount
    assert repayment['Created By']==actor and repayment['Payment Date']==str(business_date)
    return posting


def analytics(c):
    return {t:{r[0]['Row ID']:r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(t) FROM {} t').format(sql.Identifier(t)))} for t in ANALYTICS}


def analytics_diff(before,after):
    result={}
    for table,rows in before.items():
        differences=[]
        for key in set(rows)|set(after[table]):
            a=rows.get(key);b=after[table].get(key)
            if a!=b:differences.append({'added':a is None,'removed':b is None,'columns':sorted(k for k in set(a or {})|set(b or {}) if (a or {}).get(k)!=(b or {}).get(k))})
        result[table]=differences
    return result


def reject(c,statement,expected):
    before=fingerprints(c)
    try:
        with c.transaction():c.execute(statement)
    except psycopg.Error as error:assert expected in str(error)
    else:raise AssertionError('Expected rejection: '+expected)
    assert fingerprints(c)==before


def run(port,data_directory,expected_version=70):
    name='r051_default_inspection_'+uuid.uuid4().hex[:10]
    params=dict(host='127.0.0.1',port=port,user='postgres',connect_timeout=5)
    with psycopg.connect(**params,dbname='postgres',autocommit=True) as admin:
        assert Path(admin.execute('SHOW data_directory').fetchone()[0]).resolve()==data_directory.resolve()
        assert admin.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('postgres','127.0.0.1')
        assert admin.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==(str(expected_version),{69:245428688,70:124258995}[expected_version])
        admin.execute("SET timezone='UTC'");master_before=fingerprints(admin)
        admin.execute(sql.SQL('CREATE DATABASE {} TEMPLATE postgres').format(sql.Identifier(name)))
        try:
            with psycopg.connect(**params,dbname=name) as c,psycopg.connect(**params,dbname=name,autocommit=True) as observer:
                c.execute("SET timezone='Asia/Bangkok';SET statement_timeout='30s';SET lock_timeout='3s'")
                today=c.execute('SELECT current_date').fetchone()[0]
                c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES(\'INSLOCAL69-A\',\'ch:lisa\',\'Local default inspection\',\'Synthetic\')')
                c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES(\'INSLOCAL69-B\',\'Synthetic local inspection\')')
                for suffix in ('PLAIN','LEGACY','UNPAID'):
                    key='INSLOCAL69-'+suffix
                    c.execute('''INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account","Defaulted") VALUES(%s,'INSLOCAL69-B',current_date-1,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'INSLOCAL69-A',false)''',[key])
                    c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(%s,%s,current_date-1,100::money,10::money,\'Original note\')',[key+'-C',key])
                c.execute('''INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('INSLOCAL69-R','INSLOCAL69-LEGACY','INSLOCAL69-LEGACY-C',current_date-1,10::money,2::money)''')
                c.execute('SET CONSTRAINTS ALL IMMEDIATE');c.commit()
                def default(key):
                    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[key])
                    c.execute('UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"=%s WHERE "Row ID"=%s',[ACTOR,key])
                    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"=%s',[key])
                    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                plain='INSLOCAL69-PLAIN'
                rollback_before=state(c,plain);rollback_fp=fingerprints(c)
                default(plain);validate_defaulted(state(c,plain),plain,plain+'-C',ACTOR,today,100)
                c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[plain]);c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                assert state(c,plain)==rollback_before
                c.rollback();assert fingerprints(c)==rollback_fp;c.rollback()
                before=state(c,plain);fp=fingerprints(c);ab=analytics(c)
                reject(c,"UPDATE \"Loans\" SET \"Defaulted\"=true,\"Close Date\"=current_date,\"Closed By\"='synthetic@example.invalid' WHERE \"Row ID\"='INSLOCAL69-PLAIN'",'open auto-enabled')
                default(plain);closed=state(c,plain);posting=validate_defaulted(closed,plain,plain+'-C',ACTOR,today,100)
                assert observer.execute('SELECT "Auto Charge Enabled","Defaulted" FROM "Loans" WHERE "Row ID"=%s',[plain]).fetchone()==(False,False)
                assert closed['Cash Ledger']==before['Cash Ledger']
                assert fingerprints(c)['public.Cash Ledger']==fp['public.Cash Ledger']
                default_delta=analytics_diff(ab,analytics(c))
                assert all(not x['added'] and not x['removed'] and set(x['columns'])<={'Generated At'} for x in default_delta['Cash Account Daily Analytics'])
                c.commit()
                assert observer.execute('SELECT "Auto Charge Enabled","Defaulted" FROM "Loans" WHERE "Row ID"=%s',[plain]).fetchone()==(False,True)
                for statement,reason in [(f'DELETE FROM "Loans" WHERE "Row ID"=\'{plain}\'','Undo Default'),(f'DELETE FROM "Charges" WHERE "Row ID"=\'{plain}-C\'','Undo Default'),(f'DELETE FROM "Repayments" WHERE "Row ID"=\'{posting}\'','immutable'),(f'DELETE FROM "Charges" WHERE "Row ID"=\'{posting}\'','receipts')]:reject(c,statement,reason)
                c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[plain]);c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                assert state(c,plain)==before
                undo_fp=fingerprints(c);assert all(undo_fp[k]==v for k,v in fp.items() if k not in {'public.'+t for t in ANALYTICS})
                undo_delta=analytics_diff(ab,analytics(c));assert all(not x['added'] and not x['removed'] and set(x['columns'])<={'Generated At'} for rows in undo_delta.values() for x in rows)
                c.commit()
                # Legitimate nondefault unpaid child-first deletion still works.
                c.execute('DELETE FROM "Charges" WHERE "Row ID"=\'INSLOCAL69-UNPAID-C\'');c.commit()
                c.execute('DELETE FROM "Loans" WHERE "Row ID"=\'INSLOCAL69-UNPAID\'');c.commit()
                assert all(not rows for rows in state(c,'INSLOCAL69-UNPAID').values());c.rollback()
                # Concrete separate-request risk, NOT a claim about actual AppSheet order.
                legacy='INSLOCAL69-LEGACY';legacy_before=state(c,legacy);default(legacy)
                legacy_closed=state(c,legacy);loss=validate_defaulted(legacy_closed,legacy,legacy+'-C',ACTOR,today,90);c.commit()
                allocations=c.execute('SELECT count(*) FROM "Payment Allocations" a JOIN "Charges" ch ON ch."Row ID"=a."Ref Charge" WHERE ch."Ref Loans"=%s',[legacy]).fetchone()[0];assert allocations==0
                reject(c,f'DELETE FROM "Loans" WHERE "Row ID"=\'{legacy}\'','Undo Default');c.rollback()
                if expected_version==69:
                    c.execute('DELETE FROM "Repayments" WHERE "Row ID"=\'INSLOCAL69-R\'');c.commit()
                    after_child=state(c,legacy)
                    assert not any(r['Row ID']=='INSLOCAL69-R' for r in after_child['Repayments'])
                    assert after_child['Cash Ledger']==legacy_closed['Cash Ledger']
                    assert after_child['Loans'][0]['Defaulted'] is True
                    for statement,reason in [(f'DELETE FROM "Charges" WHERE "Row ID"=\'{legacy}-C\'','Undo Default'),(f'DELETE FROM "Repayments" WHERE "Row ID"=\'{loss}\'','immutable'),(f'DELETE FROM "Loans" WHERE "Row ID"=\'{legacy}\'','Undo Default')]:reject(c,statement,reason)
                    assert state(c,legacy)==after_child
                    c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[legacy]);c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                    after_later_undo=state(c,legacy)
                    assert not any(r['Row ID']=='INSLOCAL69-R' for r in after_later_undo['Repayments'])
                    assert after_later_undo['Loans'][0]['Outstanding Principal']==100 and legacy_before['Loans'][0]['Outstanding Principal']==90
                    c.rollback()
                    legacy_result={'allocation_count':allocations,'historical_v69_unsafe_delete_committed':True,'earlier_committed_delete_survives_failure':True,'defaulted_outstanding_after_child_delete':after_child['Loans'][0]['Outstanding Principal'],'later_undo_does_not_restore_deleted_legacy_row':True}
                else:
                    closed_fp=fingerprints(c)
                    # Independent failed requests each roll back; no earlier child
                    # removal can survive the later parent rejection.
                    for statement,reason in [("DELETE FROM \"Repayments\" WHERE \"Row ID\"='INSLOCAL69-R'",'Undo Default'),("UPDATE \"Repayments\" SET \"Notes\"='forbidden' WHERE \"Row ID\"='INSLOCAL69-R'",'Undo Default'),(f'DELETE FROM "Charges" WHERE "Row ID"=\'{legacy}-C\'','receipts'),(f'DELETE FROM "Loans" WHERE "Row ID"=\'{legacy}\'','Undo Default')]:
                        reject(c,statement,reason);c.rollback();assert fingerprints(c)==closed_fp;c.rollback()
                    assert state(c,legacy)==legacy_closed
                    c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[legacy]);c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                    assert state(c,legacy)==legacy_before
                    c.execute('DELETE FROM "Repayments" WHERE "Row ID"=\'INSLOCAL69-R\'');c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                    assert state(c,legacy)['Loans'][0]['Outstanding Principal']==100
                    c.rollback()
                    legacy_result={'allocation_count':allocations,'v70_child_delete_and_update_rejected':True,'separate_failed_requests_all26_unchanged':True,'later_undo_exact_source_restoration':True,'ordinary_delete_after_undo_passed':True}
                result={'passed':True,'scope':f'Isolated localhost V{expected_version} copy only; no DEV transport or writes','correct_actor_fields':['Loans.Closed By','original Charges.Notes restoration JSON.actor','Repayments.Created By'],'loss_charge_note':'Generic zero-cash description, not an actor field','observer_visibility':'Auto-enabled intermediate state invisible; observer saw open/autoFalse before commit and defaulted/autoFalse afterward','default_undo_exact_sources_and_cash':True,'setup_undo_full_transaction_rollback_all26_equal':True,'undo_all_nonanalytics_tables_equal':True,'undo_analytics_timestamp_only_row_counts':{k:len(v) for k,v in undo_delta.items()},'plain_default_parent_and_children_delete_rejected_unchanged':True,'nondefault_unpaid_child_first_delete_passed':True,'legacy_risk':legacy_result,'actual_appsheet_request_order':'Not observed; this simulates independently committed requests','temporary_database_removed':True}
        finally:admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
        assert fingerprints(admin)==master_before;result['original_local_database_all26_unchanged']=True
        return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--port',type=int,required=True);p.add_argument('--data-directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-version',type=int,choices=(69,70),default=70)
    a=p.parse_args();result=run(a.port,a.data_directory,a.expected_version);a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
