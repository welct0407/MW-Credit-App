"""DB-PERF-01 operator maintenance for the central mw_agent database (R064 W4). Not a runtime entry point.

Dry run by default: nothing changes without --apply.

  null-archived-images  NULL runtime.receipt_jobs.image only where the job's receipt asset is ARCHIVED with
                        object_key, generation and raw_sha256 recorded (the archive re-reads GCS by generation).
  audit-retention       Select routine audit trees older than the cutoff (default and minimum 7 days; owner decision
                        17 October 2026), export them as gzip JSONL plus a manifest, upload and verify, then delete
                        them in atomic batches as mw_agent_owner, record one CONFIG operation and VACUUM (ANALYZE).

The connection file is psycopg keyword JSON (optional "password_file") outside Git, for a principal that may
SET ROLE mw_agent_owner, or with --purge-function (audit-retention only) SET ROLE mw_agent_retention: the deletes
then go through the V5 SECURITY DEFINER function audit.purge_routine_trees(), one exported batch per call, which
re-checks every safety rule server-side and returns counts that must equal the export. That is the daily timer's
path (VM identity on the IAM listener, no password); the owner path stays for the first manual backlog run.
--expect-environment must equal the newest audit.operations.environment.
Effectful or deterministic-key operations (SEND, INSERT, UPDATE, DELETE, IMPORT, RECONCILE, CONFIG, AUTH;
ingress, reviewer_dml, statement_snapshot, legacy_import) are never deleted: their idempotency keys guard replay.
"""
import argparse
import base64
import gzip
import hashlib
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, UTC
from pathlib import Path

import psycopg
from psycopg import sql

REPOSITORY = Path(__file__).resolve().parents[2]
ARCHIVE_BUCKET = 'mw-credit-operator-private-737787224638'
ARCHIVE_PREFIX = 'agent-audit-archive/'
POLICY = 'agent-postgresql-20260922-v1'
ROUTINE_ACTIONS = ['READ', 'JOB', 'PROCESS', 'HEALTH']
TERMINAL_STATES = ['COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'ROLLED_BACK']
DETERMINISTIC_SERVICES = ['ingress', 'reviewer_dml', 'statement_snapshot', 'legacy_import']
UUID4 = r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
MIN_DAYS = 7  # owner decision 17 October 2026: one week of routine audit is sufficient
# (table, export order key, temp key set, column joining that set)
EXPORTS = (('audit.operations', 'operation_id', 'rt_tree', 'operation_id'),
           ('audit.events', 'event_id', 'rt_events', 'event_id'),
           ('runtime.operation_state', 'operation_id', 'rt_tree', 'operation_id'),
           ('runtime.job_runs', 'run_id', 'rt_runs', 'run_id'))
DELETE_ORDER = ('runtime.job_runs', 'runtime.operation_state', 'audit.events', 'audit.operations')
# Referencing columns V1 left unindexed; without them every deleted event/operation seq-scans the referencing
# table for the foreign-key check (lab: one 2,000-tree batch ran > 9 minutes). Built CONCURRENTLY if missing
# and dropped afterwards; an agent migration can make them permanent.
FK_INDEXES = (('runtime', 'operation_state', 'last_event_id', 'maint_operation_state_last_event_idx'),
              ('runtime', 'job_runs', 'operation_id', 'maint_job_runs_operation_idx'))
IMAGE_SCOPE = """FROM runtime.receipt_jobs j JOIN runtime.receipt_assets a ON a.job_id=j.id
 WHERE j.image IS NOT NULL AND a.archive_state='ARCHIVED'
   AND a.object_key IS NOT NULL AND a.generation IS NOT NULL AND a.raw_sha256 IS NOT NULL"""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False, default=str)


def private_path(value, kind):
    path = Path(value).resolve()
    if path == REPOSITORY or REPOSITORY in path.parents or any(p.lower() in ('.git', 'github') for p in path.parts):
        raise SystemExit(f'{kind} must be outside the repository')
    return path


