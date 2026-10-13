"""Exact existing Grafana contact recovery; never sends a test notification.

Contact payloads stay in Secret Manager/private memory, not Terraform state.
The existing bridge HMAC is referenced, not duplicated or rotated.
"""
import argparse, base64, hashlib, json, re, sys, urllib.request
import manage

CONTACTS = {'efz3im8pyaewwa': 'oncall', 'fg03yg7dpxjwgb': 'webhook'}
SECRET = 'mw-grafana-contact-integrations'
HMAC = {'secret': 'mw-grafana-hmac', 'version': '1', 'arrayIndex': 0}

def validate(items):
    if not isinstance(items, list) or len(items) != 2:
        raise ValueError('Exactly two existing integrations required')
    if {x.get('uid'): x.get('type') for x in items} != CONTACTS:
        raise ValueError('Contact identity mismatch')
    for item in items:
        if item.get('name') != 'MW Performance IRM':
            raise ValueError('Recipient route mismatch')
        settings = item['settings']
        if item['type'] == 'webhook':
            if settings.get('url') != 'https://alerts.mw-credit.com/grafana':
                raise ValueError('Unexpected webhook target')
            if settings['hmacConfig']['secret'] != {'secretManagerReference': HMAC}:
                raise ValueError('Existing numeric HMAC reference required')
        elif not settings.get('url', '').startswith('https://oncall-prod-us-central-0.grafana.net/'):
            raise ValueError('Unexpected existing IRM target')

def secret_access(name, version):
    if name not in (SECRET, HMAC['secret']) or not re.fullmatch(r'[1-9][0-9]*', version):
        raise ValueError('Exact numeric recovery secret required')
    req = urllib.request.Request(f'https://secretmanager.googleapis.com/v1/projects/{manage.PROJECT}/secrets/{name}/versions/{version}:access', headers={'Authorization': 'Bearer ' + manage.gcloud_token()})
    with urllib.request.build_opener(manage.NoRedirect).open(req, timeout=30) as response:
        return base64.b64decode(json.load(response)['payload']['data'])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'verify', 'restore'])
    parser.add_argument('--private-file')
    parser.add_argument('--version')
    parser.add_argument('--sha256')
    parser.add_argument('--token-file')
    args = parser.parse_args()
    if args.operation == 'prepare':
        token = manage.private_path(args.token_file).read_text().strip()
        items = manage.request('/api/v1/provisioning/contact-points', token)
        if {x.get('uid') for x in items} != set(CONTACTS):
            raise ValueError('Contact inventory changed')
        for item in items:
            if item['type'] == 'webhook':
                item['settings']['hmacConfig']['secret'] = {'secretManagerReference': HMAC}
        validate(items)
        manage.write_private(manage.private_path(args.private_file), items)
        print('Private recovery configuration prepared; existing HMAC not accessed')
        return
    raw = secret_access(SECRET, args.version)
    if hashlib.sha256(raw).hexdigest() != args.sha256:
        raise ValueError('Recovery payload hash mismatch')
    items = json.loads(raw); validate(items)
    if args.operation == 'verify':
        print('Exact contact recovery identities and numeric reference verified')
        return
    # Explicit restore only. Original contact payload remains in private recovery.
    token = manage.private_path(args.token_file).read_text().strip()
    hmac = json.loads(secret_access(HMAC['secret'], HMAC['version']))
    if not isinstance(hmac, list) or len(hmac) != 1 or not isinstance(hmac[0], str) or not hmac[0]:
        raise ValueError('Existing HMAC shape changed')
    for item in items:
        if item['type'] == 'webhook': item['settings']['hmacConfig']['secret'] = hmac[0]
        req = urllib.request.Request(manage.ORIGIN + '/api/v1/provisioning/contact-points/' + item['uid'], data=json.dumps(item).encode(), method='PUT', headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Disable-Provenance': 'true'})
        with urllib.request.build_opener(manage.NoRedirect).open(req, timeout=45) as response:
            response.read()
    print('Two existing contact configurations restored; no notification sent')

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'Recovery stopped ({type(exc).__name__}); payload withheld', file=sys.stderr)
        sys.exit(1)
