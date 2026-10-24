"""R095 one-time backfill of borrowers' payer name ("Communication Name") from their recent receipts.

  plan   Read-only. For every borrower with an empty payer name (or every borrower with --include-stored, for a
         plan made before V111 clears the column), take up to the 7 most recent payments whose receipt reference
         resolves under the environment's exact rules, download each image (exact generation, SHA-256 where the
         reference or metadata pins it), recognize it with the agent's prompt and schema through its Gemini/Vertex
         provider (this session's credentials, bounded concurrency 2, retries) and propose payer lines with
         payer_name.learn: line 1 the most frequent name, later lines other payers. CONSISTENT (7 names, one line),
         FEWER (fewer names, one line), CONFLICT (several lines) or NONE, plus line collisions between borrowers.
         Writes the private plan JSON, a Markdown report and a decisions template to --private-dir (outside Git);
         stdout carries counts only. --cache-only re-plans from saved recognitions (no download, no model call).
  apply  Takes the plan and the owner's decisions (lines per borrower id or nickname; they override the plan;
         CONSISTENT and FEWER rows without a collision apply by default; the decisions are bound to the plan's SHA-256).
         Refuses unless the database has V111 (flyway >= 111). One transaction: database and V111 guards, row locks,
         the joined lines written only where the column is still empty (the commands' guard with before = NULL), and
         the locked/expected/actual assertions, so any drift aborts it and nothing is written.
           --dry-run  counts only (read identity).
           (default)  writes the transaction to a private SQL file for review; no write.
           --execute  runs it as postgres over the migration route of Invoke-CloudFlyway.py (the tunnel and the admin
                      credential from Secret Manager, in memory only, the session verified against the fixed target);
                      needs --approval-reference; writes a private receipt with before and after counts (first as
                      pending-reconciliation, so an interrupted run is reconciled with --verify, never retried blindly).
           --verify   read-only readback counts (written, still empty, other, missing).

  python3 scripts/database/Backfill-PayerNames.py plan  --env dev|prod --private-dir DIR [--include-stored]
          [--native-catalog FILE] [--limit-borrowers N] [--gemini-model ID] [--cache-only]
  python3 scripts/database/Backfill-PayerNames.py apply --env dev|prod --plan FILE --decisions FILE --private-dir DIR
          [--dry-run | --verify | --execute --approval-reference TEXT]

Route: scripts/database/cloud-db-tunnel.sh, read identity codex-cloud-read (impersonated login token, read-only
session). AppSheet-era references resolve only through a reviewed native catalog file (never a guessed key).
"""
import argparse
import contextlib
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'integration-agent/src'))
from mw_integration_agent.payer_name import compare, display, hint_key, joined, learn, lines, readable, valid_lines  # noqa: E402  (pure module)

PROJECT = 'clever-oasis-508610-n7'
INSTANCE = 'mw-credit-pg-20261017'
HOST = '136.85.127.134'
SYSTEM_IDENTIFIER = 7685391508477894672
READ_SERVICE_ACCOUNT = 'codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com'
READ_USER = 'codex-cloud-read@clever-oasis-508610-n7.iam'
BUCKET = 'mw-payment-receipts-prod-508610-n7'
WINDOW = 7
V111 = 111
# Exact per-environment mappings (services/receipts/dev-receipt-adapter.mjs, native-catalog.mjs, production-native-catalog.mjs).
ENVIRONMENTS = {
    'dev': {'database': 'loan_manager_dev', 'target': 'development',
            'manual_prefix': 'manual-receipts/dev/pwa/',
            'object_prefix': 'appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/',
            'native_root': 'appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/'},
    'prod': {'database': 'loan_manager_prod', 'target': 'production',
             'manual_prefix': 'manual-receipts/prod/pwa/',
             'object_prefix': 'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/pwa/',
             'native_root': 'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/'},
}
REASONS = ('reference_other_environment', 'reference_unsupported', 'appsheet_reference_no_catalog',
           'appsheet_reference_not_in_catalog', 'agent_projection_mismatch')
OUTCOMES = ('name', 'no_payer_name', 'not_payment_receipt', 'image_unavailable', 'recognition_unavailable')
HEX64 = re.compile(r'[a-f0-9]{64}')


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


