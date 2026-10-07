"""Read-only final preservation check against the verified V73 receiving backup."""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

repo = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--evidence-dir', default='outputs/r051-payment-performance')
p.add_argument('--expected-version', type=int, default=73)
args = p.parse_args()
out = (repo / args.evidence_dir).resolve()
assert out.is_relative_to((repo / 'outputs').resolve())
backup = json.loads((out / 'vm01-development-backup.json').read_text())
assert backup['restored_fingerprints_match']
assert hashlib.sha256(Path(backup['backup_file']).read_bytes()).hexdigest() == backup['backup_sha256']
before = json.loads((Path(backup['backup_file']).parent / 'fingerprints.json').read_text())
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == (
    'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'],
                     user=target['user'], password=Path(target['passwordFile']).read_text().strip(),
                     sslmode='require', connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone() == ('loan_manager_dev', target['host'])
    version,checksum=c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
    assert version == str(args.expected_version)
    after = {}
    for schema, table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        count, digest = c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema), sql.Identifier(table))).fetchone()
        after[schema + '.' + table] = {'count': count, 'digest': digest}
    excluded = {'public.Cash Account Daily Analytics', 'public.Daily Analytics', 'public.Statistics'}
    if args.expected_version != backup['baseline_version']: excluded.add('public.flyway_schema_history')
    equality = {name: value == after.get(name) for name, value in before.items() if name not in excluded}
    nonowner = c.execute('SELECT count(*) FROM "Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchone()[0]
    actor_matches = c.execute('SELECT count(*) FROM "Partners" WHERE lower(trim("Login Email"))=\'welct0407@mw-credit.com\'').fetchone()[0]
    result = {'at': datetime.now(timezone.utc).isoformat(), 'version': args.expected_version, 'checksum': checksum,
              'unchanged_tables': equality, 'all_equal': all(equality.values()),
              'derived_tables_excluded': sorted(excluded), 'nonowner_delivery_addresses': nonowner,
              'owner_actor_mapping_count': actor_matches,
              'migration_sha256': hashlib.sha256(next((repo / 'database/migrations').glob(f'V{args.expected_version}__*')).read_bytes()).hexdigest()}
    (out / 'final-preservation.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    assert set(before) == set(after) and all(equality.values()), 'Existing source/audit rows changed; reconcile'
    assert nonowner == 0 and actor_matches == 1
    print(json.dumps({'unchanged_tables': len(equality), 'all_equal': True, 'nonowner_delivery_addresses': nonowner, 'owner_actor_mapping_count': actor_matches}))
