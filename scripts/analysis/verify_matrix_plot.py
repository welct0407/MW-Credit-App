"""R029 independent coordinate checks; synthetic writes only on disposable loopback DB."""
import argparse,json,os,sys,time
from pathlib import Path
from decimal import Decimal as D
from collections import Counter
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
ROOT=Path(__file__).resolve().parents[2]
EXTRA=['plot_status','matrix_x','matrix_y','plot_x','plot_y','position_basis','contribution_clipped','plot_method_version']

def expected(s,r,g,q):
    if q=='Unclassified':return 'Unclassified',None,None,None,None
    if s is None or r is None or g is None or not s.is_finite() or not r.is_finite() or not D(0)<=s<=100:
        return 'Invalid plot input',None,None,None,None
    if q not in ('Star','Cash Cow','Question Mark','Dog') or (q in ('Star','Cash Cow'))!=(s>=80 and not g) or (q in ('Star','Question Mark'))!=(r>=1):
        return 'Invalid plot input',None,None,None,None
    # Independent half-band distance implementation.
    x=D(75) if g else ((D(80)-s)*D('0.625')+50 if s<80 else (100-s)*D('2.5'))
    y=D(0) if r<0 else 100-D(100)/(1+r)
    px=max(D(2),min(D('49.5'),x)) if q in ('Star','Cash Cow') else max(D('50.5'),min(D(98),x))
    py=max(D('50.5'),min(D(98),y)) if q in ('Star','Question Mark') else max(D(2),min(D('49.5'),y))
    return 'Plotted',x,y,px,py

def check(rows):
    for p in rows:
        e=expected(p['reliability_score'],p['relative_contribution'],p['arrangement_gate'],p['quadrant'])
        assert p['plot_status']==e[0],p['borrower_id']
        for col,v in zip(['matrix_x','matrix_y','plot_x','plot_y'],e[1:]):
            assert (p[col] is None if v is None else abs(p[col]-v)<D('0.000000001')),(p['borrower_id'],col)
        if e[0]=='Plotted':
            assert (p['plot_x']<50)==(p['quadrant'] in ('Star','Cash Cow'))
            assert (p['plot_y']>50)==(p['quadrant'] in ('Star','Question Mark'))
            assert p['contribution_clipped']==(p['relative_contribution']<0)

def synthetic(conn):
    assert conn.execute('select host(inet_server_addr()),current_database()').fetchone()==('127.0.0.1','postgres')
    conn.execute('CREATE TEMP TABLE matrix_inputs AS SELECT * FROM public.reporting_borrower_matrix_v3 WHERE false')
    cases=[]
    for s in [0,40,60,79.999,80,80.001,90,100]:
        for r in [-2,0,.25,.5,.999999,1,1.000001,2,4,9,1000000]:
            for g in (False,True):
                high=s>=80 and not g
                q=('Star' if high else 'Question Mark') if r>=1 else ('Cash Cow' if high else 'Dog')
                cases.append(dict(reliability_score=s,relative_contribution=r,arrangement_gate=g,quadrant=q))
    for s,r,g,q in [(None,2,False,'Star'),(101,2,False,'Star'),(90,None,False,'Star'),(90,'NaN',False,'Star'),(90,'Infinity',False,'Star'),(90,2,True,'Star'),(60,.5,False,'Star'),(90,2,None,'Star'),(90,2,False,'New category'),(None,None,False,'Unclassified')]:
        cases.append(dict(reliability_score=s,relative_contribution=r,arrangement_gate=g,quadrant=q))
    for i,row in enumerate(cases):
        row['borrower_id']='fixture-'+str(i)
        conn.execute('INSERT INTO matrix_inputs SELECT (jsonb_populate_record(NULL::public.reporting_borrower_matrix_v3,%s::jsonb)).*',(json.dumps(row),))
    migration=(ROOT/'database/migrations/V43__borrower_matrix_display_coordinates.sql').read_text()
    conn.execute(migration.replace('public.reporting_borrower_matrix_plot_v1','pg_temp.matrix_plot_test').replace('public.reporting_borrower_matrix_v3','pg_temp.matrix_inputs'))
    with conn.cursor(row_factory=dict_row) as c:rows=c.execute('select * from pg_temp.matrix_plot_test').fetchall()
    check(rows)
    return dict(cases=len(rows),invalid_inputs=sum(p['plot_status']=='Invalid plot input' for p in rows),coordinate_mismatches=0)

def verify(conn):
    start=time.perf_counter()
    with conn.cursor(row_factory=dict_row) as c:
        rows=c.execute('select * from public.reporting_borrower_matrix_plot_v1 order by borrower_id').fetchall()
        check(rows)
        parity=c.execute('''select count(*) n from public.reporting_borrower_matrix_plot_v1 p FULL JOIN public.reporting_borrower_matrix_v3 b USING(borrower_id)
          WHERE (to_jsonb(p)-%s::text[]) IS DISTINCT FROM to_jsonb(b)''',(EXTRA,)).fetchone()['n']
        assert parity==0,'Original V3 fields changed'
        assert all(r['plot_status']!='Invalid plot input' for r in rows)
    return dict(borrowers=len(rows),categories=dict(Counter(r['quadrant'] for r in rows)),plotted=sum(r['plot_status']=='Plotted' for r in rows),
        unclassified=sum(r['plot_status']=='Unclassified' for r in rows),modified=sum(bool(r['arrangement_gate']) for r in rows),
        source_field_mismatches=parity,coordinate_mismatches=0,elapsed_ms=round((time.perf_counter()-start)*1000,2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--environment',choices=['development','production'],required=True);a=p.parse_args()
    cfg=json.loads((ROOT/'database/environments.json').read_text())[a.environment]
    db='loan_manager_dev' if a.environment=='development' else 'loan_manager_prod'
    assert (cfg['instance'],cfg['host'],cfg['database'])==('appsheet-pg-prod-20260914','34.21.174.215',db)
    with psycopg.connect(host=cfg['host'],dbname=db,user=cfg['user'],password=Path(cfg['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on -c statement_timeout=30000') as c:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(db,cfg['host'])
        evidence=verify(c)
    (ROOT/'outputs/r029-bcg-matrix'/f'{a.environment}-verification.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