# ---------------------------------------------------------------- reference rules (pure)
def parse_catalog(raw, env):
    """A reviewed native catalog ({environment, bucket, objectRoot, entries}) for this environment, keyed by reference hash."""
    rules = ENVIRONMENTS[env]
    value = json.loads(raw)
    if (not isinstance(value, dict) or value.get('schemaVersion') != 1 or value.get('environment') != env
            or value.get('bucket') != BUCKET or value.get('objectRoot') != rules['native_root']
            or not isinstance(value.get('entries'), list) or len(value['entries']) > 256):
        raise ValueError('Invalid native catalog for this environment')
    entries = {}
    for row in value['entries']:
        if (not isinstance(row, dict) or set(row) != {'generation', 'key', 'keySha256', 'mimeType', 'referenceSha256', 'sha256', 'sizeBytes'}
                or not all(isinstance(row[k], str) and HEX64.fullmatch(row[k]) for k in ('referenceSha256', 'keySha256', 'sha256'))
                or not isinstance(row['key'], str) or not row['key'].startswith(rules['native_root']) or row['key'].startswith(rules['object_prefix'])
                or sha(row['key']) != row['keySha256'] or not re.fullmatch(r'[1-9][0-9]{0,29}', str(row['generation']))
                or row['mimeType'] not in ('image/png', 'image/jpeg', 'image/webp')
                or type(row['sizeBytes']) is not int or not 1 <= row['sizeBytes'] <= 5242880
                or row['referenceSha256'] in entries):
            raise ValueError('Invalid native catalog entry')
        entries[row['referenceSha256']] = row
    return entries


