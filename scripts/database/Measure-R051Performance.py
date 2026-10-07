"""Profile bounded synthetic operations on the verified private V72 restore only.

Optional candidate SQL is applied once to a fresh local clone; each synthetic sample rolls back.
All business rows and query plans stay private; output contains timings/counts.
"""
import argparse
import json
import os
import socket
import statistics
import subprocess
import sys
import time
import hashlib
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--candidate', type=Path)
p.add_argument('--label', default='baseline')
p.add_argument('--samples', type=int, default=5)
p.add_argument('--case')
p.add_argument('--explain-nested', action='store_true')
p.add_argument('--compare', help='Baseline label for full material-row parity')
args = p.parse_args()
repo = Path(__file__).resolve().parents[2]
out = repo / 'outputs/r051-trigger-performance'
assert not (out / (args.label+'.json')).exists(), 'Preserve existing measurement'
assert 1 <= args.samples <= 10
backup = json.loads((out / 'vm01-development-backup.json').read_text())
data = Path(backup['restore_data_directory'])
private = Path(backup['backup_file']).parent
pgctl = Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin/pg_ctl.exe'
assert hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest() == backup['backup_sha256']
assert data.resolve().is_relative_to((Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/private-restores').resolve())
with socket.socket() as s:
    s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]


def control(argv, log):
    with (private / log).open('wb') as f:
        subprocess.run([str(pgctl), '-D', str(data)] + argv, stdout=f, stderr=subprocess.STDOUT,
                       check=True, creationflags=subprocess.CREATE_NO_WINDOW)


from R051PerformanceFixtures import counts, setup, cases

def counts_of_rows(c):
    result = {}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        result[schema+'.'+table] = c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()
    return result


result = {'label': args.label, 'scope': 'Private restored DEV data; synthetic rollback operations; DB timing only, not AppSheet latency', 'samples': args.samples, 'candidate_sha256': hashlib.sha256(args.candidate.read_bytes()).hexdigest() if args.candidate else None, 'cases': {}}
started = False; created = False; golden = {}
try:
    control(['-l', str(data/'postgres.log'), '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start'], 'profile-start.log'); started = True
    with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='postgres', autocommit=True) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == data.resolve()
        assert c.execute('SELECT max(version::int) FROM flyway_schema_history WHERE success').fetchone()[0] == 72
        c.execute('CREATE DATABASE r051_perf'); created = True
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='r051_perf',autocommit=True) as c:
        assert not c.execute("SELECT 1 FROM pg_tables WHERE schemaname='public'").fetchall()
        c.execute('DROP SCHEMA public')
    with (private/'profile-restore.log').open('wb') as f:
        subprocess.run([str(pgctl.with_name('pg_restore.exe')),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d','r051_perf','--no-owner','--no-privileges','--exit-on-error',backup['backup_file']],stdout=f,stderr=subprocess.STDOUT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
    with psycopg.connect(host='127.0.0.1', port=port, user='postgres', dbname='r051_perf') as c:
        if args.candidate:
            before_ddl = counts_of_rows(c)
            c.execute(args.candidate.read_text(encoding='utf-8')); c.commit()
            assert counts_of_rows(c) == before_ddl, 'Candidate changed existing rows'
            c.rollback()
            result['migration_existing_rows_unchanged'] = True
        for name, statement in cases.items():
            if args.case and name != args.case: continue
            samples=[]; profiles=[]
            for i in range(args.samples+1):
                c.autocommit = True
                c.execute('VACUUM ANALYZE')
                c.autocommit = False
                setup(c, name != 'receipt_add')
                before = counts(c)
                if args.explain_nested:
                    c.execute("LOAD 'auto_explain'; SET LOCAL auto_explain.log_min_duration=0; SET LOCAL auto_explain.log_nested_statements=on; SET LOCAL auto_explain.log_analyze=on; SET LOCAL auto_explain.log_timing=off; SET LOCAL auto_explain.log_format='json'")
                start = time.perf_counter()
                plan = c.execute('EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) '+statement).fetchone()[0]
                c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                elapsed = (time.perf_counter()-start)*1000
                if args.explain_nested: c.execute('SET LOCAL auto_explain.log_min_duration=-1')
                after = counts(c)
                delta = {k: {field: v[field]-before.get(k,{}).get(field,0) for field in v} for k,v in after.items()}
                delta = {k:v for k,v in delta.items() if v['calls']}
                if i:
                    samples.append(elapsed); profiles.append(delta)
                if i == args.samples:
                    material = {}
                    for schema, table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') AND tablename<>'flyway_schema_history' ORDER BY 1,2"):
                        rows = [r[0] for r in c.execute(sql.SQL('SELECT to_jsonb(t)-ARRAY[\'Generated At\',\'Created At\',\'Updated At\',\'Posted At\',\'Processed At\',\'Movement Time\'] FROM {}.{} t').format(sql.Identifier(schema),sql.Identifier(table)))]
                        material[schema+'.'+table] = sorted(json.dumps(r,sort_keys=True,default=str) for r in rows)
                    golden[name] = material
                (private / f'{args.label}-{name}-{i}-plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
                c.rollback()
            result['cases'][name] = {'median_ms': statistics.median(samples), 'min_ms': min(samples), 'max_ms': max(samples), 'samples_ms': samples, 'last_function_profile': profiles[-1]}
            print(json.dumps({'case':name,'median_ms':result['cases'][name]['median_ms']}),flush=True)
finally:
    if created:
        with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == data.resolve()
            c.execute('DROP DATABASE r051_perf')
    if started: control(['-m','fast','-w','stop'],'profile-stop.log')
(private/(args.label+'-material.json')).write_text(json.dumps(golden,indent=2),encoding='utf-8')
if args.compare:
    expected=json.loads((private/(args.compare+'-material.json')).read_text(encoding='utf-8'))
    result['material_parity']={case:{table: rows==expected[case][table] for table,rows in tables.items()} for case,tables in golden.items()}
(out / (args.label+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
if args.compare: assert all(ok for tables in result['material_parity'].values() for ok in tables.values()), 'Material row parity failed; inspect private output'
