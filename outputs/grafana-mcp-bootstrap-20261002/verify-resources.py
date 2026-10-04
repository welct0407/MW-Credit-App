"""Task-specific, read-only bootstrap metadata verification; run in adapter Python mode."""
import json
import subprocess
import sys
from pathlib import Path

PROJECT = 'clever-oasis-508610-n7'
DATABASE = SERVICE = 'mw-grafana-events'
REGION = 'asia-southeast1'
MARKER = 'grafana-mcp-bootstrap-v1'
RUNTIME = f'{SERVICE}@{PROJECT}.iam.gserviceaccount.com'
DISPATCH = f'mw-grafana-dispatch@{PROJECT}.iam.gserviceaccount.com'
SECRETS = ['mw-grafana-hmac', 'mw-grafana-state-key', 'mw-grafana-cookie-keys',
           'mw-grafana-oauth-jwks', 'mw-grafana-google-client-secret']


def read(*args):
    result = subprocess.run(['gcloud', *args, '--format=json'], capture_output=True,
                            stdin=subprocess.DEVNULL, timeout=60)
    if result.returncode:
        raise RuntimeError(f'Read failed: {args[:3]}: {result.stderr.decode()[:2048]}')
    return json.loads(result.stdout or 'null')


def require(value, message):
    if not value:
        raise RuntimeError(message)


def main():
    result = {'project': PROJECT, 'region': REGION, 'database': DATABASE}
    policy = read('projects', 'get-iam-policy', PROJECT)
    roles = {}
    for email in (RUNTIME, DISPATCH):
        member = f'serviceAccount:{email}'
        roles[email] = [{k: b[k] for k in ('role', 'condition') if k in b}
                        for b in policy.get('bindings', []) if member in b.get('members', [])]
        identity = read('iam', 'service-accounts', 'describe', email)
        require(identity.get('displayName') == MARKER and not identity.get('disabled'),
                f'Identity marker/status mismatch: {email}')
    expected = f'resource.name=="projects/{PROJECT}/databases/{DATABASE}"'
    require(len(roles[RUNTIME]) == 1 and roles[RUNTIME][0]['role'] == 'roles/datastore.user'
            and roles[RUNTIME][0].get('condition', {}).get('expression') == expected,
            'Unexpected runtime project authority')
    require(not roles[DISPATCH], 'Dispatch has project authority')
    result['dedicatedProjectRoles'] = roles
    db = read('firestore', 'databases', 'describe', f'--database={DATABASE}')
    require(db.get('locationId') == REGION and db.get('databaseEdition') == 'STANDARD'
            and db.get('type') == 'FIRESTORE_NATIVE'
            and db.get('deleteProtectionState') == 'DELETE_PROTECTION_ENABLED',
            'Database configuration mismatch')
    result['databaseConfiguration'] = {k: db.get(k) for k in
                                     ('name', 'locationId', 'databaseEdition', 'type',
                                      'deleteProtectionState', 'pointInTimeRecoveryEnablement')}
    repository = read('artifacts', 'repositories', 'describe', 'mw-monitoring', f'--location={REGION}')
    require(repository.get('description') == MARKER and repository.get('format') == 'DOCKER',
            'Registry configuration mismatch')
    result['repository'] = {k: repository.get(k) for k in ('name', 'format', 'description')}
    result['secrets'] = []
    for name in SECRETS:
        secret = read('secrets', 'describe', name)
        require(secret.get('labels', {}).get('bridge') == MARKER
                and 'automatic' in secret.get('replication', {}), f'Secret marker/replication mismatch: {name}')
        versions = read('secrets', 'versions', 'list', name)
        require(not versions, f'Secret is no longer empty: {name}')
        secret_policy = read('secrets', 'get-iam-policy', name)
        bindings = secret_policy.get('bindings', [])
        require(any(b.get('role') == 'roles/secretmanager.secretAccessor'
                    and f'serviceAccount:{RUNTIME}' in b.get('members', []) for b in bindings),
                f'Runtime secret access missing: {name}')
        require(not any(f'serviceAccount:{DISPATCH}' in b.get('members', []) for b in bindings),
                f'Dispatch has secret authority: {name}')
        result['secrets'].append({'name': name, 'versionCount': len(versions),
                                 'runtimeAccessor': True, 'dispatchBinding': False})
    if sys.argv[1:] == ['--partial']:
        result['scope'] = 'Partial-creation readback before index/TTL/logging resume'
        print(json.dumps(result, indent=2))
        return
    definitions = json.loads((Path(__file__).resolve().parents[2] /
                              'scripts/monitoring/grafana-mcp-bridge/deploy/firestore-indexes.json').read_text())
    result['indexes'] = []
    for group in sorted({d['collectionGroup'] for d in definitions['indexes']}):
        indexes = read('firestore', 'indexes', 'composite', 'list', f'--database={DATABASE}',
                       f'--filter=COLLECTION_GROUP:{group}')
        for definition in [d for d in definitions['indexes'] if d['collectionGroup'] == group]:
            matches = [i for i in indexes if i.get('queryScope') == definition['queryScope']
                       and [f for f in i['fields'] if f['fieldPath'] != '__name__'] == definition['fields']]
            require(len(matches) == 1, f'Index definition missing/ambiguous: {group}')
            result['indexes'].append({'name': matches[0]['name'], 'state': matches[0].get('state'),
                                      'fields': definition['fields']})
    result['fields'] = []
    for field in definitions['fieldOverrides']:
        metadata = read('firestore', 'indexes', 'fields', 'describe', field['fieldPath'],
                        f'--database={DATABASE}', f'--collection-group={field["collectionGroup"]}')
        require(not metadata.get('indexConfig', {}).get('indexes')
                and not metadata.get('indexConfig', {}).get('usesAncestorConfig'),
                f'Field index exemption missing: {field}')
        ttl = metadata.get('ttlConfig', {}).get('state')
        require(not field.get('ttl') or ttl in ('ACTIVE', 'CREATING'), f'TTL missing/failed: {field}')
        result['fields'].append({'collectionGroup': field['collectionGroup'], 'field': field['fieldPath'],
                                 'indexesDisabled': True, 'ttlState': ttl})
    sink = read('logging', 'sinks', 'describe', '_Default')
    exclusion = [e for e in sink.get('exclusions', []) if e['name'] == 'mw-grafana-oauth-requests']
    expected_filter = f'logName="projects/{PROJECT}/logs/run.googleapis.com%2Frequests" AND resource.type="cloud_run_revision" AND resource.labels.service_name="{SERVICE}" AND httpRequest.requestUrl =~ "^https://[^/]+/oauth(/|[?]|$)"'
    require(len(exclusion) == 1 and exclusion[0].get('filter') == expected_filter
            and not exclusion[0].get('disabled'), 'OAuth request exclusion mismatch')
    result['oauthRequestLogExclusion'] = exclusion[0]
    jobs = read('scheduler', 'jobs', 'list', f'--location={REGION}')
    matching = [j for j in jobs if j['name'].split('/')[-1] == 'mw-grafana-dispatch']
    require(not matching or all(j.get('state') == 'PAUSED' for j in matching), 'Dispatch job active')
    result['scheduler'] = 'absent' if not matching else 'PAUSED'
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
