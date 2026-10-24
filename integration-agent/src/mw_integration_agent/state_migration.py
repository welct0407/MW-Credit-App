"""Operator-only schema/import tools. No runtime or model entry point."""
from datetime import datetime, UTC
import hashlib
import json
from pathlib import Path
import sqlite3
import shutil
import struct

from psycopg import sql
from . import audit
from .config import ConfigurationError, cutoff_ts
from .state import TABLES


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def backup_journals(source, target):
    source, target=Path(source),Path(target)
    target.mkdir(parents=True,exist_ok=False)
    manifest={'created_at':datetime.now(UTC).isoformat(),'files':{}}
    unexpected={p.name for p in source.glob('*.db')}-set(TABLES)
    if unexpected: raise ConfigurationError('UNMAPPED_APPLICATION_JOURNAL')
    for name in TABLES:
        path=source/name
        if not path.exists(): raise ConfigurationError('EXPECTED_JOURNAL_MISSING:'+name)
        with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as old:
            with sqlite3.connect(target/name) as copy:
                old.backup(copy)
                if copy.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                    raise ConfigurationError('SQLITE_BACKUP_INTEGRITY_FAILED')
        manifest['files'][name]=file_hash(target/name)
    manifest['snapshots']={}
    for path in sorted((source/'cash-statements'/'calendar-day').glob('*/snapshot.json')):
        relative=path.relative_to(source)
        destination=target/relative
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,destination)
        manifest['snapshots'][relative.as_posix()]=file_hash(destination)
    (target/'backup-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return manifest


def cell(value):
    if isinstance(value,float): return ['float64',struct.pack('!d',value).hex()]
    if isinstance(value,(bytes,bytearray,memoryview)): return ['bytes',bytes(value).hex()]
    if value is None:return ['null',None]
    return [type(value).__name__,value]


def rows_digest(columns, rows):
    encoded=sorted(audit.canonical([cell(v) for v in row]) for row in rows)
    return audit.digest({'columns':columns,'rows':encoded})


def import_journals(conn, source, config, batch_id, source_commit):
    """One transaction, full source/target content comparison; no work execution."""
    source=Path(source)
    manifest=json.loads((source/'backup-manifest.json').read_text(encoding='utf-8'))
    if set(manifest['files'])!=set(TABLES): raise ConfigurationError('BACKUP_MANIFEST_INCOMPLETE')
    for name,digest in manifest['files'].items():
        if file_hash(source/name)!=digest: raise ConfigurationError('BACKUP_CONTENT_CHANGED')
    snapshots={p.relative_to(source).as_posix():file_hash(p) for p in
               (source/'cash-statements'/'calendar-day').glob('*/snapshot.json')}
    if snapshots!=manifest.get('snapshots',{}):raise ConfigurationError('SNAPSHOT_BACKUP_CHANGED')
    existing=conn.execute('SELECT state FROM migration.batches WHERE batch_id=%s',(batch_id,)).fetchone()
    if existing: raise ConfigurationError('IMPORT_BATCH_ALREADY_EXISTS_REVERIFY_DO_NOT_REPLAY')
    conn.execute('''INSERT INTO migration.batches(batch_id,source_host,source_code_version,started_at,state,evidence)
        VALUES (%s,%s,%s,clock_timestamp(),'PREPARED',%s::jsonb)''',(batch_id,'vm-mw-credit-agent',source_commit,audit.canonical(manifest)))
    checks=[]
    for filename,mapping in TABLES.items():
        with sqlite3.connect((source/filename).resolve().as_uri()+'?mode=ro',uri=True) as old:
            actual={r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            expected=set(mapping)-{'ingress_work'}
            if actual-expected:raise ConfigurationError('UNMAPPED_SOURCE_TABLE:'+filename)
            for name,target in mapping.items():
                if name=='ingress_work':continue
                present=name in actual
                stream={'partner-notices.db':'receipt'}.get(filename)
                relation=sql.Identifier('runtime',target)
                if present:
                    columns=[r[1] for r in old.execute('PRAGMA table_info('+name+')')]
                    rows=old.execute('SELECT '+','.join('"'+c+'"' for c in columns)+' FROM "'+name+'"').fetchall()
                    insert_columns=columns+(['stream'] if stream else [])
                    if name=='messages':
                        source_rows=old.execute('SELECT *,rowid FROM messages').fetchall()
                        insert_columns+=['legacy_rowid']
                    else: source_rows=rows
                    query=sql.SQL('INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING').format(relation,
                        sql.SQL(',').join(map(sql.Identifier,insert_columns)),sql.SQL(',').join(sql.Placeholder() for _ in insert_columns))
                    for row in source_rows:
                        conn.execute(query,(*row,stream) if stream else row)
                    target_query=sql.SQL('SELECT {} FROM {}').format(sql.SQL(',').join(map(sql.Identifier,columns)),relation)
                    if stream:target_query+=sql.SQL(' WHERE stream=%s')
                    readback=conn.execute(target_query,(stream,) if stream else ()).fetchall()
                    source_hash=rows_digest(columns,rows);target_hash=rows_digest(columns,readback)
                    if len(rows)!=len(readback) or source_hash!=target_hash:
                        raise ConfigurationError('IMPORT_CONTENT_MISMATCH:'+filename+':'+name)
                    if name=='messages':
                        legacy=conn.execute(sql.SQL('SELECT {} FROM {}').format(
                            sql.SQL(',').join(map(sql.Identifier,columns+['legacy_rowid'])),relation)).fetchall()
                        if rows_digest(columns+['rowid'],source_rows)!=rows_digest(columns+['rowid'],legacy):
                            raise ConfigurationError('IMPORT_LEGACY_ROWID_MISMATCH')
                    for index,row in enumerate(sorted(rows,key=lambda r:audit.canonical([cell(v) for v in r]))):
                        op=audit.begin(conn,config,'legacy_import',str(batch_id)+':'+filename+':'+name+':'+str(index),'IMPORT',
                            {'source_file':filename,'source_table':name,'source_row_sha256':rows_digest(columns,[row])},
                            {'kind':'migration','id':str(batch_id)})
                        audit.event(conn,op,'legacy_imported',{'historical_evidence_only':True},'migration','COMPLETED',key='imported')
                    statuses={}
                    for col in ('status','state','ig_status','email_status'):
                        if col in columns:
                            statuses[col]={str(k):v for k,v in old.execute('SELECT "'+col+'",count(*) FROM "'+name+'" GROUP BY "'+col+'"')}
                else:
                    # R091: the conversation journals were optional here; with agent V11 every mapped table is required.
                    raise ConfigurationError('EXPECTED_SOURCE_TABLE_MISSING:'+name)
                conn.execute('''INSERT INTO migration.table_checks(batch_id,source_file,source_table,target_table,present,
                    source_rows,target_rows,source_sha256,target_sha256,status_counts) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)''',
                    (batch_id,filename,name,'runtime.'+target,present,len(rows),len(readback),source_hash,target_hash,audit.canonical(statuses)))
                checks.append({'source_file':filename,'source_table':name,'present':present,'rows':len(rows),'digest':source_hash})
    # Preserve original receipt eligibility, not a new replay cutoff.
    cursor=conn.execute('SELECT value FROM runtime.receipt_cursor WHERE id=1').fetchone()
    if not cursor:raise ConfigurationError('SOURCE_CURSOR_MISSING')
    receipt_cutoff=cutoff_ts(config,'receipt_activation_cutoff')
    conn.execute('''INSERT INTO runtime.ingress_work(message_id,state,eligible_at)
        SELECT message_id,CASE WHEN legacy_rowid>%s AND event_timestamp>=%s AND captured_at>=%s THEN 'PENDING' ELSE 'DONE' END,
        to_timestamp(captured_at) FROM runtime.ingress_messages ON CONFLICT DO NOTHING''',(cursor[0],receipt_cutoff,receipt_cutoff))
    maximum=conn.execute('SELECT max(id) FROM runtime.receipt_reconsiderations').fetchone()[0]
    conn.execute("SELECT setval(pg_get_serial_sequence('runtime.receipt_reconsiderations','id'),%s,%s)",(maximum or 1,maximum is not None))
    from .statement_snapshot import freeze
    snapshots=0
    # Caller backs up this directory alongside journals. Never reconstruct a sent
    # snapshot from current balances. Source bytes must be valid UTF-8 JSON.
    for path in sorted((source/'cash-statements'/'calendar-day').glob('*/snapshot.json')):
        text=path.read_bytes().decode('utf-8')
        freeze(conn,'calendar-day/'+path.parent.name,text,str(path),datetime.fromtimestamp(path.stat().st_mtime,UTC))
        snapshots+=1
    conn.execute("UPDATE migration.batches SET state='VERIFIED',verified_at=clock_timestamp() WHERE batch_id=%s",(batch_id,))
    return {'batch_id':str(batch_id),'tables':checks,'rows':sum(c['rows'] for c in checks),'snapshots':snapshots}


def migrate(conn, directory):
    """Independent immutable central migration history, never Flyway business history."""
    if conn.info.dbname!='mw_agent':raise ConfigurationError('WRONG_CENTRAL_MIGRATION_TARGET')
    with conn.transaction():
        conn.execute('SET LOCAL ROLE mw_agent_owner')
        conn.execute('CREATE SCHEMA IF NOT EXISTS deployment AUTHORIZATION mw_agent_owner')
        conn.execute('REVOKE ALL ON SCHEMA deployment FROM PUBLIC')
        conn.execute('''CREATE TABLE IF NOT EXISTS deployment.schema_history(
            version integer PRIMARY KEY,name text NOT NULL,sha256 text NOT NULL,
            installed_at timestamptz NOT NULL DEFAULT clock_timestamp())''')
    applied=[]
    files=sorted(Path(directory).glob('V*__*.sql'),key=lambda p:int(p.name.split('__')[0][1:]))
    for path in files:
        version=int(path.name.split('__')[0][1:]);content=path.read_text(encoding='utf-8')
        digest=hashlib.sha256(content.encode()).hexdigest()
        with conn.transaction():
            conn.execute('SET LOCAL ROLE mw_agent_owner')
            conn.execute('SELECT pg_advisory_xact_lock(2026092201)')
            old=conn.execute('SELECT name,sha256 FROM deployment.schema_history WHERE version=%s',(version,)).fetchone()
            if old:
                if tuple(old)!=(path.name,digest):raise ConfigurationError('CENTRAL_MIGRATION_CHECKSUM_MISMATCH')
                continue
            if conn.execute('SELECT 1 FROM deployment.schema_history WHERE version>%s',(version,)).fetchone():
                raise ConfigurationError('CENTRAL_MIGRATION_OUT_OF_ORDER')
            conn.execute(content)
            conn.execute('INSERT INTO deployment.schema_history(version,name,sha256) VALUES (%s,%s,%s)',(version,path.name,digest))
            applied.append(path.name)
    return {'applied':applied,'versions':len(files)}