def locate(row, env, catalog=None):
    """(locator, None) or (None, reason) for one payment row; manual first, as the command service's preferred kind."""
    rules = ENVIRONMENTS[env]
    manual = (row.get('manual') or '').strip() and row['manual']
    agent = (row.get('agent') or '').strip() and row['agent']
    reference = manual or agent
    if manual:
        match = re.fullmatch(re.escape(rules['manual_prefix']) + r'([a-f0-9]{32})/([a-f0-9]{32})\.(png|jpg)', manual)
        if match:
            return {'kind': 'pwa', 'key': rules['object_prefix'] + match[1] + '/' + match[2] + '.' + match[3],
                    'mimeType': 'image/png' if match[3] == 'png' else 'image/jpeg', 'sha256': None, 'generation': None,
                    'environment': env, 'referenceSha256': sha(manual)}, None
        if not manual.startswith('manual-receipts/' + env + '/'):
            other = any(manual.startswith('manual-receipts/' + e + '/') for e in ENVIRONMENTS if e != env)
            return None, 'reference_other_environment' if other else 'reference_unsupported'
        if catalog is None:
            return None, 'appsheet_reference_no_catalog'
        entry = catalog.get(sha(manual))
        if not entry:
            return None, 'appsheet_reference_not_in_catalog'
        return {'kind': 'native', 'key': entry['key'], 'mimeType': entry['mimeType'], 'sha256': entry['sha256'],
                'generation': str(entry['generation']), 'sizeBytes': entry['sizeBytes'], 'referenceSha256': entry['referenceSha256']}, None
    match = re.fullmatch(r'//receipts/(dev|prod)/(\d{4})/(\d{2})/(\d{2})/([a-f0-9]{64})/([a-f0-9]{64})\.(jpg|png|webp)', reference)
    if not match:
        return None, 'reference_unsupported'
    if match[1] != env:
        return None, 'reference_other_environment'
    try:
        datetime.strptime(match[2] + match[3] + match[4], '%Y%m%d')
    except ValueError:
        return None, 'reference_unsupported'
    if env == 'prod':
        received = row.get('agentReceivedAt')
        if row.get('agentReceiptId') != match[5] or not isinstance(received, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?', received):
            return None, 'agent_projection_mismatch'
    return {'kind': 'agent', 'key': reference[2:], 'mimeType': 'image/jpeg' if match[7] == 'jpg' else 'image/' + match[7],
            'sha256': match[6], 'generation': None, 'referenceSha256': sha(reference)}, None


def verify_object(locator, meta, data):
    """The downloaded generation is the referenced one: type, size and SHA-256 (from the key, catalog or metadata)."""
    if meta.get('contentType') != locator['mimeType'] or not data or len(data) > 12_000_000 or str(meta.get('size')) != str(len(data)):
        return False
    if locator.get('generation') and str(meta.get('generation')) != locator['generation']:
        return False
    if locator.get('sizeBytes') and len(data) != locator['sizeBytes']:
        return False
    digest = sha(data)
    if locator['kind'] == 'pwa':
        custom = meta.get('metadata') or {}
        return custom.get('environment') == locator['environment'] and custom.get('sha256') == digest
    return digest == locator['sha256']


# ---------------------------------------------------------------- classification (pure)
def classify(receipts):
    """receipts: newest first, each {'name': str|None, 'date': 'YYYY-MM-DD'|None, 'outcome': ...}. Proposes payer lines:
    line 1 the most frequent name (ties: the latest), then every other name in order of first appearance through
    payer_name.learn (a match with more unmasked letters replaces, a match or near is kept, anything else appends)."""
    names = [(i, r) for i, r in enumerate(receipts) if r.get('name') and readable(r['name'])]
    reasons = {}
    for r in receipts:
        if not (r.get('name') and readable(r['name'])):
            key = r.get('outcome') if r.get('outcome') != 'name' else 'no_payer_name'
            reasons[key] = reasons.get(key, 0) + 1
    candidates = {}
    for i, r in names:
        item = candidates.setdefault(r['name'], {'name': r['name'], 'count': 0, 'latestDate': None, 'order': i})
        item['count'] += 1
        if r.get('date') and (item['latestDate'] is None or r['date'] > item['latestDate']):
            item['latestDate'] = r['date']
    listed = sorted(candidates.values(), key=lambda c: (-c['count'], c['order']))
    candidates = [{k: c[k] for k in ('name', 'count', 'latestDate')} for c in listed]
    if not names:
        return {'status': 'NONE', 'lines': [], 'candidates': [], 'reasons': reasons}
    proposed = [listed[0]['name']]
    for _, r in reversed(names):  # oldest first: order of first appearance
        proposed = learn(proposed, r['name']) or proposed
    if len(proposed) > 1:
        status = 'CONFLICT'
    else:
        status = 'CONSISTENT' if len(names) == WINDOW else 'FEWER'
    return {'status': status, 'lines': proposed, 'candidates': candidates, 'reasons': reasons}


def collisions(borrowers, stored):
    """Borrower id -> other borrower ids with a proposed (or stored) line that is match or near any of its proposed lines."""
    def hit(mine, theirs):
        return any(compare(a, b) in ('match', 'near') or compare(b, a) in ('match', 'near') for a in mine for b in theirs)
    found = {}
    for b in borrowers:
        if not b.get('lines'):
            continue
        hits = [o['id'] for o in borrowers if o['id'] != b['id'] and o.get('lines') and hit(b['lines'], o['lines'])]
        hits += [i for i, text in stored.items() if i != b['id'] and hit(b['lines'], lines(text))]
        if hits:
            found[b['id']] = sorted(set(hits))
    return found


def is_exception(b):
    return b['status'] not in ('CONSISTENT', 'FEWER') or bool(b.get('collisions'))


def counts(borrowers):
    result = {s: 0 for s in ('CONSISTENT', 'FEWER', 'CONFLICT', 'NONE')}
    for b in borrowers:
        result[b['status']] += 1
    result['collisions'] = sum(1 for b in borrowers if b.get('collisions'))
    result['exceptions'] = sum(1 for b in borrowers if is_exception(b))
    result['borrowers'] = len(borrowers)
    return result


def report(plan):
    def cell(value):
        return str(value or '').replace('|', '\\|').replace('\n', ' ')

    def candidates(b):
        return '<br>'.join(f"{cell(c['name'])} ×{c['count']} ({c['latestDate'] or '?'})" for c in b['candidates']) or '—'

    def proposed(b):
        return '<br>'.join(f'{n}. {cell(line)}' for n, line in enumerate(b.get('lines') or [], 1)) or '—'
    c = counts(plan['borrowers'])
    out = [f"# Payer name backfill plan — {plan['environment']}", '',
           f"Generated {plan['generatedAt']} · database {plan['database']} · flyway {plan['flywayVersion']} · model {plan['model']} · plan SHA-256 in the decisions template.",
           '', f"Borrowers {c['borrowers']}: CONSISTENT {c['CONSISTENT']}, FEWER {c['FEWER']}, CONFLICT {c['CONFLICT']}, NONE {c['NONE']}; collisions {c['collisions']}.",
           '', 'Payer lines: line 1 the borrower, later lines people who pay for them (max 5); `?` is one unknown letter.',
           'Fill the choice for each exception in decisions-template.json (`{"action":"set","lines":["…", …]}` or `{"action":"skip"}`;',
           '`{"planLine":1}` stands for the plan\'s line 1; `byName` keys a decision by borrower nickname instead of id).',
           'CONSISTENT and FEWER rows without a collision apply unless overridden there.', '', '## Exceptions', '',
           '| Borrower id | Name (Thai) | Name (English) | Status | Candidates (count, latest) | Proposed lines | Notes | Choice |',
           '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for b in plan['borrowers']:
        if is_exception(b):
            notes = '; '.join(([f"collides with {', '.join(b['collisions'])}"] if b.get('collisions') else [])
                              + [f"{k} {v}" for k, v in sorted(b['reasons'].items())])
            out.append(f"| {cell(b['id'])} | {cell(b['nameTh'])} | {cell(b['nameEn'])} | {b['status']} | {candidates(b)} | {proposed(b)} | {cell(notes)} | ____ |")
    out += ['', '## Applied by default (CONSISTENT, FEWER)', '',
            '| Borrower id | Name (Thai) | Name (English) | Status | Candidates (count, latest) | Proposed lines |', '| --- | --- | --- | --- | --- | --- |']
    for b in plan['borrowers']:
        if not is_exception(b):
            out.append(f"| {cell(b['id'])} | {cell(b['nameTh'])} | {cell(b['nameEn'])} | {b['status']} | {candidates(b)} | {proposed(b)} |")
    return '\n'.join(out) + '\n'


# ---------------------------------------------------------------- decisions and SQL (pure)
def decision_lines(b, d):
    """The lines of one 'set' decision, {"planLine": n} filled from the plan; refuses anything unclear."""
    values = d.get('lines')
    if not isinstance(values, list) or not values:
        raise ValueError('Invalid decision for ' + b['id'])
    result = []
    for item in values:
        if isinstance(item, dict):
            n = item.get('planLine')
            if set(item) != {'planLine'} or type(n) is not int or not 1 <= n <= len(b.get('lines') or []):
                raise ValueError('Plan line missing for ' + b['id'])
            item = b['lines'][n - 1]
        result.append(item)
    if not valid_lines(result) or any(v != unicodedata.normalize('NFC', v) or not readable(v) for v in result):
        raise ValueError('Invalid lines for ' + b['id'])
    for x, a in enumerate(result):
        for y in range(x + 1, len(result)):
            if compare(a, result[y]) in ('match', 'near') or compare(result[y], a) in ('match', 'near'):
                placeholder = any(isinstance(values[i], dict) for i in (x, y))
                raise ValueError(f"{'Plan line is the decided payer line itself (own name not observed)' if placeholder else 'Repeated line'} for {b['id']}")
    return result


def decide(plan, plan_sha256, decisions):
    """Borrower id -> payer lines to write, from the plan and the owner's decisions (by id or by nickname)."""
    if (decisions.get('schemaVersion') != 1 or decisions.get('planSha256') != plan_sha256 or not isinstance(decisions.get('decisions'), dict)
            or not isinstance(decisions.get('byName', {}), dict)):
        raise ValueError('Decisions do not belong to this plan')
    known = {b['id']: b for b in plan['borrowers']}
    entries = list(decisions['decisions'].items())
    for nick, d in decisions.get('byName', {}).items():
        key = hint_key(nick)
        found = [b['id'] for b in plan['borrowers'] if key and key in (hint_key(b.get('nameTh')), hint_key(b.get('nameEn')))]
        if len(found) != 1:
            raise ValueError(f'Nickname {nick!r} names {len(found)} borrowers in the plan')
        entries.append((found[0], d))
    chosen = {}
    for bid, d in entries:
        if bid not in known:
            raise ValueError('Decision for a borrower outside the plan')
        if d in (None, {}) or (isinstance(d, dict) and d.get('action') is None):
            continue
        if bid in chosen:
            raise ValueError('Two decisions for ' + bid)
        if not isinstance(d, dict) or d.get('action') not in ('set', 'skip'):
            raise ValueError('Invalid decision for ' + bid)
        chosen[bid] = decision_lines(known[bid], d) if d['action'] == 'set' else None
    result = {}
    for bid, b in known.items():
        if bid in chosen:
            if chosen[bid]:
                result[bid] = chosen[bid]
        elif not is_exception(b) and b.get('lines'):
            result[bid] = list(b['lines'])
    return result


def literal(text):
    return "'" + text.replace("'", "''") + "'"


def transaction_sql(env, values, expected):
    """The statements of the one backfill transaction (between BEGIN and COMMIT): database and V111 guards, row locks,
    the joined lines written only where the column is still empty (the commands' guard with before = NULL), and the
    locked/expected/actual assertions; any drift raises, so nothing is written."""
    database = ENVIRONMENTS[env]['database']
    rows = ',\n'.join(f"({literal(b)},{literal(joined(v))})" for b, v in sorted(values.items()))
    return f"""SET LOCAL standard_conforming_strings=on;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='60s';
DO $guard$ BEGIN
 IF current_database()<>'{database}' THEN RAISE EXCEPTION 'payer backfill: wrong database %',current_database(); END IF;
 IF coalesce((SELECT max(version::int) FROM public.flyway_schema_history WHERE success AND version ~ '^[0-9]+$'),0)<{V111} THEN
  RAISE EXCEPTION 'payer backfill: V111 is not applied (it would clear these values)'; END IF;
END $guard$;
CREATE TEMP TABLE payer_backfill(borrower text PRIMARY KEY, payer text NOT NULL) ON COMMIT DROP;
INSERT INTO payer_backfill(borrower,payer) VALUES
{rows};
DO $fill$
DECLARE locked integer;actual integer;
BEGIN
 SELECT count(*) INTO locked FROM (SELECT 1 FROM public."Borrowers" b JOIN payer_backfill p ON p.borrower=b."Row ID" ORDER BY b."Row ID" FOR UPDATE OF b) x;
 UPDATE public."Borrowers" b SET "Communication Name"=p.payer FROM payer_backfill p
  WHERE b."Row ID"=p.borrower AND coalesce(b."Communication Name",'') IS NOT DISTINCT FROM '';
 GET DIAGNOSTICS actual=ROW_COUNT;
 -- Any drift since the plan aborts the whole transaction (nothing is written): a borrower gone, or a name filled meanwhile.
 IF locked<>{len(values)} THEN RAISE EXCEPTION 'payer backfill: % of % decided borrowers found; rolled back',locked,{len(values)}; END IF;
 IF actual<>{expected} THEN RAISE EXCEPTION 'payer backfill: % rows would change, % expected; rolled back',actual,{expected}; END IF;
 RAISE NOTICE 'payer backfill: decided %, locked %, expected %, actual %',{len(values)},locked,{expected},actual;
END $fill$;
"""


def apply_sql(env, values, expected):
    """The same transaction as a psql script for review or the admin runner; --execute runs the identical statements."""
    return (f"-- R095 payer lines backfill ({env}); {len(values)} decided borrowers, {expected} still empty when emitted.\n"
            "\\set ON_ERROR_STOP on\nBEGIN;\n" + transaction_sql(env, values, expected) + "COMMIT;\n")


SELECT_PAYERS = 'SELECT "Row ID","Communication Name" FROM public."Borrowers" WHERE "Row ID"=ANY(%s)'


def run_transaction(connection, env, values, expected):
    """Run the transaction on an admin connection (autocommit off) and return its RAISE NOTICE count lines; a guard
    raises and the transaction is rolled back (nothing written)."""
    notices = []
    connection.add_notice_handler(lambda diag: notices.append(diag.message_primary))
    try:
        connection.execute(transaction_sql(env, values, expected))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return [n for n in notices if n and n.startswith('payer backfill:')]


def readback(connection, values):
    """Counts only: decided rows whose payer column now equals the decided lines, still empty, other, or missing."""
    rows = dict(connection.execute(SELECT_PAYERS, (list(values),)).fetchall())
    result = {'decided': len(values), 'written': 0, 'empty': 0, 'other': 0, 'missing': 0}
    for bid, v in values.items():
        if bid not in rows:
            result['missing'] += 1
        elif rows[bid] == joined(v):
            result['written'] += 1
        elif (rows[bid] or '') == '':
            result['empty'] += 1
        else:
            result['other'] += 1
    return result


# ---------------------------------------------------------------- private files and IO
def private_dir(path, create=False):
    target = Path(path).expanduser().resolve()
    if not Path(path).expanduser().is_absolute() or target == REPO or REPO in target.parents:
        raise ValueError('--private-dir must be an absolute path outside the repository')
    if create:
        target.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.chmod(0o700)
    if not target.is_dir():
        raise ValueError('--private-dir must exist')
    return target


def private_file(path):
    target = Path(path).expanduser().resolve()
    if target == REPO or REPO in target.parents:
        raise ValueError('Private inputs must be outside the repository')
    return target


def write_private(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(text)


def connect(env):
    import subprocess
    sys.path.insert(0, '/workspace/.setup/python-deps')
    import psycopg
    if any(os.environ.get(k) for k in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'DATABASE_URL')):
        raise ValueError('Remove ambient database routing overrides')
    rules = ENVIRONMENTS[env]
    target = json.loads((REPO / 'database/environments.json').read_text())[rules['target']]
    if (target['instance'], target['host'], target['database']) != (INSTANCE, HOST, rules['database']):
        raise ValueError('Wrong fixed environment tuple')
    project = subprocess.check_output(['gcloud', 'config', 'get-value', 'project'], text=True, stderr=subprocess.DEVNULL).strip()
    if project != PROJECT:
        raise ValueError('Wrong GCP project')
    subprocess.run(['bash', str(REPO / 'scripts/database/cloud-db-tunnel.sh')], check=True, stdout=subprocess.DEVNULL)
    password = subprocess.check_output(['gcloud', 'sql', 'generate-login-token', '--impersonate-service-account=' + READ_SERVICE_ACCOUNT],
                                       text=True, stderr=subprocess.DEVNULL).strip()
    connection = psycopg.connect(host='127.0.0.1', port=int(os.environ.get('MW_DB_TUNNEL_PORT', '15432')), dbname=rules['database'],
                                 user=READ_USER, password=password, sslmode='disable', connect_timeout=10, autocommit=True,
                                 options='-c default_transaction_read_only=on', application_name='mw-payer-backfill')
    del password
    database, user, system, read_only = connection.execute(
        "SELECT current_database(),session_user,(SELECT system_identifier FROM pg_control_system()),current_setting('transaction_read_only')").fetchone()
    if (database, user, int(system), read_only) != (rules['database'], READ_USER, SYSTEM_IDENTIFIER, 'on'):
        connection.close()
        raise ValueError('Connected database differs from the verified target')
    return connection


ADMIN_USER = 'postgres'
ADMIN_SECRET = 'mw-credit-ops-cloudsql-postgres-admin'


@contextlib.contextmanager
def admin_connection(env):
    """The migration route of Invoke-CloudFlyway.py: its tunnel, and the postgres admin credential read from Secret
    Manager into memory only (never printed); the session is verified against the fixed target before use."""
    import importlib.util
    sys.path.insert(0, '/workspace/.setup/python-deps')
    import psycopg
    spec = importlib.util.spec_from_file_location('invoke_cloud_flyway', REPO / 'scripts/database/Invoke-CloudFlyway.py')
    flyway = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(flyway)
    if (flyway.ADMIN_USER, flyway.ADMIN_SECRET, flyway.PROJECT, flyway.INSTANCE) != (ADMIN_USER, ADMIN_SECRET, PROJECT, INSTANCE):
        raise ValueError('Admin route differs from the migration runner')
    if any(os.environ.get(k) for k in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'DATABASE_URL')):
        raise ValueError('Remove ambient database routing overrides')
    rules = ENVIRONMENTS[env]
    target = json.loads((REPO / 'database/environments.json').read_text())[rules['target']]
    if (target['instance'], target['host'], target['database']) != (INSTANCE, HOST, rules['database']):
        raise ValueError('Wrong fixed environment tuple')
    with flyway.tunnel(REPO, os.environ) as port:
        password = flyway.secret_output(['gcloud', 'secrets', 'versions', 'access', 'latest', '--secret=' + ADMIN_SECRET, '--project=' + PROJECT])
        try:
            connection = psycopg.connect(host='127.0.0.1', port=int(port), dbname=rules['database'], user=ADMIN_USER, password=password,
                                         sslmode='disable', connect_timeout=10, autocommit=False, application_name='mw-payer-backfill-apply')
        finally:
            del password
        try:
            database, user, system, read_only = connection.execute(
                "SELECT current_database(),session_user,(SELECT system_identifier FROM pg_control_system()),current_setting('transaction_read_only')").fetchone()
            connection.rollback()
            if (database, user, int(system), read_only) != (rules['database'], ADMIN_USER, SYSTEM_IDENTIFIER, 'off'):
                raise ValueError('Connected database differs from the verified target')
            yield connection
        finally:
            connection.close()


def flyway_version(connection):
    value = connection.execute("SELECT max(version::int) FROM public.flyway_schema_history WHERE success AND version ~ '^[0-9]+$'").fetchone()[0]
    return int(value or 0)


BORROWERS_SQL = '''SELECT "Row ID",coalesce("Borrower Name",''),coalesce("Description",''),"Communication Name" FROM public."Borrowers" ORDER BY "Row ID"'''
PAYMENTS_SQL = '''SELECT "Row ID","Ref Borrower","Payment Date"::text,"Uploaded Receipt","Receipt Image","IG Receipt ID","Receipt Received At"::text
 FROM public."Payments" WHERE "Ref Borrower"=ANY(%s) AND (coalesce(btrim("Uploaded Receipt"),'')<>'' OR coalesce(btrim("Receipt Image"),'')<>'')
 ORDER BY "Ref Borrower","Payment Date" DESC NULLS LAST,"Created At" DESC NULLS LAST,"Row ID" DESC'''


class Google:
    """Bearer token of this session's gcloud account (refreshed every 30 minutes); never printed."""
    def __init__(self):
        self.value, self.at = None, 0

    def token(self, timeout=10):
        import subprocess
        if not self.value or time.time() - self.at > 1800:
            self.value = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True, stderr=subprocess.DEVNULL, timeout=60).strip()
            self.at = time.time()
        return self.value


