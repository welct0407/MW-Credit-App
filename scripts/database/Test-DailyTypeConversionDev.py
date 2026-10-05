"""Coordinated DEV-only V68 acceptance; unique synthetic sources, no funding, always rollback."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import uuid
from psycopg import sql
import ReceiptCorrectionDev as transport

PINS={67:1721477385,68:-79096429}
TEST_SHA='39a28e381613cfb9619cabdf7794eb7f4f68024c6594e2e8b0eca6a9d0db2e64'


def setup(c, appname, readonly=False):
    if readonly:c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'")
    c.execute("SELECT set_config('application_name',%s,true)",[appname])


def verify(c, version):
    assert c.execute('SELECT current_database(),session_user').fetchone()==('loan_manager_dev','postgres')
    assert c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==(str(version),PINS[version])


def fixture_fingerprints(c):
    """Only hashes/counts; include initial originals, six batches and GUI-generated receipt/ref rows."""
    answer={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        q=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t WHERE row_to_json(t)::text LIKE ANY(%s)").format(sql.Identifier(schema),sql.Identifier(table))
        answer[schema+'.'+table]=list(c.execute(q,[['%SYN-R051-UI-%','%Bx59mH6SCh4OMcWXvOpo6Y%']]).fetchone())
    return answer


def preflight(c, version):
    setup(c,'r051-v68-preflight',readonly=True);verify(c,version)
    row=c.execute('''SELECT count(*) FILTER(WHERE "Original Daily Interest Rate" IS NULL),
      count(*) FILTER(WHERE "Original Daily Interest Rate"<0),
      count(*) FILTER(WHERE "Original Daily Interest Rate"=0),
      count(*) FILTER(WHERE "Loan Type"='ดอกเบี้ยรายวัน' AND "Current Daily Interest" IS NULL),
      count(*) FILTER(WHERE "Loan Type"='ดอกเบี้ยรายวัน' AND "Current Daily Interest"::numeric<0),
      count(*) FILTER(WHERE "Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' AND "Original Daily Interest Rate" IS NULL AND public.original_daily_interest_rate(l,true) IS NULL),
      count(*) FILTER(WHERE "Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' AND coalesce("Auto Charge Enabled",false) AND ("Loan Date" IS NULL OR NOT coalesce("Interest Payment Interval">=1,false)))
      FROM "Loans" l''').fetchone()
    names=['null_original_basis','negative_original_basis','zero_original_basis','existing_daily_null_current','existing_daily_negative_current','nondaily_basis_unavailable','nondaily_automatic_missing_schedule']
    result={'database':'loan_manager_dev','instance':'appsheet-pg-prod-20260914','host':'34.21.174.215','version':version,'checksum':PINS[version],'read_only':True,'snapshot_at':str(c.execute('SELECT transaction_timestamp()').fetchone()[0]),'edge_counts':dict(zip(names,row)),'fixture_fingerprints':fixture_fingerprints(c),'all_tables_compared':len(transport.fingerprints(c)),'policy':'No backfill or repair; counts describe pre-existing cases only. Missing-basis conversion rejects; existing same-daily values remain unchanged.'}
    result['other_owned_sessions']=c.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'r051-v68-%' AND pid<>pg_backend_pid()").fetchone()[0]
    result['reimbursement_fixture_created']=c.execute('SELECT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Row ID" LIKE \'SYN-R051-UI-REIMBURSE-%\')').fetchone()[0]
    c.rollback();return result


def acceptance_sql(prefix):
    if not prefix.startswith('DEV-R051-TYPE68-') or not prefix.replace('-','').isalnum():raise ValueError('Synthetic namespace only')
    p=transport.REPO/'scripts/database/Test-DailyTypeConversion.sql'
    if hashlib.sha256(p.read_bytes()).hexdigest()!=TEST_SHA:raise ValueError('Reviewed conversion test changed')
    lines=p.read_text().splitlines()
    lines=[line for line in lines if not line.startswith('\\') and line not in ('BEGIN;','ROLLBACK;')
           and not line.startswith('INSERT INTO "Partners"') and not line.startswith('INSERT INTO "Cash Pool Contributions"')]
    body='\n'.join(lines).replace('TYPE-',prefix).replace('CI-DAD',prefix+'DAD').replace('CI-LISA',prefix+'LISA')
    assert 'Cash Pool Contributions' not in body and 'INSERT INTO "Partners"' not in body
    seed=('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES'
          f"('{prefix}DAD','ch:dad','Synthetic conversion acceptance','Synthetic'),('{prefix}LISA','ch:lisa','Synthetic conversion acceptance','Synthetic');\n")
    return seed+body


def acceptance(c, appname):
    """Business assertions on supplied connection; outer caller verifies live identity first."""
    setup(c,appname,readonly=True)
    before=transport.fingerprints(c);fixtures_before=fixture_fingerprints(c);c.rollback()
    result={'passed':False,'application_name':appname,'table_fingerprints_compared':len(before)}
    prefix='DEV-R051-TYPE68-'+uuid.uuid4().hex[:10]+'-';result['synthetic_prefix']=prefix
    started=time.monotonic()
    try:
        setup(c,appname)
        assert c.execute('SELECT count(*) FROM "Borrowers" WHERE "Row ID" LIKE %s',[prefix+'%']).fetchone()[0]==0
        c.execute(acceptance_sql(prefix))
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        result['functional_checks']='passed'
    except Exception as error:
        result['error_type']=type(error).__name__;result['error_sqlstate']=getattr(error,'sqlstate',None)
        result['error']=str(error).splitlines()[0]
    finally:c.rollback()
    setup(c,appname,readonly=True)
    result['fingerprints_unchanged']=transport.fingerprints(c)==before
    result['original_and_six_fixture_fingerprints_unchanged']=fixture_fingerprints(c)==fixtures_before
    result['other_owned_sessions']=c.execute('SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name=%s AND pid<>pg_backend_pid()',[appname]).fetchone()[0]
    result['synthetic_rows_remaining']=c.execute('SELECT count(*) FROM "Borrowers" WHERE "Row ID" LIKE %s',[prefix+'%']).fetchone()[0]
    result['elapsed_seconds']=round(time.monotonic()-started,3)
    result['passed']='error' not in result and result['fingerprints_unchanged'] and result['original_and_six_fixture_fingerprints_unchanged'] and not result['other_owned_sessions'] and not result['synthetic_rows_remaining']
    c.rollback();return result


def run(mode,expected_version,window_reference=None):
    if mode=='acceptance' and (expected_version!=68 or not window_reference):raise ValueError('Reviewed V68 and coordinated window required')
    def callback(c,params):
        if mode=='preflight':return preflight(c,expected_version)
        setup(c,'r051-v68-identity',readonly=True);verify(c,expected_version);c.rollback()
        result=acceptance(c,'r051-v68-acceptance-'+uuid.uuid4().hex)
        result.update(database='loan_manager_dev',version=68,checksum=PINS[68],window_reference=window_reference)
        return result
    result=transport.dev_connection(callback)
    name=f'dev-daily-conversion-preflight-v{expected_version}.json' if mode=='preflight' else 'dev-daily-conversion-v68.json'
    (transport.REPO/'outputs/r051-receipt-corrections'/name).write_text(json.dumps(result,indent=2)+'\n')
    if mode=='acceptance' and not result['passed']:raise RuntimeError('Conversion acceptance failed; rollback/preservation evidence recorded; no replay')
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['preflight','acceptance']);p.add_argument('--expected-version',type=int,choices=[67,68],required=True);p.add_argument('--window-reference')
    a=p.parse_args();print(json.dumps(run(a.mode,a.expected_version,a.window_reference),indent=2))
