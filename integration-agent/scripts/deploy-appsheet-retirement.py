"""R057 retirement: reuse established backup/quiesce/install; no business writes."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('native',Path(__file__).with_name('deploy-native-conversations.py'))
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
base=native.base

def prepare(config,catalogue,candidate,commit,origin,audience,cutoff):
    base.require(config.get('appsheet_enabled') is False,'Retirement config required')
    base.require(not any(k.startswith('appsheet') and k!='appsheet_enabled' for k in config),'Legacy reference remains')
    base.require(catalogue.get('revision')==candidate.get('revision')==27,'Catalogue27 required')
    base.require(set(catalogue['services'])==set(candidate['services']),'Service drift')
    base.require(all(v.get('implemented')==candidate['services'][k].get('implemented') for k,v in catalogue['services'].items()),'Capability drift')
    c=base.copy.deepcopy(config); c['code_version']=commit
    return c,base.copy.deepcopy(catalogue)

base.POINTER=Path('/var/lib/mw-integration-agent/rollback/r057-appsheet-retirement-current')
base.prepare=prepare
base.probe=native.probe
if __name__ == '__main__':
    base.main()