def download(google, locator):
    import urllib.parse
    import urllib.request
    base = 'https://storage.googleapis.com/storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(locator['key'], safe='')

    def get(url, limit):
        request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + google.token()})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('object too large')
        return data
    query = '?generation=' + locator['generation'] if locator.get('generation') else ''
    meta = json.loads(get(base + query, 65536))
    data = get(base + '?alt=media&generation=' + str(meta['generation']), 12_000_000)
    if not verify_object(locator, meta, data):
        raise ValueError('object verification failed')
    return data


def recognizer(model, google):
    from mw_integration_agent import receipt_image, receipt_provider_gemini
    receipt_provider_gemini.http.access_token = google.token  # this session's identity instead of the VM metadata server
    config = {'gemini_project': PROJECT, 'gemini_location': 'global', 'gemini_model': model}
    receipt_provider_gemini.validate(config)

    def recognize(data):
        png, _ = receipt_image.canonical_image(data)
        return receipt_image.checked(receipt_provider_gemini.extract(config, png, deadline=time.monotonic() + 70, attempt_timeout=30))
    return recognize


def receipt_outcome(locator, google, recognize, cache, cache_only=False):
    key = locator['referenceSha256']
    if key in cache:
        return cache[key]
    if cache_only:
        return {'outcome': 'recognition_unavailable', 'name': None}
    for attempt in range(3):
        try:
            data = download(google, locator)
            break
        except Exception:
            if attempt == 2:
                return {'outcome': 'image_unavailable', 'name': None}
            time.sleep(2 * (attempt + 1))
    for attempt in range(3):
        try:
            value = recognize(data)
            break
        except Exception:
            if attempt == 2:
                return {'outcome': 'recognition_unavailable', 'name': None}
            time.sleep(5 * (attempt + 1))
    if value.get('is_payment_receipt') is not True:
        result = {'outcome': 'not_payment_receipt', 'name': None}
    else:
        name = display(value.get('payer_name'))
        result = {'outcome': 'name' if name and readable(name) else 'no_payer_name', 'name': name or None}
    cache[key] = result
    return result


