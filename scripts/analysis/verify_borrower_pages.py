"""Read-only borrower-page parity. Outputs aggregate checks, never borrower records."""
import argparse,json,os,sys,time,hashlib,re
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
ROOT=Path(__file__).resolve().parents[2]
VIEWS=['reporting_borrower_loan_facts_v1','reporting_borrower_directory_v1','reporting_borrower_activity_daily_v1']
def verify(c):
    checks=[]
    def check(name,q):
        assert c.execute(q).fetchone()[0] is True,name
        checks.append(name)
    check('directory unique',"SELECT count(*)=count(DISTINCT borrower_id) FROM reporting_borrower_directory_v1")
    check('loan key parity',"SELECT NOT EXISTS ((SELECT loan_id FROM reporting_borrower_loan_facts_v1 EXCEPT SELECT \"Row ID\" FROM \"Loans\") UNION ALL (SELECT \"Row ID\" FROM \"Loans\" EXCEPT SELECT loan_id FROM reporting_borrower_loan_facts_v1))")
    check('directory current parity',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_directory_v1 d JOIN olap_borrowers_analytics b ON b.\"Row ID\"=d.borrower_id WHERE d.outstanding_principal IS DISTINCT FROM b.\"Total Outstanding Principal\" OR d.active_loans IS DISTINCT FROM b.\"Active Loan Count\")")
    check('health active parity',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_directory_v1 d JOIN reporting_borrower_payment_health_v1 h USING(borrower_id) WHERE d.has_active_loan IS DISTINCT FROM h.has_active_loan)")
    check('matrix signed completed-day contribution',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_period_v1(olap_reporting_date()-30,olap_reporting_date()-1) p JOIN reporting_borrower_matrix_v3 m USING(borrower_id) WHERE p.interest_received IS DISTINCT FROM m.contribution_30d)")
    check('no unattributed source facts',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_activity_daily_v1 WHERE borrower_id IS NULL OR invalid_events>0) AND NOT EXISTS(SELECT 1 FROM reporting_borrower_directory_v1 WHERE invalid_fact_count>0)")
    for days in [1,30,90]:
        for pop in ['All with loan history','Currently active','Currently inactive']:
            # Independent base-row aggregation, no fact view or period function used for expected amounts.
            q='''WITH p AS (SELECT * FROM reporting_borrower_period_v1(olap_reporting_date()-%s,olap_reporting_date()-1,%s)),
            loans AS (SELECT "Ref Borrowers" id,sum("Principal Amount"::numeric) principal,count(*) n FROM "Loans" WHERE "Loan Date" BETWEEN olap_reporting_date()-%s AND olap_reporting_date()-1 GROUP BY 1),
            payments AS (SELECT l."Ref Borrowers" id,sum(r."Principal Paid"::numeric) principal,sum(r."Interest Paid"::numeric) interest FROM "Repayments" r JOIN "Loans" l ON l."Row ID"=r."Ref Loans" WHERE r."Payment Date" BETWEEN olap_reporting_date()-%s AND olap_reporting_date()-1 GROUP BY 1)
            SELECT NOT EXISTS(SELECT 1 FROM p LEFT JOIN loans l ON l.id=p.borrower_id LEFT JOIN payments r ON r.id=p.borrower_id WHERE p.principal_issued IS DISTINCT FROM coalesce(l.principal,0) OR p.loans_issued IS DISTINCT FROM coalesce(l.n,0) OR p.principal_returned IS DISTINCT FROM coalesce(r.principal,0) OR p.interest_received IS DISTINCT FROM coalesce(r.interest,0) OR p.first_loans+p.repeat_loans+p.unclassified_loans<>p.loans_issued)'''
            assert c.execute(q,(days,pop,days,days)).fetchone()[0],f'period parity {days}/{pop}'
            checks.append(f'period parity {days}/{pop}')
    check('future rejected',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_period_v1(olap_reporting_date(),olap_reporting_date()+1))")
    check('empty/inverted rejected',"SELECT NOT EXISTS(SELECT 1 FROM reporting_borrower_period_v1(NULL,NULL)) AND NOT EXISTS(SELECT 1 FROM reporting_borrower_period_v1(olap_reporting_date(),olap_reporting_date()-1))")
    check('no PUBLIC execute',"SELECT NOT EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='reporting_borrower_period_v1(date,date,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')")
    plan=ROOT/'outputs/r035-borrower-pages/metabase-plan.json'
    query_checks=[]
    if plan.exists():
        sample=c.execute('SELECT borrower_id FROM reporting_borrower_directory_v1 WHERE has_active_loan ORDER BY borrower_id LIMIT 1').fetchone()
        for s in json.loads(plan.read_text())['specs']:
            q=re.sub(r'\[\[.*?\]\]','',s['dataset_query']['native']['query'],flags=re.S)
            start=time.monotonic();rows=c.execute(q).fetchall()
            if s['page']=='detail':
                assert len(rows)==0,'Detail without selection: '+s['key']
                if sample:
                    q=q.replace("'__select_borrower__'",psycopg.sql.Literal(sample[0]).as_string(c))
                    rows=c.execute(q).fetchall()
            query_checks.append({'key':s['key'],'rows':len(rows),'seconds':round(time.monotonic()-start,3)})
    return {'at':datetime.now(timezone.utc).isoformat(),'checks':checks,'passed':len(checks),'query_checks':query_checks,'financial_values_published':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('environment',choices=['development','production']);p.add_argument('--grants',action='store_true');args=p.parse_args()
    t=json.loads((ROOT/'database/environments.json').read_text())[args.environment]
    assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev' if args.environment=='development' else 'loan_manager_prod')
    with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
        assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
        c.rollback()
        if args.grants:
            assert args.environment=='production'
            assert c.execute('SELECT max(version::int) FROM flyway_schema_history WHERE success').fetchone()[0]==44
            # Existing restricted reporting user; only additive read-only objects authorized for these pages.
            for v in VIEWS:c.execute('GRANT SELECT ON public.'+v+' TO metabase_borrower_reader')
            c.execute('GRANT EXECUTE ON FUNCTION public.reporting_borrower_period_v1(date,date,text) TO metabase_borrower_reader')
            c.commit()
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL statement_timeout='60s'")
        report=verify(c);report['environment']=args.environment
        if args.grants:
            for v in VIEWS:assert c.execute("SELECT has_table_privilege('metabase_borrower_reader',%s,'SELECT') AND NOT has_table_privilege('metabase_borrower_reader',%s,'INSERT,UPDATE,DELETE')",(v,v)).fetchone()[0]
            report['read_only_grants_verified']=True
        dest=ROOT/'outputs/r035-borrower-pages';dest.mkdir(exist_ok=True)
        (dest/(args.environment+'-verification.json')).write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))
