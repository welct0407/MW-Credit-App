"""R053 native cutover using the existing quiesce, backup and install procedure."""
import copy
import importlib.util
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location('receipt_deployment', Path(__file__).with_name('deploy-shared-receipt-api.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)


def prepare(config, catalogue, candidate, commit, origin, audience, cutoff):
    base.require(re.fullmatch('[0-9a-f]{40}', commit or ''), 'Exact commit required')
    base.require(origin == audience == base.ORIGIN, 'Wrong production endpoint')
    base.require(config.get('state_backend') == 'postgres' and config.get('database_name') == 'loan_manager_prod'
                 and config.get('receipt_payment_api_enabled') is True
                 and config.get('receipt_payment_api_origin') == base.ORIGIN
                 and config.get('receipt_payment_api_audience') == base.ORIGIN, 'Existing receipt API required')
    base.require(catalogue.get('revision') == 26 and candidate.get('revision') == 27
                 and catalogue.get('default_policy') == candidate.get('default_policy') == 'deny', 'Expected catalogue transition 26 to 27')
    base.require(set(catalogue['services']) == set(candidate['services'])
                 and all(v.get('implemented') == candidate['services'][k].get('implemented')
                         for k, v in catalogue['services'].items()), 'Capability drift')
    reviewed = base.json.loads((base.PRIVATE / 'native-cutover.json').read_text())
    base.require(set(reviewed) == {'commit', 'manifestSha256', 'probePartnerId'}
                 and reviewed['commit'] == commit
                 and re.fullmatch('[0-9a-f]{64}', reviewed['manifestSha256'])
                 and isinstance(reviewed['probePartnerId'], str) and reviewed['probePartnerId'], 'Exact private reviewed cutover required')
    c, cat = copy.deepcopy(config), copy.deepcopy(catalogue)
    # Preserve every existing activation cutoff and service switch; no historic replay.
    c.update(conversation_api_enabled=True, conversation_api_environment='prod',
             conversation_api_origin=origin, conversation_api_audience=audience,
             conversation_api_manifest_sha256=reviewed['manifestSha256'],
             conversation_api_probe_partner_id=reviewed['probePartnerId'], code_version=commit)
    cat['revision'] = 27
    return c, cat


def probe(config, catalogue, request_id):
    code = '''import json,sys
from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.conversation_api import probe
from mw_integration_agent.receipt_api import call
p=json.load(sys.stdin);validate_config(p['config']);validate_catalogue(p['catalogue'])
for scope in ('oltp','olap'): probe(p['config'],scope)
if call(p['config'],'GET',request=p['request'])!={'kind':'unresolved'}:raise RuntimeError('Receipt status probe failed')
print('native-read-only-ok')
'''
    base.require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', request_id or ''), 'Unused status UUID required')
    result = base.subprocess.run(['sudo', '-u', 'mwagent', base.PYTHON, '-c', code],
        input=base.json.dumps({'config': config, 'catalogue': catalogue, 'request': request_id}), text=True, capture_output=True)
    base.require(result.returncode == 0 and result.stdout.strip() == 'native-read-only-ok', 'Native OIDC/read/receipt-status probe failed; workers remain paused')


if __name__ == '__main__':
    # Preserve the previous receipt-only rollback pointer and package untouched.
    base.POINTER = Path('/var/lib/mw-integration-agent/rollback/r053-native-current')
    base.prepare = prepare
    base.probe = probe
    base.main()
