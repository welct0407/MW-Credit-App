"""Independent Python parity and saved-query preflight for automatic schedule views."""
import argparse,json,os,sys,time
from collections import Counter,defaultdict
from datetime import date,timedelta
from decimal import Decimal as D
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
from simulate_schedule_consistency import expected_schedule
REPO=Path(__file__).resolve().parents[2]

def verify(conn,plan=None):
    with conn.cursor(row_factory=dict_row) as c:
        d=c.execute('select public.olap_reporting_date() d').fetchone()['d']
        rows=c.execute('select * from public.reporting_loan_schedule_health_v1 order by loan_id').fetchall()
        ids=[r['loan_id'] for r in rows]
        raw=c.execute('''select "Ref Loans" loan_id,"Charge Date" due_date,
            sum("Interest Due"::numeric) interest from public."Charges" where "Ref Loans"=any(%s)
            and "Charge Date"<%s group by 1,2''',(ids,d)).fetchall()
        charges=defaultdict(list)
        for r in raw:charges[r['loan_id']].append(r)
        flags=set();tested=0
        for r in rows:
            if r['comparison_status']!='Supported':continue
            loan=dict(start=str(r['start_date']),anchor=str(r['anchor_date']),daily_interest=str(r['daily_interest']),
                      interval=r['payment_interval'],kind=r['loan_type'],defaulted=r['defaulted'])
            normalized=[dict(due_date=str(x['due_date']),interest=x['interest']) for x in charges[r['loan_id']]]
            expected,start=expected_schedule(loan,d,normalized)
            start=max(start,d-timedelta(days=30));ex={dt:v for dt,v in expected.items() if start<=dt<d}
            actual={x['due_date']:x['interest']-(r['transfer_fee'] if x['due_date']==r['start_date'] else 0)
                    for x in charges[r['loan_id']] if start<=x['due_date']<d}
            ei=sum(ex.values(),D(0));ai=sum(actual.values(),D(0));nd=sum(v>0 for v in actual.values())
            coverage=ai/ei if ei else None;dc=D(nd)/len(ex) if ex else None
            eligible=(d-start).days>=7 and len(ex)>=2
            flag=bool(eligible and (coverage<D('.8') or dc<D('.8')) and not r['auto_charge_enabled'])
            assert (ei,ai,len(ex),nd)==(r['expected_interest_30d'],r['recorded_interest_30d'],r['expected_due_dates_30d'],r['recorded_interest_dates_30d'])
            assert flag==r['modified_schedule'];tested+=1
            if flag:flags.add(r['borrower_id'])
        matrix=c.execute('''select n.*,o.quadrant old_quadrant,o.reliability_score old_score,
            o.relative_contribution old_value from reporting_borrower_matrix_v3 n
            join reporting_borrower_matrix_v2 o using(borrower_id)''').fetchall()
        for r in matrix:
            assert r['reliability_score']==r['old_score'] and r['relative_contribution']==r['old_value']
            assert r['arrangement_gate']==(r['borrower_id'] in flags)
            category=r['old_quadrant']
            if r['arrangement_gate'] and category in ('Star','Cash Cow'):
                category='Question Mark' if r['relative_contribution']>=1 else 'Dog'
            assert r['quadrant']==category
        queries=[]
        if plan:
            for p in json.loads(Path(plan).read_text(encoding='utf-8'))['specs']:
                start=time.perf_counter();result=c.execute(p['dataset_query']['native']['query']).fetchall()
                queries.append(dict(key=p['key'],rows=len(result),ms=round((time.perf_counter()-start)*1000,2)))
        return dict(reporting_date=str(d),loans=len(rows),independent_loan_parity=tested,
                    unassessed_loans=len(rows)-tested,borrowers=len(matrix),modified_borrowers=len(flags),
                    categories=dict(Counter(r['quadrant'] for r in matrix)),
                    score_contribution_preserved=True,automatic_category_parity=True,queries=queries)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--environment',choices=['development','production'],required=True);a=p.parse_args()
    cfg=json.loads((REPO/'database/environments.json').read_text())[a.environment]
    expected='loan_manager_dev' if a.environment=='development' else 'loan_manager_prod'
    assert (cfg['instance'],cfg['host'],cfg['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
    with psycopg.connect(host=cfg['host'],dbname=expected,user=cfg['user'],password=Path(cfg['passwordFile']).read_text().strip(),sslmode='require',
                        options='-c default_transaction_read_only=on -c statement_timeout=30000') as c:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(expected,cfg['host'])
        result=verify(c,REPO/'outputs/r028-schedule-health/metabase-plan.json')
    (REPO/'outputs/r028-schedule-health'/f'{a.environment}-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
