#!/usr/bin/env python3
"""Owner-run, fixed-target bootstrap. No implicit impersonation or secret values."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PROJECT = 'clever-oasis-508610-n7'
NUMBER = '737787224638'
REGION = 'asia-southeast1'
SERVICE = DATABASE = 'mw-grafana-events'
REPOSITORY = 'mw-monitoring'
DOMAIN = 'alerts.mw-credit.com'
MARKER = 'grafana-mcp-bootstrap-v1'
RUNTIME = f'{SERVICE}@{PROJECT}.iam.gserviceaccount.com'
DISPATCH = f'mw-grafana-dispatch@{PROJECT}.iam.gserviceaccount.com'
APPROVED_DEPLOYER = f'codex-cloud@{PROJECT}.iam.gserviceaccount.com'
GCLOUD_EXECUTABLE = None
DOCKER_EXECUTABLE = None
ADAPTER_MODE = False
SECRETS = ['mw-grafana-hmac', 'mw-grafana-state-key', 'mw-grafana-cookie-keys',
           'mw-grafana-oauth-jwks', 'mw-grafana-google-client-secret']
APIS = ['run.googleapis.com', 'firestore.googleapis.com', 'cloudscheduler.googleapis.com',
        'secretmanager.googleapis.com', 'artifactregistry.googleapis.com',
        'iam.googleapis.com', 'iamcredentials.googleapis.com', 'logging.googleapis.com']
HERE = Path(__file__).resolve().parent


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def configure_gcloud(executable):
    global GCLOUD_EXECUTABLE
    if executable:
        path = Path(executable).expanduser().resolve()
        require(path.is_file() and (os.name == 'nt' or os.access(path, os.X_OK)),
                'Configured gcloud executable/adapter is missing or not executable')
        GCLOUD_EXECUTABLE = str(path)
    else:
        GCLOUD_EXECUTABLE = None


def configure_docker(executable):
    global DOCKER_EXECUTABLE
    if executable:
        path = Path(executable).expanduser().resolve()
        require(path.is_file() and (os.name == 'nt' or os.access(path, os.X_OK)),
                'Configured Docker executable/adapter is missing or not executable')
        DOCKER_EXECUTABLE = str(path)
    else:
        DOCKER_EXECUTABLE = None


def configure_adapter(enabled):
    global ADAPTER_MODE
    require(not enabled or (os.name != 'nt' and OWNER == APPROVED_DEPLOYER),
            'Adapter mode requires Linux and the explicitly approved fixed deployment identity')
    ADAPTER_MODE = bool(enabled)


def principal_member(account):
    if account.endswith('.gserviceaccount.com'):
        require(account == APPROVED_DEPLOYER, 'Only the explicitly approved fixed deployment service account is allowed')
        return f'serviceAccount:{account}'
    return f'user:{account}'


def run(argv, data=None):
    if argv[0] == 'gcloud':
        executable = GCLOUD_EXECUTABLE or shutil.which('gcloud')
        require(executable is not None, 'gcloud launcher was not found on PATH')
        argv = [executable, *argv[1:]]
    elif argv[0] == 'docker' and DOCKER_EXECUTABLE:
        argv = [DOCKER_EXECUTABLE, *argv[1:]]
    try:
        result = subprocess.run(argv, input=data, capture_output=True, check=False,
                                env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    except OSError as error:
        raise RuntimeError(f'Cannot launch {argv[0]}: {error}') from error
    require(result.returncode == 0, f'Command failed: {argv[0:4]}\n{result.stderr.decode(errors="replace")}')
    return result.stdout.decode()


def gc(*args):
    return json.loads(gcloud_output(*args) or 'null')


def gcloud_output(*args, data=None):
    common = (f'--project={PROJECT}', f'--account={OWNER}', '--quiet', '--format=json')
    if ADAPTER_MODE or (os.name != 'nt' and GCLOUD_EXECUTABLE):
        # The reviewed Linux adapter validates every visible argument itself.
        # exec argv needs no shell quoting and does not hide flags in a file.
        return run(['gcloud', *args, *common], data=data)
    # gcloud.CMD can introduce Windows shell parsing even with shell=False.
    # Only simple positional identifiers and one filename cross that boundary.
    # All flag values (including CEL, regex, %, quotes and repeated flags) stay
    # in an SDK-supported JSON flags file. This file never contains secrets.
    positional, flags = [], []
    for arg in (*args, *common):
        if arg.startswith('--'):
            key, separator, value = arg.partition('=')
            flags.append({key: value if separator else None})
        else:
            require(re.fullmatch(r'[A-Za-z0-9_@./:()-]+', arg) is not None, 'Unsafe positional CLI argument')
            positional.append(arg)
    with tempfile.TemporaryDirectory(prefix='mw-grafana-flags-') as directory:
        path = Path(directory) / 'flags.json'
        path.write_text(json.dumps(flags), encoding='utf-8')
        return run(['gcloud', *positional, f'--flags-file={path}'], data=data)


def check_sdk():
    help_text = run(['gcloud', 'logging', 'sinks', 'update', '--help'])
    require('--add-exclusion' in help_text, 'Installed gcloud lacks sink exclusion support')
    print('Installed SDK supports logging sinks update --add-exclusion.')


def oauth_log_exclusion():
    log_filter = f'logName="projects/{PROJECT}/logs/run.googleapis.com%2Frequests" AND resource.type="cloud_run_revision" AND resource.labels.service_name="{SERVICE}" AND httpRequest.requestUrl =~ "^https://[^/]+/oauth(/|[?]|$)"'
    name = 'mw-grafana-oauth-requests'
    before = gc('logging', 'sinks', 'describe', '_Default')
    exclusions = before.get('exclusions', [])
    matching = [e for e in exclusions if e['name'] == name]
    require(len(matching) <= 1, 'Duplicate OAuth request-log exclusion')
    if matching:
        require(matching[0].get('filter') == log_filter and not matching[0].get('disabled'),
                'Conflicting/disabled OAuth request-log exclusion')
        return
    gc('logging', 'sinks', 'update', '_Default',
       f'--add-exclusion=name={name},description={MARKER},filter={log_filter}')
    after = gc('logging', 'sinks', 'describe', '_Default')
    added = [e for e in after.get('exclusions', []) if e['name'] == name]
    require(len(added) == 1 and added[0].get('filter') == log_filter and not added[0].get('disabled'),
            'OAuth exclusion readback failed')
    # Server timestamps can change. All unrelated configuration must survive.
    ignored = {'exclusions', 'createTime', 'updateTime'}
    require({k: v for k, v in before.items() if k not in ignored} ==
            {k: v for k, v in after.items() if k not in ignored}, 'Unrelated sink configuration changed; stop for reconciliation')
    require(sorted(exclusions, key=lambda e: e['name']) ==
            sorted([e for e in after.get('exclusions', []) if e['name'] != name], key=lambda e: e['name']),
            'Unrelated sink exclusions changed; stop for reconciliation')


def choose(rows, suffix):
    matches = [r for r in rows if r.get('name', r.get('metadata', {}).get('name', '')).split('/')[-1] == suffix]
    require(len(matches) <= 1, f'Ambiguous existing resource: {suffix}')
    return matches[0] if matches else None


def baseline():
    require(not os.environ.get('CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'), 'Remove impersonation override')
    require(not os.environ.get('CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE'), 'Remove credential override')
    member = principal_member(OWNER)
    auth = json.loads(run(['gcloud', 'auth', 'list', '--format=json']))
    require(any(a['account'] == OWNER and a['status'] == 'ACTIVE' for a in auth), 'Selected owner must be the active account')
    impersonation = run(['gcloud', 'config', 'get-value', 'auth/impersonate_service_account']).strip()
    require(impersonation in ('', '(unset)'), 'Remove configured impersonation')
    project = gc('projects', 'describe', PROJECT)
    require(project.get('projectId') == PROJECT and str(project['projectNumber']) == NUMBER
            and project.get('lifecycleState') == 'ACTIVE', 'Wrong/inactive project')
    billing = gc('billing', 'projects', 'describe', PROJECT)
    require(billing.get('billingEnabled') is True, 'Billing is not enabled; do not link/change billing automatically')
    enabled = {s['config']['name'] for s in gc('services', 'list', '--enabled')}
    # Failure here is a blocker, never permission to disable an organization policy.
    policy = gc('org-policies', 'describe', 'constraints/run.managed.requireInvokerIam', '--effective')
    require(not any(r.get('enforce') for r in policy.get('spec', {}).get('rules', [])), 'Organization requires invoker IAM')
    iam = gc('projects', 'get-iam-policy', PROJECT)
    require(any(binding.get('role') == 'roles/owner' and not binding.get('condition')
                and member in binding.get('members', []) for binding in iam.get('bindings', [])),
            'Selected principal lacks a direct unconditional project Owner binding')
    condition = f'resource.name=="projects/{PROJECT}/databases/{DATABASE}"'
    for binding in iam.get('bindings', []):
        if f'serviceAccount:{RUNTIME}' in binding.get('members', []):
            require(binding['role'] == 'roles/datastore.user' and binding.get('condition', {}).get('expression') == condition,
                    'Runtime already has an unexpected project role; owner review required')
        require(f'serviceAccount:{DISPATCH}' not in binding.get('members', []), 'Dispatch already has project roles; owner review required')
    print(json.dumps({'owner': OWNER, 'ownerMember': member, 'projectOwnerVerified': True,
                      'project': PROJECT, 'number': NUMBER,
                      'billingEnabled': True, 'enabledAPIs': sorted(enabled)}, indent=2))
    return enabled, condition


def inventory(enabled):
    commands = [
        ('iam.googleapis.com', ('iam', 'service-accounts', 'list')),
        ('artifactregistry.googleapis.com', ('artifacts', 'repositories', 'list', f'--location={REGION}')),
        ('firestore.googleapis.com', ('firestore', 'databases', 'list')),
        ('secretmanager.googleapis.com', ('secrets', 'list')),
        ('run.googleapis.com', ('run', 'services', 'list', f'--region={REGION}')),
        ('cloudscheduler.googleapis.com', ('scheduler', 'jobs', 'list', f'--location={REGION}')),
    ]
    rows = {}
    for api, command in commands:
        rows[api] = gc(*command) if api in enabled else []
        print(f'{api}: inventory read' if api in enabled else f'{api}: disabled; inventory pending enablement')
    return rows


def validate(rows, resume):
    for name in (SERVICE, 'mw-grafana-dispatch'):
        existing = next((x for x in rows['iam.googleapis.com'] if x.get('email') == f'{name}@{PROJECT}.iam.gserviceaccount.com'), None)
        if existing:
            require(existing.get('displayName') == MARKER and not existing.get('disabled'), f'Conflicting identity {name}')
    repo = choose(rows['artifactregistry.googleapis.com'], REPOSITORY)
    if repo:
        require(repo.get('description') == MARKER and repo.get('format') == 'DOCKER', 'Conflicting registry repository')
    db = choose(rows['firestore.googleapis.com'], DATABASE)
    if db:
        require(resume, 'Existing database requires --resume after confirming this bootstrap owns it')
        require(db.get('locationId') == REGION and db.get('type') == 'FIRESTORE_NATIVE'
                and db.get('databaseEdition') == 'STANDARD' and db.get('deleteProtectionState') == 'DELETE_PROTECTION_ENABLED'
                and db.get('pointInTimeRecoveryEnablement', 'POINT_IN_TIME_RECOVERY_DISABLED') == 'POINT_IN_TIME_RECOVERY_DISABLED', 'Conflicting database configuration')
    for name in SECRETS:
        secret = choose(rows['secretmanager.googleapis.com'], name)
        if secret:
            require(secret.get('labels', {}).get('bridge') == MARKER and 'automatic' in secret.get('replication', {}), f'Conflicting secret {name}')
    service = choose(rows['run.googleapis.com'], SERVICE)
    if service:
        require(service.get('metadata', {}).get('labels', {}).get('bridge') == MARKER, 'Conflicting Cloud Run service')
    job = choose(rows['cloudscheduler.googleapis.com'], 'mw-grafana-dispatch')
    if job:
        require(job.get('description') == MARKER and job.get('state') == 'PAUSED', 'Conflicting/active Scheduler job')
    return db, repo


def resources(enabled, condition, resume):
    check_sdk()  # Actual installed CLI help, before any API enablement/mutation.
    # Validate visible collisions before enabling APIs, then repeat after all inventory is readable.
    validate(inventory(enabled), resume)
    gc('services', 'enable', *APIS)
    rows = inventory(set(APIS))
    db, repo = validate(rows, resume)
    for name in (SERVICE, 'mw-grafana-dispatch'):
        if not any(x.get('email') == f'{name}@{PROJECT}.iam.gserviceaccount.com' for x in rows['iam.googleapis.com']):
            gc('iam', 'service-accounts', 'create', name, f'--display-name={MARKER}')
    if not repo:
        gc('artifacts', 'repositories', 'create', REPOSITORY, '--repository-format=docker', f'--location={REGION}', f'--description={MARKER}')
    if not db:
        gc('firestore', 'databases', 'create', f'--database={DATABASE}', f'--location={REGION}', '--edition=standard', '--type=firestore-native', '--delete-protection')
    gc('projects', 'add-iam-policy-binding', PROJECT, f'--member=serviceAccount:{RUNTIME}', '--role=roles/datastore.user',
       f'--condition=expression={condition},title=mw-grafana-database,description=Bridge database only')
    for name in SECRETS:
        if not choose(rows['secretmanager.googleapis.com'], name):
            gc('secrets', 'create', name, '--replication-policy=automatic', f'--labels=bridge={MARKER}')
        gc('secrets', 'add-iam-policy-binding', name, f'--member=serviceAccount:{RUNTIME}', '--role=roles/secretmanager.secretAccessor', '--condition=None')
    definitions = json.loads((HERE / 'firestore-indexes.json').read_text())
    for definition in definitions['indexes']:
        group = definition['collectionGroup']
        indexes = gc('firestore', 'indexes', 'composite', 'list', f'--database={DATABASE}', f'--collection-group={group}')
        exists = any(i.get('queryScope') == definition['queryScope'] and
                     [f for f in i['fields'] if f['fieldPath'] != '__name__'] == definition['fields'] for i in indexes)
        if not exists:
            gc('firestore', 'indexes', 'composite', 'create', f'--database={DATABASE}', f'--collection-group={group}', '--query-scope=collection', '--async',
               *[f'--field-config=field-path={f["fieldPath"]},order={f["order"].lower()}' for f in definition['fields']])
    for field in definitions['fieldOverrides']:
        gc('firestore', 'indexes', 'fields', 'update', field['fieldPath'], f'--database={DATABASE}',
           f'--collection-group={field["collectionGroup"]}', '--disable-indexes', '--async')
        if field.get('ttl'):
            gc('firestore', 'fields', 'ttls', 'update', field['fieldPath'], f'--database={DATABASE}',
               f'--collection-group={field["collectionGroup"]}', '--enable-ttl', '--async')
    oauth_log_exclusion()
    print('Infrastructure created/reconciled. Index/TTL operations may still be pending. No secret values, Cloud Run revision or Scheduler job created.')


def inert():
    services = gc('run', 'services', 'list', f'--region={REGION}')
    existing = next((s for s in services if s.get('metadata', {}).get('name') == SERVICE), None)
    if existing:
        require(existing.get('metadata', {}).get('labels', {}).get('bridge') == MARKER, 'Cloud Run name collision')
        print(json.dumps({'runAppURL': existing['status']['url'], 'existingService': True}))
        return  # Never roll an existing service back to bootstrap.
    tag = f'{REGION}-docker.pkg.dev/{PROJECT}/{REPOSITORY}/grafana-mcp-bootstrap:v1'
    require(DOCKER_EXECUTABLE or shutil.which('docker') is not None, 'Docker unavailable; complete the approved Docker setup before inert deployment')
    if not ADAPTER_MODE and not DOCKER_EXECUTABLE:
        gcloud_output('auth', 'configure-docker', f'{REGION}-docker.pkg.dev')
    run(['docker', 'build', '--platform=linux/amd64', '-f', str(HERE / 'bootstrap.Dockerfile'), '-t', tag, str(HERE)])
    run(['docker', 'push', tag])
    image = gc('artifacts', 'docker', 'images', 'describe', tag)
    digest = image['image_summary']['digest']
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', digest), 'Invalid registry digest')
    gc('run', 'deploy', SERVICE, f'--region={REGION}', f'--image={tag.rsplit(":", 1)[0]}@{digest}',
       f'--service-account={RUNTIME}', '--ingress=all', '--no-invoker-iam-check', '--min-instances=0', '--max-instances=2',
       '--cpu=1', '--memory=512Mi', '--concurrency=20', '--timeout=300', f'--labels=bridge={MARKER}', '--set-env-vars=OWNER_ENABLED=false')
    deployed = gc('run', 'services', 'describe', SERVICE, f'--region={REGION}')
    require(deployed['spec']['template']['spec']['serviceAccountName'] == RUNTIME, 'Unexpected deployed identity')
    require(deployed['metadata'].get('annotations', {}).get('run.googleapis.com/invoker-iam-disabled') == 'true', 'Invoker IAM check not disabled')
    print(json.dumps({'runAppURL': deployed['status']['url'], 'bootstrapImageDigest': digest}, indent=2))


def domain():
    verified = gc('domains', 'list-user-verified')
    require(any((v if isinstance(v, str) else v.get('id')) == 'mw-credit.com' for v in verified), 'Owner must verify mw-credit.com in Search Console first')
    service = gc('run', 'services', 'describe', SERVICE, f'--region={REGION}')
    require(service['metadata'].get('labels', {}).get('bridge') == MARKER, 'Unexpected target service')
    mappings = gc('beta', 'run', 'domain-mappings', 'list', f'--region={REGION}')
    existing = next((m for m in mappings if m.get('metadata', {}).get('name') == DOMAIN), None)
    if existing:
        require(existing.get('spec', {}).get('routeName') == SERVICE, 'Domain already targets another service')
    else:
        gc('beta', 'run', 'domain-mappings', 'create', f'--region={REGION}', f'--service={SERVICE}', f'--domain={DOMAIN}')
    mapping = gc('beta', 'run', 'domain-mappings', 'describe', f'--region={REGION}', f'--domain={DOMAIN}')
    print(json.dumps({'domain': DOMAIN, 'resourceRecords': mapping.get('status', {}).get('resourceRecords', []),
                      'conditions': mapping.get('status', {}).get('conditions', [])}, indent=2))


def main():
    global OWNER
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['check-sdk', 'preflight', 'resources', 'inert', 'domain'])
    parser.add_argument('--owner', required=True, help='Verified human project owner or the explicitly approved fixed codex-cloud service account')
    parser.add_argument('--gcloud-executable', help='Reviewed existing SDK launcher or approved saved-environment adapter path; identity guards remain enforced')
    parser.add_argument('--docker-executable', help='Reviewed Docker/private-auth adapter accepting normal Docker arguments; avoids configure-docker in generic gcloud')
    parser.add_argument('--adapter-mode', action='store_true', help='Approved Linux Python/shim mode: visible gcloud argv and private Docker auth, fixed deployment identity only')
    parser.add_argument('--resume', action='store_true', help='Owner confirms existing named database was created by this bootstrap')
    args = parser.parse_args()
    OWNER = args.owner
    principal_member(OWNER)  # Reject other service identities even in check-sdk.
    configure_adapter(args.adapter_mode)
    configure_gcloud(args.gcloud_executable)
    configure_docker(args.docker_executable)
    if args.phase == 'check-sdk':
        check_sdk()
        return
    enabled, condition = baseline()
    if args.phase == 'preflight':
        validate(inventory(enabled), args.resume)
        print('Read-only preflight passed. No infrastructure changed.')
    elif args.phase == 'resources':
        resources(enabled, condition, args.resume)
    elif args.phase == 'inert':
        inert()
    else:
        domain()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError) as error:
        print(f'STOP: {error}', file=sys.stderr)
        sys.exit(1)