def plan(args):
    from concurrent.futures import ThreadPoolExecutor
    out = private_dir(args.private_dir, create=True)
    catalog = parse_catalog(private_file(args.native_catalog).read_text(), args.env) if args.native_catalog else None
    connection = connect(args.env)
    try:
        version = flyway_version(connection)
        rows = connection.execute(BORROWERS_SQL).fetchall()
        stored = {r[0]: r[3] for r in rows if (r[3] or '').strip()}
        targets = [r for r in rows if args.include_stored or not (r[3] or '').strip()]
        if args.limit_borrowers:
            targets = targets[:args.limit_borrowers]
        payments = connection.execute(PAYMENTS_SQL, ([r[0] for r in targets],)).fetchall()
    finally:
        connection.close()
    by_borrower = {}
    for p in payments:
        by_borrower.setdefault(p[1], []).append({'id': p[0], 'date': p[2], 'manual': p[3], 'agent': p[4], 'agentReceiptId': p[5], 'agentReceivedAt': p[6]})
    cache_path = out / 'recognitions.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    google = Google()
    recognize = None if args.cache_only else recognizer(args.gemini_model, google)
    work, borrowers = [], []
    for bid, name_th, name_en, _ in targets:
        selected, reasons = [], {}
        for p in by_borrower.get(bid, []):
            if len(selected) == WINDOW:
                break
            locator, reason = locate(p, args.env, catalog)
            if locator:
                selected.append((p, locator))
            else:
                reasons[reason] = reasons.get(reason, 0) + 1
        borrowers.append({'id': bid, 'nameTh': name_th, 'nameEn': name_en, 'selected': selected, 'referenceReasons': reasons})
        work += [loc for _, loc in selected]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = dict(zip([w['referenceSha256'] for w in work], pool.map(lambda loc: receipt_outcome(loc, google, recognize, cache, args.cache_only), work)))
    tmp = cache_path.with_suffix('.tmp')
    write_private(tmp, json.dumps(cache, ensure_ascii=False))
    os.replace(tmp, cache_path)
    entries = []
    for b in borrowers:
        receipts = [{'date': p['date'], **outcomes[loc['referenceSha256']]} for p, loc in b['selected']]
        result = classify(receipts)
        for reason, n in b['referenceReasons'].items():
            result['reasons'][reason] = result['reasons'].get(reason, 0) + n
        if not b['selected'] and not b['referenceReasons']:
            result['reasons']['no_receipt_reference'] = 1
        entries.append({'id': b['id'], 'nameTh': b['nameTh'], 'nameEn': b['nameEn'], **result,
                        'receipts': [{'paymentId': p['id'], 'date': p['date'], 'referenceSha256': loc['referenceSha256'], 'kind': loc['kind'],
                                      'outcome': outcomes[loc['referenceSha256']]['outcome']} for p, loc in b['selected']]})
    hits = collisions(entries, {} if args.include_stored else stored)
    for e in entries:
        e['collisions'] = hits.get(e['id'], [])
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    document = {'schemaVersion': 1, 'kind': 'payer-name-backfill-plan', 'environment': args.env, 'database': ENVIRONMENTS[args.env]['database'],
                'systemIdentifier': SYSTEM_IDENTIFIER, 'flywayVersion': version, 'includeStored': bool(args.include_stored),
                'model': args.gemini_model, 'generatedAt': stamp, 'window': WINDOW, 'borrowers': entries}
    text = json.dumps(document, ensure_ascii=False, indent=1)
    plan_path = out / f'payer-plan-{args.env}-{stamp}.json'
    write_private(plan_path, text)
    digest = sha(text.encode())
    write_private(out / f'payer-report-{args.env}-{stamp}.md', report(document))
    template = {'schemaVersion': 1, 'planSha256': digest, 'decisions': {e['id']: {'action': None, 'lines': None} for e in entries if is_exception(e)}, 'byName': {}}
    write_private(out / f'payer-decisions-{args.env}-{stamp}.json', json.dumps(template, ensure_ascii=False, indent=1))
    return {'mode': 'plan', 'environment': args.env, 'flywayVersion': version, 'receipts': len(work),
            'receiptOutcomes': {o: sum(1 for v in outcomes.values() if v['outcome'] == o) for o in OUTCOMES},
            **counts(entries), 'privateFiles': 3}