def connect(args):
    options = json.loads(private_path(args.connection_file, 'connection file').read_text(encoding='utf-8-sig'))
    if options.get('dbname') != 'mw_agent':
        raise SystemExit('connection file must target dbname mw_agent')
    if 'password_file' in options:
        options['password'] = Path(options.pop('password_file')).read_text().strip()
    options.setdefault('application_name', 'mw-agent-maintenance')
    conn = psycopg.connect(**options, autocommit=True)
    conn.execute('SET ROLE mw_agent_retention' if args.purge_function else 'SET ROLE mw_agent_owner')
    conn.execute("SET TIME ZONE 'UTC'")
    conn.execute("SET statement_timeout='15min'")
    if conn.execute('SELECT current_database()').fetchone()[0] != 'mw_agent':
        raise SystemExit('wrong database')
    newest = conn.execute('SELECT environment FROM audit.operations ORDER BY created_at DESC LIMIT 1').fetchone()
    if not newest or newest[0] != args.expect_environment:
        raise SystemExit(f'environment fingerprint {newest and newest[0]!r} != --expect-environment {args.expect_environment!r}')
    return conn


def database_bytes(conn):
    return conn.execute("SELECT pg_database_size('mw_agent')").fetchone()[0]


# ---------------------------------------------------------------- null-archived-images

def null_archived_images(conn, args):
    rows, size = conn.execute('SELECT count(*),coalesce(sum(octet_length(j.image)),0)::bigint ' + IMAGE_SCOPE).fetchone()
    kept, kept_size = conn.execute('''SELECT count(*),coalesce(sum(octet_length(image)),0)::bigint FROM runtime.receipt_jobs j
        WHERE image IS NOT NULL AND j.id NOT IN (SELECT j.id ''' + IMAGE_SCOPE + ')').fetchone()
    report = {'eligible_rows': rows, 'eligible_image_bytes': size, 'kept_rows_with_image': kept, 'kept_image_bytes': kept_size,
              'applied': False, 'database_bytes': database_bytes(conn)}
    if not args.apply:
        return report
    nulled, started = 0, time.monotonic()
    while True:
        with conn.transaction():
            conn.execute("SET LOCAL lock_timeout='3s'")
            count = conn.execute('UPDATE runtime.receipt_jobs SET image=NULL WHERE id IN (SELECT j.id ' + IMAGE_SCOPE +
                                 ' ORDER BY j.id LIMIT %s FOR UPDATE OF j SKIP LOCKED)', (args.batch,)).rowcount
        nulled += count
        if not count:
            break
        time.sleep(args.pause)
    remaining = conn.execute('SELECT count(*) ' + IMAGE_SCOPE).fetchone()[0]
    if remaining:
        raise SystemExit(f'{remaining} eligible rows remain (locked by a worker?); rerun')
    report.update(applied=True, nulled_rows=nulled, seconds=round(time.monotonic() - started, 2))
    if not args.skip_vacuum:
        conn.execute('VACUUM (ANALYZE) runtime.receipt_jobs')
    report['database_bytes_after'] = database_bytes(conn)
    return report


# ---------------------------------------------------------------- audit-retention

