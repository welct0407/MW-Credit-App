"""Bounded rollback-only synthetic timing on the canonical DEV database.

Requires the verified pre-performance backup. No app bot calls, real source
mutations, instance settings or permission changes. All triggers stay enabled.
"""
import argparse
import hashlib
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
from R051PerformanceFixtures import counts, setup, cases

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--version',type=int,choices=[72,73],required=True)
p.add_argument('--label',required=True)
p.add_argument('--samples',type=int,default=3)
args=p.parse_args()
repo=Path(__file__).resolve().parents[2]
out=repo/'outputs/r051-trigger-performance'
assert not (out/(args.label+'.json')).exists(), 'Preserve existing measurement'
backup=json.loads((out/'vm01-development-backup.json').read_text())
assert backup['restored_fingerprints_match'] and hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest()==backup['backup_sha256']
target=json.loads((repo/'database/environments.json').read_text())['development']
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')


def fingerprints(c):
    answer={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        answer[schema+'.'+table]=c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()
    return answer


with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],user=target['user'],password=Path(target['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15,application_name='r051-performance-rollback') as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone()==('loan_manager_dev',target['host'],'postgres')
    version,checksum=c.execute('SELECT version::int,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
    assert version==args.version
    if version==72: assert checksum==-1995290851
    else: assert checksum==1165230041
    assert c.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL").fetchone()[0]==0, 'Concurrent work; reconcile measurement window'
    assert c.execute('SELECT count(*) FROM "Borrowers" WHERE "Row ID" LIKE \'SYN-R051-PERF-%\'').fetchone()[0]==0
    assert c.execute('SELECT count(*) FROM "Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchone()[0]==0
    before=fingerprints(c); c.rollback()
    track=True
    try: c.execute("SET LOCAL track_functions='all'")
    except psycopg.errors.InsufficientPrivilege: track=False
    c.rollback()
    ping=[]
    for i in range(5):
        start=time.perf_counter();c.execute('SELECT 1').fetchone();ping.append((time.perf_counter()-start)*1000)
    c.rollback()
    result={'at':datetime.now(timezone.utc).isoformat(),'database':'loan_manager_dev','version':version,'checksum':checksum,'scope':'Rollback-only synthetic sources; DML and deferred effects; no app delivery','function_tracking_available':track,'select_one_roundtrip_median_ms':statistics.median(ping),'cases':{}}
    for name,statement in cases.items():
        timings=[];server=[];profiles=[]
        for i in range(args.samples+1):
            setup(c,name!='receipt_add',track=track)
            prior=counts(c) if track else {}
            start=time.perf_counter()
            plan=c.execute('EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) '+statement).fetchone()[0]
            c.execute('SET CONSTRAINTS ALL IMMEDIATE')
            elapsed=(time.perf_counter()-start)*1000
            after=counts(c) if track else {}
            delta={k:{field:v[field]-prior.get(k,{}).get(field,0) for field in v} for k,v in after.items()}
            if i:
                timings.append(elapsed);server.append(plan[0]['Execution Time']);profiles.append({k:v for k,v in delta.items() if v['calls']})
            c.rollback()
        result['cases'][name]={'client_dml_plus_deferred_median_ms':statistics.median(timings),'dml_server_execution_median_ms':statistics.median(server),'samples_ms':timings,'last_function_profile':profiles[-1]}
        print(json.dumps({'case':name,'client_ms':statistics.median(timings),'server_dml_ms':statistics.median(server)}),flush=True)
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    after=fingerprints(c);c.rollback()
    result['unchanged_tables']={name:before[name]==after[name] for name in before}
    result['all_rollback_fingerprints_equal']=before==after
    (out/(args.label+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    assert before==after, 'Live fingerprint changed; reconcile before any further mutation'
