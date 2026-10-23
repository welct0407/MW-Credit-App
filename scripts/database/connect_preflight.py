"""Read-only production CONNECT preflight for the grouped PROD migration (Production-Transaction.ps1).

Collects, in one run and from facts it queries itself, the containment proof that
Assert-ProductionTransactionPackage requires, writes it to the private Flyway root
(0600, never overwritten) and pins its SHA256 in the tested release manifest's
productionTransaction block (baseline, target, grouped, no callbacks).

Route: the Linux IAP tunnel (scripts/database/cloud-db-tunnel.sh) as the read
identity codex-cloud-read (pg_read_all_data, pg_read_all_stats). The session is
READ ONLY; nothing in the database changes.

Facts and rules (each field is derived only from what this run observed):
- publicConnectRevoked: pg_database.datacl of loan_manager_prod is non-NULL and no
  PUBLIC (grantee 0) entry carries CONNECT.
- retainedConsumerRoles: every role (pg_* excluded) for which
  has_database_privilege(role, 'loan_manager_prod', 'CONNECT') is true, except the
  Cloud SQL platform roles (cloudsql*), which are listed separately as platformRoles.
- configuredConsumersVerified: every retained role is a configured PROD consumer
  in CONFIGURED_CONSUMERS and the named repository source file contains that exact
  name, its ${each.key} template or (for an IAM database user Terraform derives from a
  service account) the account id and the derivation (checked in this run); any
  unmatched role refuses.
- devPrincipalRoles: roles whose name marks the DEV environment (DEV_NAME).
  devInheritedConnectDenied: has_database_privilege(..., 'CONNECT') is false for each
  of them (it counts direct, inherited and PUBLIC grants).
- devSessionCount: pg_stat_activity sessions on loan_manager_prod by those roles.
- consumerReconnectVerified: each consumer in EXPECTED_CONNECTED (configured with a
  minute cadence) is observed with a live session on loan_manager_prod within the
  observation window; every observed consumer session is recorded.
A fact that cannot be established refuses: nothing is written and no flag defaults to true.

  connect_preflight.py --release-file F --baseline 95 --target 96 [--observe-seconds 150]
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
import sys
import time

PROJECT = 'clever-oasis-508610-n7'
INSTANCE = 'mw-credit-pg-20261017'
HOST = '136.85.127.134'
DATABASE = 'loan_manager_prod'
CLUSTER_SYSTEM_IDENTIFIER = 7685391508477894672
READ_SERVICE_ACCOUNT = 'codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com'
READ_USER = 'codex-cloud-read@clever-oasis-508610-n7.iam'
DEV_NAME = re.compile(r'(^|[_-])dev($|[_@-])')
# Configured PROD consumers of loan_manager_prod and the repository file that configures each.
CONFIGURED_CONSUMERS = {
    'postgres': 'database/environments.json',
    'codex-cloud-read@clever-oasis-508610-n7.iam': 'scripts/database/Common.ps1',
    'codex-cloud@clever-oasis-508610-n7.iam': 'database/README.md',
    'mw-credit-app-read-prod@clever-oasis-508610-n7.iam': 'infrastructure/production/ssd-move.tf',
    'mw-credit-app-command-prod@clever-oasis-508610-n7.iam': 'infrastructure/production/ssd-move.tf',
    'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam': 'infrastructure/production/ssd-move.tf',
    'mw-credit-app-jobs-prod@clever-oasis-508610-n7.iam': 'infrastructure/production/ssd-move.tf',
    'mw-credit-app-chat-prod@clever-oasis-508610-n7.iam': 'infrastructure/production/chat-service.tf',
    'mw_app_prod': 'database/migrations/V87__database_bound_application_roles.sql',
    'mw_app_prod_journal_owner': 'database/migrations/V87__database_bound_application_roles.sql',
    'mw-integration-agent@clever-oasis-508610-n7.iam': 'database/migrations/V95__agent_role_session_pair.sql',
    'mw_integration_agent': 'scripts/database/Test-LedgerAccess.sql',
    'mw_reviewer_dml': 'database/migrations/V95__agent_role_session_pair.sql',
    'mw_receipt_projector': 'database/migrations/V95__agent_role_session_pair.sql',
    'mw_agent_relay': 'database/migrations/V93__review_wave4_hygiene.sql',
    'metabase_borrower_reader': 'database/migrations/V47__partner_reporting.sql',
    'mw_chart_reader': 'project/Documents/Data Dictionary/systems/postgresql/settings/mw-chart-reader.yaml',
}
# Templated sources: the file holds the name with ${each.key} for these roles.
TEMPLATED = {'infrastructure/production/ssd-move.tf': ('mw-credit-app-${each.key}-prod@', ('read', 'command', 'notify', 'jobs'))}
# Derived sources: the IAM database user is the service account's email without ".gserviceaccount.com" (R090 chat).
DERIVED = {'infrastructure/production/chat-service.tf': ('mw-credit-app-chat-prod', 'trimsuffix(google_service_account.chat[0].email, ".gserviceaccount.com")')}
# Minute Cloud Scheduler tick (infrastructure/modules/workers, asserted in tests/containment.tftest.hcl).
EXPECTED_CONNECTED = ('mw-credit-app-notify-prod@clever-oasis-508610-n7.iam',)


def configured(repo, role):
    """True when the configured source file of this role names it (literally or by its template)."""
    source = CONFIGURED_CONSUMERS.get(role)
    if not source:
        return False
    path = repo / source
    if not path.is_file():
        return False
    text = path.read_text(encoding='utf-8')
    if role in text:
        return True
    template = TEMPLATED.get(source)
    if template:
        prefix, keys = template
        key = role.split('mw-credit-app-', 1)[-1].split('-prod@', 1)[0]
        return prefix in text and key in keys and role == f'mw-credit-app-{key}-prod@{PROJECT}.iam'
    derived = DERIVED.get(source)
    if derived:
        account, expression = derived
        return (role == f'{account}@{PROJECT}.iam' and expression in text
                and re.search(r'account_id\s*=\s*"' + re.escape(account) + '"', text) is not None)
    return False


def public_connect(datacl):
    """CONNECT held by PUBLIC in an aclitem[] text; a NULL ACL means the default (PUBLIC CONNECT)."""
    if datacl is None:
        return True
    items = datacl.strip('{}')
    for item in re.findall(r'"(?:[^"\\]|\\.)*"|[^,]+', items):
        item = item.strip('"').replace('\\"', '"')
        grantee, _, rest = item.partition('=')
        privileges = rest.split('/', 1)[0]
        if grantee == '' and 'c' in privileges:
            return True
    return False


def evaluate(facts, repo, now, baseline):
    """Build the preflight from queried facts, or raise when a field cannot be established."""
    if facts['database'] != DATABASE or facts['systemIdentifier'] != CLUSTER_SYSTEM_IDENTIFIER:
        raise ValueError('Live production identity mismatch')
    if facts['readOnly'] != 'on':
        raise ValueError('Preflight session must be read-only')
    if facts['latestVersion'] != baseline:
        raise ValueError('Production head differs from the reviewed baseline')
    holders = sorted(facts['connectHolders'])
    platform = [r for r in holders if r.startswith('cloudsql')]
    retained = [r for r in holders if not r.startswith('cloudsql')]
    unmatched = [r for r in retained if not configured(repo, r)]
    if unmatched:
        raise ValueError('Configured consumers cannot be verified for: ' + ', '.join(unmatched))
    dev = sorted(r for r in facts['roles'] if DEV_NAME.search(r))
    if not dev:
        raise ValueError('No DEV principals found; containment cannot be established')
    dev_with_connect = [r for r in dev if facts['devConnect'].get(r) is not False]
    if dev_with_connect:
        raise ValueError('DEV principals hold CONNECT on production: ' + ', '.join(dev_with_connect))
    if public_connect(facts['datacl']):
        raise ValueError('PUBLIC CONNECT on production is not revoked')
    dev_sessions = sum(count for role, count in facts['sessions'].items() if role in dev)
    observed = sorted(r for r, count in facts['sessions'].items() if count > 0 and r in retained)
    missing = [r for r in EXPECTED_CONNECTED if r not in observed]
    if missing:
        raise ValueError('Expected consumers not observed connected: ' + ', '.join(missing))
    inventory = {'retainedConsumerRoles': retained, 'platformRoles': platform, 'devPrincipalRoles': dev,
                 'datacl': facts['datacl']}
    return {
        'environment': 'production', 'projectId': PROJECT, 'instance': INSTANCE, 'host': HOST, 'database': DATABASE,
        'baselineVersion': baseline, 'observedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'publicConnectRevoked': True, 'configuredConsumersVerified': True, 'consumerReconnectVerified': True,
        'devInheritedConnectDenied': True, 'devSessionCount': dev_sessions,
        'retainedConsumerRoles': retained, 'devPrincipalRoles': dev,
        'identityInventorySha256': hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest(),
        'evidence': {'platformRoles': platform, 'configuredSources': {r: CONFIGURED_CONSUMERS[r] for r in retained},
                     'expectedConnected': list(EXPECTED_CONNECTED), 'observedConsumerSessions': observed,
                     'systemIdentifier': facts['systemIdentifier'], 'latestVersion': facts['latestVersion'],
                     'collector': 'scripts/database/connect_preflight.py', 'identity': facts['sessionUser']},
    }


def pin_release(release, preflight_bytes, baseline, target):
    """Return the release with its productionTransaction block (re)pinned to this preflight."""
    if release.get('environment') != 'development' or not release.get('validationReference') or not release.get('migrations'):
        raise ValueError('Tested development release manifest required')
    names = [m['name'] for m in release['migrations']]
    versions = sorted(int(re.match(r'V([0-9]+)__', n)[1]) for n in names)
    if baseline not in versions or target not in versions or target <= baseline or versions[-1] != target:
        raise ValueError('Release manifest does not cover the baseline and target')
    return {**release, 'productionTransaction': {'baselineVersion': baseline, 'targetVersion': target, 'group': True, 'mixed': False,
            'executeInTransaction': True, 'callbacks': [], 'connectPreflightSha256': hashlib.sha256(preflight_bytes).hexdigest()}}


def collect(connection, observe_seconds, sleep=time.sleep, clock=time.monotonic):
    """Query the facts read-only; sessions are sampled until the expected consumers appear or the window ends."""
    c = connection
    c.execute('BEGIN READ ONLY')
    identity = c.execute("SELECT current_database(), session_user, (SELECT system_identifier FROM pg_control_system()), current_setting('transaction_read_only')").fetchone()
    latest = c.execute('SELECT max(version::int) FROM public.flyway_schema_history WHERE success').fetchone()[0]
    datacl = c.execute("SELECT datacl::text FROM pg_database WHERE datname=%s", (DATABASE,)).fetchone()[0]
    roles = [r[0] for r in c.execute("SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname")]
    holders = [r[0] for r in c.execute("SELECT rolname FROM pg_roles r WHERE rolname !~ '^pg_' AND has_database_privilege(r.oid, %s, 'CONNECT') ORDER BY rolname", (DATABASE,))]
    dev_connect = {r: v for r, v in c.execute("SELECT rolname, has_database_privilege(r.oid, %s, 'CONNECT') FROM pg_roles r WHERE rolname !~ '^pg_'", (DATABASE,)) if DEV_NAME.search(r)}
    c.execute('COMMIT')
    sessions = {}
    deadline = clock() + observe_seconds
    while True:
        c.execute('BEGIN READ ONLY')
        rows = c.execute("SELECT usename, count(*) FROM pg_stat_activity WHERE datname=%s AND usename IS NOT NULL GROUP BY usename", (DATABASE,)).fetchall()
        c.execute('COMMIT')
        for role, count in rows:
            if role != identity[1]:
                sessions[role] = max(sessions.get(role, 0), count)
        if all(sessions.get(r) for r in EXPECTED_CONNECTED) or clock() >= deadline:
            break
        sleep(10)
    return {'database': identity[0], 'sessionUser': identity[1], 'systemIdentifier': identity[2], 'readOnly': identity[3],
            'latestVersion': latest, 'datacl': datacl, 'roles': roles, 'connectHolders': holders, 'devConnect': dev_connect, 'sessions': sessions}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--release-file', type=Path, required=True)
    parser.add_argument('--baseline', type=int, required=True)
    parser.add_argument('--target', type=int, required=True)
    parser.add_argument('--observe-seconds', type=int, default=150)
    args = parser.parse_args(argv)
    if any(os.environ.get(k) for k in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'DATABASE_URL')):
        raise ValueError('Remove ambient database routing overrides')
    repo = Path(__file__).resolve().parents[2]
    targets = json.loads((repo / 'database/environments.json').read_text())
    t = targets['production']
    if (t['instance'], t['host'], t['database'], t['user']) != (INSTANCE, HOST, DATABASE, 'postgres'):
        raise ValueError('Wrong fixed production tuple')
    private_root = Path(os.environ.get('MW_PRIVATE_ROOT') or Path.home() / '.mw-private') / 'AppSheet-Loan-Project/flyway'
    release_path = args.release_file.resolve()
    if release_path.parent != private_root.resolve() or not release_path.name.startswith('release-'):
        raise ValueError('Release manifest must be in the private Flyway root')
    release = json.loads(release_path.read_text())
    sys.path.insert(0, '/workspace/.setup/python-deps')
    import psycopg
    subprocess.run(['bash', str(repo / 'scripts/database/cloud-db-tunnel.sh')], check=True, stdout=subprocess.DEVNULL)
    password = subprocess.check_output(['gcloud', 'sql', 'generate-login-token', '--impersonate-service-account=' + READ_SERVICE_ACCOUNT], text=True).strip()
    with psycopg.connect(host='127.0.0.1', port=int(os.environ.get('MW_DB_TUNNEL_PORT', '15432')), dbname=DATABASE, user=READ_USER, password=password,
                         sslmode='disable', connect_timeout=10, autocommit=True, application_name='mw-connect-preflight') as connection:
        del password
        facts = collect(connection, args.observe_seconds)
    preflight = evaluate(facts, repo, datetime.now(timezone.utc), args.baseline)
    data = json.dumps(preflight, indent=2).encode()
    out = private_root / ('connect-preflight-' + preflight['observedAt'].replace(':', '') + '.json')
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    pinned = pin_release(release, data, args.baseline, args.target)
    tmp = release_path.with_suffix('.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(pinned, f, indent=2)
    os.replace(tmp, release_path)
    print(json.dumps({'preflight': str(out), 'sha256': pinned['productionTransaction']['connectPreflightSha256'], 'release': str(release_path),
                      'retained': len(preflight['retainedConsumerRoles']), 'platform': len(preflight['evidence']['platformRoles']),
                      'devPrincipals': len(preflight['devPrincipalRoles']), 'devSessions': preflight['devSessionCount'],
                      'observedConsumerSessions': preflight['evidence']['observedConsumerSessions']}))


if __name__ == '__main__':
    main()