def plan(conn, cutoff):
    c = sql.Literal(cutoff)
    conn.execute('DROP TABLE IF EXISTS pg_temp.rt_tree, pg_temp.rt_bad, pg_temp.rt_events, pg_temp.rt_runs')
    conn.execute(sql.SQL('''CREATE TEMP TABLE rt_tree AS WITH RECURSIVE tree(root,operation_id) AS (
        SELECT operation_id,operation_id FROM audit.operations WHERE parent_operation_id IS NULL AND created_at < {c}
        UNION ALL SELECT t.root,o.operation_id FROM tree t JOIN audit.operations o ON o.parent_operation_id=t.operation_id)
        SELECT root,operation_id FROM tree''').format(c=c))
    conn.execute('CREATE UNIQUE INDEX ON pg_temp.rt_tree(operation_id)')
    conn.execute('CREATE INDEX ON pg_temp.rt_tree(root)')
    conn.execute('ANALYZE pg_temp.rt_tree')
    conn.execute(sql.SQL('''CREATE TEMP TABLE rt_bad AS
        SELECT t.root FROM pg_temp.rt_tree t JOIN audit.operations o USING(operation_id)
          LEFT JOIN runtime.operation_state s USING(operation_id)
         WHERE o.created_at >= {c} OR o.action <> ALL({actions}) OR o.idempotency_key !~ {uuid4}
            OR o.service_name = ANY({services}) OR s.operation_id IS NULL OR s.state <> ALL({terminal})
        UNION SELECT t.root FROM pg_temp.rt_tree t JOIN audit.events e USING(operation_id) WHERE e.recorded_at >= {c}
        UNION SELECT t.root FROM pg_temp.rt_tree t JOIN runtime.job_runs j USING(operation_id)
         WHERE j.state='RUNNING' OR j.finished_at IS NULL OR j.finished_at >= {c}''').format(
        c=c, actions=sql.Literal(ROUTINE_ACTIONS), uuid4=sql.Literal(UUID4),
        services=sql.Literal(DETERMINISTIC_SERVICES), terminal=sql.Literal(TERMINAL_STATES)))
    kept_roots = conn.execute('SELECT count(*) FROM pg_temp.rt_bad').fetchone()[0]
    conn.execute('DELETE FROM pg_temp.rt_tree WHERE root IN (SELECT root FROM pg_temp.rt_bad)')
    conn.execute('''CREATE TEMP TABLE rt_events AS SELECT t.root,e.event_id FROM pg_temp.rt_tree t
        JOIN audit.events e USING(operation_id)''')
    conn.execute('''CREATE TEMP TABLE rt_runs AS SELECT t.root,j.run_id FROM pg_temp.rt_tree t
        JOIN runtime.job_runs j USING(operation_id)''')
    for table in ('rt_events', 'rt_runs'):
        conn.execute(sql.SQL('CREATE INDEX ON pg_temp.{}(root)').format(sql.Identifier(table)))
        conn.execute(sql.SQL('ANALYZE pg_temp.{}').format(sql.Identifier(table)))
    roots, operations = conn.execute('SELECT count(DISTINCT root),count(*) FROM pg_temp.rt_tree').fetchone()
    counts = {}
    for table, _, keyset, column in EXPORTS:
        schema, name = table.split('.')
        counts[table] = conn.execute(sql.SQL('''SELECT count(*),coalesce(sum(pg_column_size(x.*)),0)::bigint FROM {} x
            WHERE x.{col} IN (SELECT {col} FROM pg_temp.{k})''').format(
            sql.Identifier(schema, name), col=sql.Identifier(column), k=sql.Identifier(keyset))).fetchone()
    return {'cutoff': cutoff.isoformat(), 'eligible_roots': roots, 'eligible_operations': operations,
            'kept_old_roots': kept_roots, 'rows': {t: v[0] for t, v in counts.items()},
            'row_bytes_estimate': {t: v[1] for t, v in counts.items()}}


