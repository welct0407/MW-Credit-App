"""Code-only runtime deployment: the established freeze/install/activate/rollback with the receiver readiness gate.

Every switch, cutoff and catalogue entry is preserved; only config code_version follows the pinned commit.
R091 (Instagram Partner conversation retired): the one accepted change of a live catalogue revision 31 to the
candidate revision 32 removes exactly the retired conversation services, and the configuration loses exactly the
retired conversation keys (the package's validator refuses a configuration that still carries one). activate
writes both while every worker stays paused; the freeze copy (a dated 0700 backup directory) is the rollback.
`deploy-shared-receipt-api.py` is the engine; this file supplies the preparation. The probe is the engine's
read-only receipt-status GET (the native conversation probe left with the conversation)."""
import copy
import importlib.util
from pathlib import Path
import re
spec=importlib.util.spec_from_file_location('receipt_deployment',Path(__file__).with_name('deploy-shared-receipt-api.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

# The same sets as mw_integration_agent.config (RETIRED_SERVICES, RETIRED_KEYS, RETIRED_PREFIXES); a unit test pins them.
R091_REVISIONS=(31,32)
R091_SERVICES=frozenset({'persistent_codex_conversation','gemini_partner_conversation','claude_partner_conversation',
    'conversation_sql_read','operational_data_api','reviewer_database_dml','operational_data_read'})
R091_KEYS=frozenset({'partner_conversations_enabled','conversation_writes_enabled','reviewer_dml_enabled','reviewer_delete_enabled',
    'native_delete_enabled','conversation_provider','conversation_sql_read_enabled','conversation_grounding',
    'conversation_timeout_seconds','partner_conversation_cutoff','reviewer_dml_cutoff','conversation_api_enabled',
    'conversation_api_environment','conversation_api_origin','conversation_api_audience',
    'conversation_api_manifest_sha256','conversation_api_probe_partner_id'})
R091_PREFIXES=('gemini_conversation_','claude_','database_dml_')


def retired(key):return key in R091_KEYS or key.startswith(R091_PREFIXES)


def prepare(config,catalogue,candidate,commit,origin,audience,cutoff):
    base.require(re.fullmatch('[0-9a-f]{40}',commit or '') is not None,'Exact commit required')
    base.require(config.get('state_backend')=='postgres','PostgreSQL state backend required')
    live,wanted=set(catalogue['services']),set(candidate['services'])
    r091=(catalogue.get('revision'),candidate.get('revision'))==R091_REVISIONS
    if r091:
        base.require(live-wanted==R091_SERVICES and wanted<=live,'R091 catalogue must drop exactly the retired conversation services')
    else:
        base.require(catalogue.get('revision')==candidate.get('revision'),'Catalogue revision drift')
        base.require(live==wanted,'Service drift')
    base.require(all(catalogue['services'][k].get('implemented')==candidate['services'][k].get('implemented') for k in wanted),'Capability drift')
    c=copy.deepcopy(config)
    if r091:
        for key in [k for k in c if retired(k)]:del c[key]
    else:
        base.require(not any(retired(k) for k in c),'Retired conversation keys need the R091 catalogue change')
    c['code_version']=commit
    cat=copy.deepcopy(catalogue)
    if r091:
        cat['revision']=candidate['revision']
        for name in R091_SERVICES:del cat['services'][name]
    return c,cat


base.POINTER=Path('/var/lib/mw-integration-agent/rollback/runtime-current')
base.PREFIX='runtime-'
base.prepare=prepare
if __name__ == '__main__':
    base.main()
