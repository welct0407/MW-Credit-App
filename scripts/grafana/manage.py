"""Grafana read-only inventory and secret-safe Terraform executor (standard library)."""
import argparse, base64, hashlib, json, os, pathlib, re, subprocess, sys, urllib.request, urllib.error, urllib.parse
ORIGIN = 'https://monitor.mw-credit.com'
PROJECT = 'clever-oasis-508610-n7'
SECRET = 'mw-grafana-provisioning-token'
ROOT = pathlib.Path(__file__).resolve().parents[2]
PRIVATE = pathlib.Path('C:/Users/ideaadmin/Documents/ChatGPT')
GCLOUD = 'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
TF = 'C:/Users/ideaadmin/AppData/Local/MWCredit/tools/terraform/terraform.exe'

def private_path(value):
    p = pathlib.Path(value).resolve()
    if not p.is_relative_to(PRIVATE.resolve()):
        raise ValueError('Path must be inside the established external private root')
    return p

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused before forwarding credentials')

def request(path, token):
    if not path.startswith('/') or path.startswith('//'):
        raise ValueError('Relative Grafana API path required')
    req = urllib.request.Request(ORIGIN + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as r:
        if urllib.parse.urlsplit(r.url).netloc != urllib.parse.urlsplit(ORIGIN).netloc:
            raise ValueError('Unexpected redirect')
        return json.load(r)

def gcloud_token():
    return subprocess.check_output([GCLOUD, 'auth', 'print-access-token'], text=True, stderr=subprocess.DEVNULL, timeout=45).strip()

def load_token(args):
    if args.token_file:
        return private_path(args.token_file).read_text().strip()
    if not args.secret_version or not re.fullmatch(r'[1-9][0-9]*', args.secret_version):
        raise ValueError('Numeric Secret Manager version required')
    url = f'https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{SECRET}/versions/{args.secret_version}:access'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + gcloud_token()})
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
        result = json.load(r)
    return base64.b64decode(result['payload']['data']).decode().strip()

def write_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, indent=2)

def inventory(token, dest):
    # secureJsonData/passwords/contact settings are never saved by inventory.
    org = request('/api/org', token)
    search = request('/api/search?limit=1000', token)
    if len(search) >= 1000:
        raise ValueError('Inventory pagination required; refusing incomplete snapshot')
    sources = request('/api/datasources', token)
    report = {'origin': ORIGIN, 'org': {'id': org['id'], 'name': org['name']},
              'resources': [{k: r.get(k) for k in ('uid','title','type','folderUid')} for r in search],
              'datasources': [{k: s.get(k) for k in ('uid','name','type','access','secureJsonFields')} for s in sources]}
    write_private(dest / 'inventory.json', report)
    print(json.dumps({'inventorySaved': True, 'resources': len(search), 'datasources': len(sources)}))

def check_adoption(plan):
    if (not isinstance(plan, dict) or plan.get('format_version') != '1.2'
            or not isinstance(plan.get('terraform_version'), str)
            or plan.get('complete') is not True or plan.get('errored') is not False
            or not isinstance(plan.get('planned_values', {}).get('root_module'), dict)
            or not isinstance(plan.get('resource_changes'), list) or not plan['resource_changes']):
        raise ValueError('Complete nonempty Terraform plan JSON required')
    for r in plan['resource_changes']:
        if not isinstance(r, dict) or not r.get('address') or r.get('change', {}).get('actions') != ['no-op']:
            raise ValueError('Baseline is not no-change; do not apply')