def export(conn, directory):
    files = {}
    for table, order, keyset, column in EXPORTS:
        schema, name = table.split('.')
        path = directory / f'{schema}.{name}.jsonl.gz'
        rows = 0
        with open(path, 'xb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as stream, conn.transaction():
            with conn.cursor(name='rt_export') as cursor:
                cursor.itersize = 5000
                cursor.execute(sql.SQL('''SELECT row_to_json(x)::text FROM {} x
                    WHERE x.{col} IN (SELECT {col} FROM pg_temp.{k}) ORDER BY x.{o}''').format(
                    sql.Identifier(schema, name), col=sql.Identifier(column), k=sql.Identifier(keyset), o=sql.Identifier(order)))
                for (line,) in cursor:
                    stream.write(line.encode() + b'\n')
                    rows += 1
        data = path.read_bytes()
        files[path.name] = {'table': table, 'rows': rows, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                            'md5_base64': base64.b64encode(hashlib.md5(data).digest()).decode()}
    return files


def gcs_token(source):
    if source == 'gcloud':
        return subprocess.run(['gcloud', 'auth', 'print-access-token'], check=True, capture_output=True, text=True).stdout.strip()
    sys.path.insert(0, str(REPOSITORY / 'integration-agent' / 'src'))
    from mw_integration_agent.http import access_token
    return access_token(timeout=10)


def upload(target, objects, directory, token_source, readback):
    """Create each object once (ifGenerationMatch=0); verify server size/md5 and optionally a sha256 readback."""
    results = {}
    if target.startswith('local:'):
        root = private_path(target[6:], 'local archive')
        for local, (key, meta) in objects.items():
            destination = root / key
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                raise SystemExit(f'archive object exists: {key}')
            shutil.copyfile(directory / local, destination)
            if hashlib.sha256(destination.read_bytes()).hexdigest() != meta['sha256']:
                raise SystemExit(f'archive verification failed: {key}')
            results[local] = {'object': f'{target}{key}', 'generation': 'local', 'verified': 'sha256'}
        return results
    if target != f'gs://{ARCHIVE_BUCKET}/{ARCHIVE_PREFIX}':
        raise SystemExit(f'archive target must be gs://{ARCHIVE_BUCKET}/{ARCHIVE_PREFIX}')
    token = gcs_token(token_source)
    for local, (key, meta) in objects.items():
        data = (directory / local).read_bytes()
        url = (f'https://storage.googleapis.com/upload/storage/v1/b/{ARCHIVE_BUCKET}/o?' +
               urllib.parse.urlencode({'uploadType': 'media', 'name': key, 'ifGenerationMatch': '0'}))
        request = urllib.request.Request(url, data=data, method='POST', headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': meta.get('content_type', 'application/gzip')})
        with urllib.request.urlopen(request, timeout=300) as response:
            stored = json.loads(response.read())
        if stored.get('name') != key or int(stored['size']) != len(data) or stored.get('md5Hash') != meta['md5_base64']:
            raise SystemExit(f'archive verification failed: {key}')
        verified = 'server size+md5'
        if readback:
            get = urllib.request.Request(f'https://storage.googleapis.com/storage/v1/b/{ARCHIVE_BUCKET}/o/' +
                                         urllib.parse.quote(key, safe='') + '?alt=media&generation=' + stored['generation'],
                                         headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(get, timeout=300) as response:
                if hashlib.sha256(response.read()).hexdigest() != meta['sha256']:
                    raise SystemExit(f'archive readback differs: {key}')
            verified += '+sha256 readback'
        results[local] = {'object': f'gs://{ARCHIVE_BUCKET}/{key}', 'generation': stored['generation'], 'verified': verified}
    return results


def ensure_fk_indexes(conn):
    created = []
    for schema, table, column, name in FK_INDEXES:
        present = conn.execute('''SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
            WHERE i.indrelid=%s::regclass AND a.attname=%s AND i.indisvalid''', (f'{schema}.{table}', column)).fetchone()
        if not present:
            conn.execute(sql.SQL('DROP INDEX CONCURRENTLY IF EXISTS {}').format(sql.Identifier(schema, name)))
            conn.execute(sql.SQL('CREATE INDEX CONCURRENTLY {} ON {} ({})').format(
                sql.Identifier(name), sql.Identifier(schema, table), sql.Identifier(column)))
            created.append((schema, name))
    return created


def drop_indexes(conn, created):
    for schema, name in created:
        conn.execute(sql.SQL('DROP INDEX CONCURRENTLY IF EXISTS {}').format(sql.Identifier(schema, name)))


def delete_batches(conn, batch, pause, cutoff=None, purge_function=False):
    roots = [r[0] for r in conn.execute('SELECT DISTINCT root FROM pg_temp.rt_tree ORDER BY root').fetchall()]
    keysets = {'runtime.job_runs': ('run_id', 'rt_runs'), 'runtime.operation_state': ('operation_id', 'rt_tree'),
               'audit.events': ('event_id', 'rt_events'), 'audit.operations': ('operation_id', 'rt_tree')}
    totals = dict.fromkeys(DELETE_ORDER, 0)
    longest = 0.0
    def owner_batch(chunk):
        counts = []
        with conn.transaction():
            # DISABLE/ENABLE TRIGGER is transactional: no other session ever sees the triggers off.
            conn.execute("SET LOCAL lock_timeout='5s'")
            # Agent writers take audit.operations before audit.events; lock in that order before the trigger DDL
            # so a batch cannot deadlock with them (16 October 2026 PROD run hit exactly that with the reverse order).
            conn.execute('LOCK TABLE audit.operations, audit.events IN SHARE ROW EXCLUSIVE MODE')
            conn.execute('ALTER TABLE audit.operations DISABLE TRIGGER operations_append_only')
            conn.execute('ALTER TABLE audit.events DISABLE TRIGGER events_append_only')
            for table in DELETE_ORDER:
                schema, name = table.split('.')
                column, keyset = keysets[table]
                counts.append(conn.execute(sql.SQL('DELETE FROM {} WHERE {c} IN (SELECT {c} FROM pg_temp.{k} WHERE root = ANY(%s))').format(
                    sql.Identifier(schema, name), c=sql.Identifier(column), k=sql.Identifier(keyset)), (chunk,)).rowcount)
            conn.execute('ALTER TABLE audit.operations ENABLE TRIGGER operations_append_only')
            conn.execute('ALTER TABLE audit.events ENABLE TRIGGER events_append_only')
        return counts

    def function_batch(chunk):
        # V5: the owner-side function re-checks the rules for the whole trees under these roots, disables and
        # re-enables the append-only triggers in its own transaction and returns what it deleted.
        with conn.transaction():
            return list(conn.execute('SELECT deleted_job_runs,deleted_operation_states,deleted_events,deleted_operations '
                                     'FROM audit.purge_routine_trees(%s,%s)', (chunk, cutoff)).fetchone())

    run_batch = function_batch if purge_function else owner_batch
    for start in range(0, len(roots), batch):
        chunk = roots[start:start + batch]
        began = time.monotonic()
        for attempt in range(1, 6):
            try:
                counts = run_batch(chunk)
                break
            except (psycopg.errors.DeadlockDetected, psycopg.errors.LockNotAvailable):
                # The batch transaction rolled back as a whole; nothing of it is applied, so a retry is safe.
                if attempt == 5:
                    raise
                time.sleep(min(30, 2 ** attempt))
        for table, count in zip(DELETE_ORDER, counts):
            totals[table] += count
        longest = max(longest, time.monotonic() - began)
        time.sleep(pause)
    return totals, round(longest, 3)


def record(conn, args, run_id, summary):
    generation = conn.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()
    if not generation:
        raise SystemExit('runtime.service_control has no agent generation')
    operation, event = uuid.uuid4(), uuid.uuid4()
    plan_text = canonical(summary)
    payload = {'deleted': summary['deleted'], 'manifest_object': summary['manifest_object']}
    with conn.transaction():
        conn.execute('''INSERT INTO audit.operations(operation_id,service_name,idempotency_key,environment,action,actor_kind,
            actor_id,plan,plan_sha256,code_version,policy_version,process_generation)
            VALUES (%s,'audit-retention',%s,%s,'CONFIG','operator',%s,%s::jsonb,%s,%s,%s,%s)''',
            (operation, str(run_id), args.expect_environment, args.actor, plan_text, hashlib.sha256(plan_text.encode()).hexdigest(),
             'maintenance:' + summary['script_sha256'][:12], POLICY, generation[0]))
        conn.execute('''INSERT INTO audit.events(event_id,operation_id,operation_seq,event_kind,route,occurred_at,payload,payload_sha256)
            VALUES (%s,%s,1,'completed','internal',clock_timestamp(),%s::jsonb,%s)''',
            (event, operation, canonical(payload), hashlib.sha256(canonical(payload).encode()).hexdigest()))
        # One INSERT in its final state: the retention role holds INSERT, not UPDATE, on operation_state.
        conn.execute('''INSERT INTO runtime.operation_state(operation_id,state,next_event_seq,last_event_id)
            VALUES (%s,'COMPLETED',2,%s)''', (operation, event))
    return str(operation)


def audit_retention(conn, args):
    if args.older_than_days < MIN_DAYS:
        raise SystemExit(f'--older-than-days must be >= {MIN_DAYS}')
    if args.archive.startswith('local:') and args.expect_environment == 'production':
        raise SystemExit('production exports go to GCS only')
    cutoff = conn.execute('SELECT now() - make_interval(days=>%s)', (args.older_than_days,)).fetchone()[0]
    started = time.monotonic()
    report = {'database_bytes': database_bytes(conn), **plan(conn, cutoff)}
    report['plan_seconds'] = round(time.monotonic() - started, 2)
    if not (args.export or args.apply) or not report['eligible_roots']:
        report['applied'] = False
        return report
    run_id = uuid.uuid4()
    directory = private_path(args.work_directory, 'work directory') / f'audit-retention-{run_id}'
    directory.mkdir(mode=0o700, parents=False)
    began = time.monotonic()
    files = export(conn, directory)
    report['export_seconds'] = round(time.monotonic() - began, 2)
    for meta in files.values():
        if meta['rows'] != report['rows'][meta['table']]:
            raise SystemExit(f'export count mismatch for {meta["table"]}')
    month = datetime.now(UTC).strftime('%Y-%m')
    prefix = f'{ARCHIVE_PREFIX}{month}/{run_id}/'
    script_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    began = time.monotonic()
    uploaded = upload(args.archive, {k: (prefix + k, v) for k, v in files.items()}, directory, args.token_source, args.readback)
    manifest = {'format': 'mw-agent-audit-archive-v1', 'run_id': str(run_id), 'created_at': datetime.now(UTC).isoformat(),
                'database': 'mw_agent', 'environment': args.expect_environment, 'cutoff': report['cutoff'],
                'selection': {'routine_actions': ROUTINE_ACTIONS, 'terminal_states': TERMINAL_STATES, 'idempotency_key': 'uuid4',
                              'excluded_services': DETERMINISTIC_SERVICES, 'unit': 'whole operation tree, all rows older than cutoff'},
                'script_sha256': script_sha256,
                'files': {k: {**v, **uploaded[k]} for k, v in files.items()}}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    data = (directory / 'manifest.json').read_bytes()
    manifest_meta = {'sha256': hashlib.sha256(data).hexdigest(), 'md5_base64': base64.b64encode(hashlib.md5(data).digest()).decode(),
                     'content_type': 'application/json'}
    stored = upload(args.archive, {'manifest.json': (prefix + 'manifest.json', manifest_meta)}, directory, args.token_source, args.readback)
    report.update(upload_seconds=round(time.monotonic() - began, 2), run_id=str(run_id), local_directory=str(directory),
                  manifest_object=stored['manifest.json']['object'], manifest_sha256=manifest_meta['sha256'],
                  files={k: {'rows': v['rows'], 'bytes': v['bytes'], 'sha256': v['sha256'], 'object': uploaded[k]['object'],
                             'verified': uploaded[k]['verified']} for k, v in files.items()})
    if not args.apply:
        report['applied'] = False
        return report
    created = []
    if not args.purge_function:  # V5 made the indexes permanent; the retention role cannot create indexes anyway
        began = time.monotonic()
        created = ensure_fk_indexes(conn)
        report.update(temporary_indexes=[f'{a}.{b}' for a, b in created], index_seconds=round(time.monotonic() - began, 2))
    began = time.monotonic()
    try:
        deleted, longest = delete_batches(conn, args.batch, args.pause, cutoff, args.purge_function)
    finally:
        drop_indexes(conn, created)
    if deleted != report['rows']:
        raise SystemExit(f'deleted {deleted} != exported {report["rows"]}')
    report.update(applied=True, deleted=deleted, delete_seconds=round(time.monotonic() - began, 2), longest_batch_seconds=longest)
    report['record_operation'] = record(conn, args, run_id, {
        'run_id': str(run_id), 'cutoff': report['cutoff'], 'deleted': deleted, 'manifest_object': report['manifest_object'],
        'manifest_sha256': report['manifest_sha256'], 'script_sha256': script_sha256})
    if not args.skip_vacuum:
        began = time.monotonic()
        for table in DELETE_ORDER:
            schema, name = table.split('.')
            conn.execute(sql.SQL('VACUUM (ANALYZE) {}').format(sql.Identifier(schema, name)))
        report['vacuum_seconds'] = round(time.monotonic() - began, 2)
    if args.discard_local:
        shutil.rmtree(directory)
        report['local_directory'] = None
    report['database_bytes_after'] = database_bytes(conn)
    return report


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('command', choices=['null-archived-images', 'audit-retention'])
    p.add_argument('--connection-file', required=True)
    p.add_argument('--expect-environment', required=True, choices=['production', 'development', 'test'])
    p.add_argument('--apply', action='store_true', help='make the change (default: dry run with counts)')
    p.add_argument('--batch', type=int, default=None, help='rows (images) or operation trees (retention) per transaction')
    p.add_argument('--pause', type=float, default=0.2, help='seconds between batches')
    p.add_argument('--skip-vacuum', action='store_true')
    p.add_argument('--output', help='private JSON report path')
    r = p.add_argument_group('audit-retention')
    r.add_argument('--older-than-days', type=int, default=MIN_DAYS, help=f'cutoff age in days (default and minimum {MIN_DAYS})')
    r.add_argument('--export', action='store_true', help='export and verify only, no delete')
    r.add_argument('--archive', default=f'gs://{ARCHIVE_BUCKET}/{ARCHIVE_PREFIX}', help='GCS target, or local:<dir> for a disposable lab')
    r.add_argument('--work-directory', help='private local directory for the export (required with --export/--apply)')
    r.add_argument('--token-source', choices=['metadata', 'gcloud'], default='metadata')
    r.add_argument('--readback', action='store_true', help='also GET each object and compare sha256 (needs objects.get)')
    r.add_argument('--actor', default='operator', help='operator identity recorded on the CONFIG operation')
    r.add_argument('--discard-local', action='store_true', help='remove the local export once the delete has committed')
    r.add_argument('--purge-function', action='store_true',
                   help='SET ROLE mw_agent_retention and delete through audit.purge_routine_trees() (V5) instead of as the owner')
    args = p.parse_args(argv)
    if args.batch is None:
        args.batch = 50 if args.command == 'null-archived-images' else 2000
    if args.purge_function and (args.command != 'audit-retention' or args.batch > 2000):
        p.error('--purge-function applies to audit-retention with --batch <= 2000')
    if args.command == 'audit-retention' and (args.export or args.apply) and not args.work_directory:
        p.error('--work-directory is required with --export/--apply')
    with connect(args) as conn:
        report = (null_archived_images if args.command == 'null-archived-images' else audit_retention)(conn, args)
    report = {'command': args.command, 'environment': args.expect_environment, **report}
    if args.output:
        private_path(args.output, 'output').write_text(json.dumps(report, indent=2, default=str) + '\n')
    print(json.dumps(report, default=str))


if __name__ == '__main__':
    main()
