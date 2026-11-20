"""Set one Grafana datasource's encrypted field from a Secret Manager version (standard library).

Terraform ignores datasource secure fields, so their payloads are set here. Only the fixed pairs below are
accepted. The secret is read into memory and sent once to the Grafana API; it is never printed or written.
    python scripts/grafana/set_datasource_secret.py --datasource mw-anthropic-cost \
        --provisioning-version 1 --secret-version 1
--check validates the secret's format and the datasource without changing Grafana.
"""
import argparse, base64, json, re, sys, urllib.request
import manage

# datasource uid -> (secureJsonData field, Secret Manager secret, accepted value pattern)
PAIRS = {
    'mw-anthropic-cost': ('apiKeyValue', 'mw-anthropic-admin-cost-key', r'sk-ant-(?:admin01|api\d\d|usr)-[A-Za-z0-9_-]{20,}'),
    'mw-railway-monitoring': ('bearerToken', 'mw-railway-grafana-monitoring-token', r'[A-Za-z0-9_-]{20,}'),
    # R177: login mw_grafana_reader to mw_agent through PDC (the same password as mw-agent-questions).
    'mw-agent-receipts': ('password', 'mw-grafana-agent-reader-password', r'[!-~]{16,}'),
}
# Nonsecret fields carried unchanged on the PUT; user and database keep a PostgreSQL datasource's login.
KEPT = ('name', 'type', 'access', 'url', 'user', 'database', 'basicAuth', 'isDefault', 'jsonData')

def check_value(value, pattern):
    if '\n' in value or not re.fullmatch(pattern, value): raise ValueError('Secret value has an unexpected format')

def update_body(ds, uid, field, value):
    if ds.get('uid') != uid: raise ValueError('Datasource uid mismatch')
    body = {k: ds[k] for k in KEPT if k in ds}
    body['uid'] = uid
    body['version'] = ds.get('version')
    body['secureJsonData'] = {field: value}
    return body

def check_after(before, after, field):
    if not after.get('secureJsonFields', {}).get(field): raise ValueError('Field not reported as set after update')
    for k in KEPT:
        if after.get(k) != before.get(k): raise ValueError(f'{k} changed unexpectedly')

def secret_value(secret, version):
    url = f'https://secretmanager.googleapis.com/v1/projects/{manage.PROJECT}/secrets/{secret}/versions/{version}:access'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + manage.gcloud_token()})
    with urllib.request.build_opener(manage.NoRedirect).open(req, timeout=30) as r:
        return base64.b64decode(json.load(r)['payload']['data']).decode().strip()

def grafana(method, path, token, body=None):
    req = urllib.request.Request(manage.ORIGIN + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.build_opener(manage.NoRedirect).open(req, timeout=45) as r:
        return json.load(r)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--datasource', required=True, choices=sorted(PAIRS))
    p.add_argument('--provisioning-version', required=True, help='mw-grafana-provisioning-token version')
    p.add_argument('--secret-version', required=True)
    p.add_argument('--check', action='store_true')
    a = p.parse_args()
    for v in (a.provisioning_version, a.secret_version):
        if not re.fullmatch(r'[1-9][0-9]*', v): raise ValueError('Numeric Secret Manager versions required')
    field, secret, pattern = PAIRS[a.datasource]
    value = secret_value(secret, a.secret_version)
    check_value(value, pattern)
    token = manage.load_token(argparse.Namespace(token_file=None, secret_version=a.provisioning_version))
    ds = grafana('GET', '/api/datasources/uid/' + a.datasource, token)
    if a.check:
        print(json.dumps({'datasource': a.datasource, 'field': field, 'secret': secret, 'version': a.secret_version,
                          'formatValid': True, 'fieldSet': bool(ds.get('secureJsonFields', {}).get(field))})); return 0
    grafana('PUT', '/api/datasources/uid/' + a.datasource, token, update_body(ds, a.datasource, field, value))
    after = grafana('GET', '/api/datasources/uid/' + a.datasource, token)
    check_after(ds, after, field)
    print(json.dumps({'datasource': a.datasource, 'field': field, 'secret': secret, 'version': a.secret_version,
                      'fieldSet': True, 'datasourceVersion': after.get('version')}))
    return 0

if __name__ == '__main__':
    try: sys.exit(main())
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code}; response body withheld', file=sys.stderr); sys.exit(1)
    except Exception as e:
        print(f'Stopped ({type(e).__name__}: {e if isinstance(e, ValueError) else "details withheld"}); no secret output', file=sys.stderr); sys.exit(1)