def validated_tf_args(values, plan_sha=None):
    if not values:
        raise ValueError('Terraform operation required')
    op, rest = values[0], values[1:]
    if op in ('init','validate'):
        allowed = {'-input=false','-no-color'} if op == 'init' else {'-no-color'}
        if any(a not in allowed for a in rest): raise ValueError('Unsupported flag')
    elif op == 'state':
        if rest != ['list']: raise ValueError('Only state list allowed')
    elif op == 'plan':
        seen = set()
        for a in rest:
            if a in ('-input=false','-no-color','-detailed-exitcode'): continue
            k, sep, v = a.partition('=')
            if not sep or k not in ('-out','-var-file') or k in seen: raise ValueError('Unsupported plan flag')
            private_path(v); seen.add(k)
        if seen != {'-out','-var-file'}: raise ValueError('Private plan and variables required')
    elif op in ('show','apply'):
        flags = {'-json','-no-color'} if op == 'show' else {'-input=false','-no-color'}
        paths = [a for a in rest if a not in flags]
        if len(paths) != 1 or paths[0].startswith('-'): raise ValueError('One saved plan required')
        path = private_path(paths[0])
        if path.suffix != '.tfplan' or not path.is_file(): raise ValueError('Existing private saved plan required')
        if op == 'apply' and (not plan_sha or hashlib.sha256(path.read_bytes()).hexdigest() != plan_sha):
            raise ValueError('Reviewed saved-plan SHA256 required')
    elif op == 'import':
        if len(rest) != 2: raise ValueError('Exact resource and import ID required')
        if re.fullmatch(r'grafana_(?:folder|apps_dashboard_dashboard_v(?:1beta1|2beta1|2))\.existing\["[A-Za-z0-9_-]+"\]', rest[0]):
            if not re.fullmatch(r'[A-Za-z0-9_:/.-]+', rest[1]): raise ValueError('Invalid actual import ID')
        else:
            owned = json.loads((ROOT / 'infrastructure/grafana/owned-services.tf.json').read_text(encoding='utf-8'))['resource']
            exact = {'grafana_data_source.' + name: data['uid'] for name, data in owned['grafana_data_source'].items()}
            exact.update({'grafana_rule_group.performance': 'f9w88d:Performance 2m', 'grafana_notification_policy.existing': '1:existing'})
            if exact.get(rest[0]) != rest[1]: raise ValueError('Import must match observed owned resource')

    else:
        raise ValueError('Unsupported Terraform operation')
    return values
def terraform(args, token, dest):
    values = validated_tf_args(args.tf_args, args.plan_sha256)
    env = {k: v for k, v in os.environ.items() if not (k.startswith('TF_') or k.startswith('GRAFANA_'))}
    for k in ('TF_LOG','TF_LOG_PATH','TF_LOG_PROVIDER','TF_LOG_CORE'):
        env.pop(k, None)
    env.update(GRAFANA_AUTH=token, GOOGLE_OAUTH_ACCESS_TOKEN=gcloud_token(), TF_DATA_DIR=str(dest / 'data'))
    command = [TF, '-chdir=' + str(ROOT / 'infrastructure/grafana'), *values]
    # Logs can contain dashboard configuration; retain privately and never echo.
    with (dest / 'terraform-last.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
    print(json.dumps({'terraformExitCode': result.returncode, 'privateLog': str(dest / 'terraform-last.log')}))
    return result.returncode

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=['inventory','terraform','check-baseline'])
    p.add_argument('--private-dir', required=True)
    auth = p.add_mutually_exclusive_group()
    auth.add_argument('--token-file')
    auth.add_argument('--secret-version')
    p.add_argument('--plan-json')
    p.add_argument('--plan-sha256')
    p.add_argument('--tf-args', nargs=argparse.REMAINDER, default=[])
    a = p.parse_args(); dest = private_path(a.private_dir); dest.mkdir(parents=True, exist_ok=True)
    if a.operation == 'check-baseline':
        check_adoption(json.loads(private_path(a.plan_json).read_text())); print('No-change baseline verified'); return 0
    if a.operation == 'terraform':
        validated_tf_args(a.tf_args, a.plan_sha256)
    token = load_token(a)
    if not token or '\n' in token or '\r' in token:
        raise ValueError('Invalid token format')
    if a.operation == 'inventory':
        inventory(token, dest); return 0
    return terraform(a, token, dest)

if __name__ == '__main__':
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code}; response body withheld', file=sys.stderr); sys.exit(1)
    except Exception as e:
        # No response body, secret, or full exception text in the console.
        print(f'Operation failed ({type(e).__name__}); no credential output', file=sys.stderr); sys.exit(1)
