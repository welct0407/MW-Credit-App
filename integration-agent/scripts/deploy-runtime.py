"""Code-only runtime deployment: the established freeze/install/activate/rollback with the receiver readiness gate.

Every switch, cutoff and catalogue entry is preserved; only config code_version follows the pinned commit."""
import importlib.util
from pathlib import Path
import re
spec=importlib.util.spec_from_file_location('native',Path(__file__).with_name('deploy-native-conversations.py'))
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
base=native.base

def prepare(config,catalogue,candidate,commit,origin,audience,cutoff):
    base.require(re.fullmatch('[0-9a-f]{40}',commit or '') is not None,'Exact commit required')
    base.require(config.get('state_backend')=='postgres','PostgreSQL state backend required')
    base.require(catalogue.get('revision')==candidate.get('revision'),'Catalogue revision drift')
    base.require(set(catalogue['services'])==set(candidate['services']),'Service drift')
    base.require(all(v.get('implemented')==candidate['services'][k].get('implemented') for k,v in catalogue['services'].items()),'Capability drift')
    c=base.copy.deepcopy(config); c['code_version']=commit
    return c,base.copy.deepcopy(catalogue)

base.POINTER=Path('/var/lib/mw-integration-agent/rollback/runtime-current')
base.PREFIX='runtime-'
base.prepare=prepare
base.probe=native.probe
if __name__ == '__main__':
    base.main()
