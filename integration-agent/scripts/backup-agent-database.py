"""Private logical backup and restore/fingerprint proof in the named local lab."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
import psycopg
from psycopg import sql

DEFAULT_DUMP_NAME='mw_agent-before-activation.dump'

def safe_dump_name(name):
    if not name or name in('.','..') or '..' in name or '/' in name or '\\' in name or os.path.basename(name)!=name:raise RuntimeError('Unsafe dump name')
    return name

def pg_tool(tool,lab_bin,pg_bin=None,windows=None):
    """Windows keeps the lab 'bin' directory and .exe names; elsewhere --pg-bin, else PATH, else a clear error."""
    if (sys.platform.startswith('win') if windows is None else windows):return str(Path(lab_bin)/(tool+'.exe'))
    if pg_bin:
        found=shutil.which(tool,path=str(pg_bin))
        if not found:raise RuntimeError(f'{tool} not found in --pg-bin {pg_bin}')
        return found
    found=shutil.which(tool)
    if not found:raise RuntimeError(f'{tool} not found on PATH; install the PostgreSQL client tools or pass --pg-bin <dir>')
    return found

def main(argv=None):
    p=argparse.ArgumentParser();p.add_argument('--environments',required=True);p.add_argument('--lab',required=True)
    p.add_argument('--private-directory',required=True);p.add_argument('--output',required=True)
    p.add_argument('--restore-database',default='mw_agent_restore_r015')
    p.add_argument('--dump-name',default=DEFAULT_DUMP_NAME);p.add_argument('--pg-bin',default=None);a=p.parse_args(argv)
    if not re.fullmatch(r'mw_agent_restore_[a-z0-9_]+',a.restore_database):raise RuntimeError('Unsafe restore name')
    e=json.loads(Path(a.environments).read_text())['production'];lab=json.loads(Path(a.lab).read_text(encoding='utf-8-sig'))
    # Identity by instance name only; the private directory is whatever the operator passes (AGT-QUALITY-03).
    if e['instance']!='mw-credit-pg-20261017':raise RuntimeError('Wrong source')
    if lab['host']!='127.0.0.1' or lab['port']==5432:raise RuntimeError('Wrong restore server')
    safe_dump_name(a.dump_name);dump_tool=pg_tool('pg_dump',lab['bin'],a.pg_bin);restore_tool=pg_tool('pg_restore',lab['bin'],a.pg_bin)
    base=dict(host=lab['host'],port=lab['port'],user='postgres',autocommit=True)
    with psycopg.connect(**base,dbname='postgres') as c:
        if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=(Path(lab['root'])/'data').resolve():raise RuntimeError('Wrong lab')
        c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(a.restore_database)))
    private=Path(a.private_directory).resolve()
    if not private.is_dir():raise RuntimeError('Private directory must exist outside the repository')
    dump=private/a.dump_name
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
        subprocess.run([dump_tool,'-h',e['host'],'-p',str(e['port']),'-U',e['user'],'-d','mw_agent','-Fc','--no-owner','--no-privileges','--snapshot='+snapshot,'-f',str(dump)],env=env,check=True,capture_output=True)
        source=fingerprints(c);c.rollback()
    with psycopg.connect(**base,dbname=a.restore_database) as c:c.execute('DROP SCHEMA public')
    subprocess.run([restore_tool,'-h',lab['host'],'-p',str(lab['port']),'-U','postgres','-d',a.restore_database,'--no-owner','--no-privileges','--exit-on-error',str(dump)],check=True,capture_output=True)
    with psycopg.connect(**base,dbname=a.restore_database) as c:restored=fingerprints(c)
    if source!=restored:raise RuntimeError('Restored content differs')
    result={'database':'mw_agent','backup_sha256':hashlib.file_digest(dump.open('rb'),'sha256').hexdigest(),'tables':source,'restore_verified':True}
    Path(a.output).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'restore_verified':True,'tables':len(source),'rows':sum(t['rows'] for t in source.values())}))


if __name__=='__main__':main()
