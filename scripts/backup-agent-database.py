"""Private logical backup and restore/fingerprint proof in the named local lab."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
import psycopg
from psycopg import sql

p=argparse.ArgumentParser();p.add_argument('--environments',required=True);p.add_argument('--lab',required=True)
p.add_argument('--private-directory',required=True);p.add_argument('--output',required=True);a=p.parse_args()
e=json.loads(Path(a.environments).read_text())['production'];lab=json.loads(Path(a.lab).read_text(encoding='utf-8-sig'))
if (e['host'],e['instance'])!=('34.21.174.215','appsheet-pg-prod-20260914'):raise RuntimeError('Wrong source')
if lab['host']!='127.0.0.1' or lab['port']==5432:raise RuntimeError('Wrong restore server')
base=dict(host=lab['host'],port=lab['port'],user='postgres',autocommit=True)
with psycopg.connect(**base,dbname='postgres') as c:
    if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=(Path(lab['root'])/'data').resolve():raise RuntimeError('Wrong lab')
    c.execute('CREATE DATABASE mw_agent_restore_r015')
private=Path(a.private_directory).resolve();private.relative_to(Path('C:/Users/MWCredit/Documents/ChatGPT').resolve())
dump=private/'mw_agent-before-activation.dump'
if dump.exists():raise RuntimeError('Backup already exists; preserve')
env=dict(os.environ,PGPASSWORD=Path(e['passwordFile']).read_text().strip(),PGSSLMODE='require')
def fingerprints(c):
    c.execute("SET TIME ZONE 'UTC'")
    tables=c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('audit','runtime','migration','deployment') ORDER BY 1,2").fetchall()
    out={}
    for schema,table in tables:
        rows=c.execute(sql.SQL("SELECT row_to_json(t)::text FROM {} t").format(sql.Identifier(schema,table))).fetchall()
        out[schema+'.'+table]={'rows':len(rows),'sha256':hashlib.sha256('\n'.join(sorted(r[0] for r in rows)).encode()).hexdigest()}
    return out
with psycopg.connect(host=e['host'],port=e['port'],dbname='mw_agent',user=e['user'],password=env['PGPASSWORD'],sslmode='require',autocommit=True) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
    subprocess.run([str(Path(lab['bin'])/'pg_dump.exe'),'-h',e['host'],'-p',str(e['port']),'-U',e['user'],'-d','mw_agent','-Fc','--no-owner','--no-privileges','--snapshot='+snapshot,'-f',str(dump)],env=env,check=True,capture_output=True)
    source=fingerprints(c);c.rollback()
with psycopg.connect(**base,dbname='mw_agent_restore_r015') as c:c.execute('DROP SCHEMA public')
subprocess.run([str(Path(lab['bin'])/'pg_restore.exe'),'-h',lab['host'],'-p',str(lab['port']),'-U','postgres','-d','mw_agent_restore_r015','--no-owner','--no-privileges','--exit-on-error',str(dump)],check=True,capture_output=True)
with psycopg.connect(**base,dbname='mw_agent_restore_r015') as c:restored=fingerprints(c)
if source!=restored:raise RuntimeError('Restored content differs')
result={'database':'mw_agent','backup_sha256':hashlib.file_digest(dump.open('rb'),'sha256').hexdigest(),'tables':source,'restore_verified':True}
Path(a.output).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'restore_verified':True,'tables':len(source),'rows':sum(t['rows'] for t in source.values())}))
