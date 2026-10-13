"""Enroll exact Grafana operational payloads outside Terraform; preserve originals."""
import argparse, base64, hashlib, json, sys, urllib.request
import manage
import contact_recovery

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--secret', required=True, choices=[manage.SECRET, contact_recovery.SECRET])
    parser.add_argument('--private-file', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    raw = manage.private_path(args.private_file).read_bytes()
    if hashlib.sha256(raw).hexdigest() != args.sha256:
        raise ValueError('Original payload hash mismatch')
    if args.secret == contact_recovery.SECRET: contact_recovery.validate(json.loads(raw))
    elif not raw.decode().strip() or len(raw.decode().strip().splitlines()) != 1:
        raise ValueError('Invalid token file')
    receipt = manage.private_path(args.receipt)
    if receipt.exists(): raise ValueError('Receipt exists; inspect before retry')
    token = manage.gcloud_token()
    base = f'https://secretmanager.googleapis.com/v1/projects/{manage.PROJECT}/secrets/{args.secret}'
    opener = urllib.request.build_opener(manage.NoRedirect)
    def call(url, data=None):
        req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with opener.open(req, timeout=45) as response: return json.load(response)
    versions = call(base + '/versions?pageSize=1')
    if versions.get('versions'): raise ValueError('Existing versions require explicit reconciliation, not duplicate enrollment')
    result = call(base + ':addVersion', {'payload': {'data': base64.b64encode(raw).decode()}})
    version = result['name'].rsplit('/', 1)[1]
    actual = base64.b64decode(call(base + '/versions/' + version + ':access')['payload']['data'])
    if hashlib.sha256(actual).hexdigest() != args.sha256: raise ValueError('Readback mismatch')
    manage.write_private(receipt, {'secret':args.secret,'version':version,'sha256':args.sha256,'readbackMatches':True,'originalPreserved':True})
    print(json.dumps({'secret':args.secret,'version':version,'readbackMatches':True}))

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'Enrollment stopped ({type(exc).__name__}); payload withheld', file=sys.stderr); sys.exit(1)