def load_decided(args):
    """(plan SHA-256, decisions SHA-256, borrower id -> lines): the decisions must be bound to this exact plan."""
    raw = private_file(args.plan).read_bytes()
    document = json.loads(raw)
    if document.get('kind') != 'payer-name-backfill-plan' or document.get('environment') != args.env or document.get('database') != ENVIRONMENTS[args.env]['database']:
        raise ValueError('Plan does not belong to this environment')
    decisions = private_file(args.decisions).read_bytes()
    return sha(raw), sha(decisions), decide(document, sha(raw), json.loads(decisions))


def apply(args, reader=None, admin=None):
    """--dry-run counts, the emitted SQL (default), --execute (the guarded run) or --verify (read-only readback counts).
    reader/admin are connection context factories (tests pass a disposable cluster); by default the read identity and
    the admin route of the migration runner."""
    plan_sha, decisions_sha, values = load_decided(args)
    reader = reader or (lambda: contextlib.closing(connect(args.env)))
    with reader() as connection:
        version = flyway_version(connection)
        if args.verify:
            return {'mode': 'verify', 'environment': args.env, 'flywayVersion': version, **readback(connection, values)}
        if version < V111:
            raise SystemExit(json.dumps({'mode': 'apply', 'refused': 'V111 not applied', 'flywayVersion': version}))
        current = dict(connection.execute(SELECT_PAYERS, (list(values),)).fetchall())
    missing = [b for b in values if b not in current]
    expected = sum(1 for b in values if b in current and (current[b] or '') == '')
    present = {b: v for b, v in values.items() if b in current}
    summary = {'mode': 'apply', 'dryRun': bool(args.dry_run), 'execute': bool(args.execute), 'environment': args.env, 'flywayVersion': version,
               'decided': len(values), 'expected': expected, 'alreadyFilled': len(values) - expected - len(missing), 'missingBorrowers': len(missing)}
    if args.dry_run:
        return summary
    if args.execute and not (args.approval_reference or '').strip():
        raise ValueError('--execute needs the owner approval reference')
    out = private_dir(args.private_dir, create=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    write_private(out / f'payer-apply-{args.env}-{stamp}.sql', apply_sql(args.env, present, expected))
    if not args.execute:
        write_private(out / f'payer-apply-{args.env}-{stamp}.json', json.dumps({**summary, 'planSha256': plan_sha}, indent=1))
        return {**summary, 'sqlEmitted': True, 'writes': 0}
    receipt = out / f'payer-apply-{args.env}-{stamp}-receipt.json'
    base = {'schemaVersion': 1, 'kind': 'payer-name-backfill-receipt', 'environment': args.env, 'database': ENVIRONMENTS[args.env]['database'],
            'planSha256': plan_sha, 'decisionsSha256': decisions_sha, 'approvalReference': args.approval_reference.strip(), 'identity': ADMIN_USER,
            'startedAt': stamp, 'before': {k: summary[k] for k in ('flywayVersion', 'decided', 'expected', 'alreadyFilled', 'missingBorrowers')}}
    # Written before the run: an interrupted run leaves a receipt that says to reconcile with --verify, not to retry.
    write_private(receipt, json.dumps({**base, 'status': 'pending-reconciliation', 'instruction': 'Do not retry. Run apply --verify first.'}, indent=1))
    admin = admin or (lambda: admin_connection(args.env))
    with admin() as connection:
        try:
            notices = run_transaction(connection, args.env, present, expected)
        except Exception as error:  # noqa: BLE001  (recorded, then the run stops with nothing written)
            status = {'status': 'rolled-back', 'error': type(error).__name__, 'detail': str(error).split('\n')[0][:200]}
            receipt.write_text(json.dumps({**base, **status}, indent=1))
            raise SystemExit(json.dumps({**summary, **status, 'writes': 0})) from None
        after = readback(connection, values)
        connection.rollback()
    receipt.write_text(json.dumps({**base, 'status': 'applied', 'notices': notices, 'after': after}, indent=1))
    return {**summary, 'status': 'applied', 'notices': notices, 'after': after}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='mode', required=True)
    p = sub.add_parser('plan')
    p.add_argument('--env', choices=sorted(ENVIRONMENTS), required=True)
    p.add_argument('--private-dir', required=True)
    p.add_argument('--include-stored', action='store_true')
    p.add_argument('--native-catalog')
    p.add_argument('--limit-borrowers', type=int)
    p.add_argument('--cache-only', action='store_true', help='re-plan from saved recognitions only: no download, no model call')
    p.add_argument('--gemini-model', default=json.loads((REPO / 'integration-agent/config.example.json').read_text())['gemini_model'])
    a = sub.add_parser('apply')
    a.add_argument('--env', choices=sorted(ENVIRONMENTS), required=True)
    a.add_argument('--plan', required=True)
    a.add_argument('--decisions', required=True)
    a.add_argument('--private-dir', required=True)
    how = a.add_mutually_exclusive_group()
    how.add_argument('--dry-run', action='store_true', help='counts only')
    how.add_argument('--execute', action='store_true', help='run the transaction as postgres over the migration route')
    how.add_argument('--verify', action='store_true', help='read-only readback counts')
    a.add_argument('--approval-reference', help='the owner approval (required with --execute)')
    args = parser.parse_args(argv)
    print(json.dumps(plan(args) if args.mode == 'plan' else apply(args)))


if __name__ == '__main__':
    main()
