"""Code-only runtime deployment: the established freeze/install/activate/rollback with the receiver readiness gate.

Every switch, cutoff and catalogue entry is preserved; only config code_version follows the pinned commit.
`deploy-shared-receipt-api.py` is the engine; this file supplies the preparation and the read-only probe."""
import copy
import importlib.util
from pathlib import Path
import re
spec=importlib.util.spec_from_file_location('receipt_deployment',Path(__file__).with_name('deploy-shared-receipt-api.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)


def prepare(config,catalogue,candidate,commit,origin,audience,cutoff):
    base.require(re.fullmatch('[0-9a-f]{40}',commit or '') is not None,'Exact commit required')
    base.require(config.get('state_backend')=='postgres','PostgreSQL state backend required')
    base.require(catalogue.get('revision')==candidate.get('revision'),'Catalogue revision drift')
    base.require(set(catalogue['services'])==set(candidate['services']),'Service drift')
    base.require(all(v.get('implemented')==candidate['services'][k].get('implemented') for k,v in catalogue['services'].items()),'Capability drift')
    c=copy.deepcopy(config); c['code_version']=commit
    return c,copy.deepcopy(catalogue)


def probe(config,catalogue,request_id):
    """Native OIDC/read probes in both scopes plus one receipt status GET; never a command POST."""
    code='''import json,sys
from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.conversation_api import probe
from mw_integration_agent.receipt_api import call
p=json.load(sys.stdin);validate_config(p['config']);validate_catalogue(p['catalogue'])
for scope in ('oltp','olap'): probe(p['config'],scope)
if call(p['config'],'GET',request=p['request'])!={'kind':'unresolved'}:raise RuntimeError('Receipt status probe failed')
print('native-read-only-ok')
'''
    base.require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',request_id or ''),'Unused status UUID required')
    result=base.subprocess.run(['sudo','-u','mwagent',base.PYTHON,'-c',code],
        input=base.json.dumps({'config':config,'catalogue':catalogue,'request':request_id}),text=True,capture_output=True)
    base.require(result.returncode==0 and result.stdout.strip()=='native-read-only-ok','Native OIDC/read/receipt-status probe failed; workers remain paused')


base.POINTER=Path('/var/lib/mw-integration-agent/rollback/runtime-current')
base.PREFIX='runtime-'
base.prepare=prepare
base.probe=probe
if __name__ == '__main__':
    base.main()
