"""Code-only runtime deployment: the established freeze/install/activate/rollback with the receiver readiness gate.

Every switch, cutoff and catalogue entry is preserved; only config code_version follows the pinned commit.
R144 (component versioning): `--release Rnnn` (any phase, validated) also writes config code_release, which /ready and
/healthz report beside the commit; a deploy without it drops a stale code_release (the release is then unknown, not wrong).
R091 (Instagram Partner conversation retired): the one accepted change of a live catalogue revision 31 to the
candidate revision 32 removes exactly the retired conversation services. R094: every deployment drops the retired
conversation keys from the configuration, whatever the catalogue change (the package's validator refuses a
configuration that still carries one; R094 added the three inert keys R091 left on the VM), and keeps every other
key. activate writes both while every worker stays paused; the freeze copy (a dated 0700 backup directory) is the
rollback.
R102 (VM chat relay): the one accepted change of a live revision 32 to the candidate revision 33 adds exactly the
chat_messages_relay service, disabled (default deny; activation is a separate owner authorization).
R112 (pay-forward options reply): the one accepted change of a live revision 33 to the candidate revision 34. The
candidate's service definitions must be exactly the repository revision 33 template's (R112_TEMPLATE_SHA256: no service
and no default switch changed), the live service names and capabilities must match them, and the live switches are
kept exactly as they are (only the revision number changes). The live switches are never compared with the
repository defaults: a host that enabled a service must pass. The new behaviour is behind the configuration switch
pay_forward_options_enabled, which a deploy keeps as it is (absent means off).
R119 (agent recheck of ignored and held slips): the one accepted change of a live revision 34 to the candidate revision
35, the same shape as R112: the candidate's services are exactly the repository revision 34 template's (unchanged in 35),
the live services match them and the live switches are kept. The new behaviour is behind the configuration switch
conversation_poll_recheck_enabled, which a deploy keeps as it is (absent means off).
R128 (Instagram-approved Loan Close): the one accepted change of a live revision 35 to the candidate revision 36, the same
shape: the candidate's services are exactly the repository revision 35 template's (unchanged in 36), the live services match
them and the live switches are kept. The new behaviour is behind the configuration switch loan_close_execution_enabled,
which a deploy keeps as it is (absent means off; Forge sets it at promotion).
R142 (Claude receipt reader and slip QR reference): the one accepted change of a live revision 36 to the candidate
revision 37, the same shape: the candidate's services are exactly the repository revision 36 template's (unchanged in 37),
the live services match them and the live switches are kept. The new behaviour is behind configuration a deploy keeps
as it is: the receipt_claude_* settings, the optional route keys of receipt_recognition_callers entries and
receipt_cycle_fallback / receipt_cycle_qr_reference / receipt_cycle_clean_text (absent means today's behaviour; receipt_claude_* is not the retired
claude_ prefix).
R146 (group chat summary): the one accepted change of a live revision 37 to the candidate revision 38 adds exactly the
group_chat_summary service, disabled (default deny; the same shape as R102). The live switches of every other service
are kept; switching the service on is a separate owner authorization (group_chat_summary_enabled and the catalogue
entry), after agent migration V12 and the unit files are in place.
`deploy-shared-receipt-api.py` is the engine; this file supplies the preparation. The probe is the engine's
read-only receipt-status GET (the native conversation probe left with the conversation)."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
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
    'conversation_api_manifest_sha256','conversation_api_probe_partner_id',
    'conversation_schema_file','conversation_schema_sha256','partner_conversation_backup'})
R091_PREFIXES=('gemini_conversation_','claude_','database_dml_')
R102_REVISIONS=(32,33)
R102_SERVICES=frozenset({'chat_messages_relay'})
R112_REVISIONS=(33,34)
# sha256 of the compact, key-sorted JSON of the repository revision 33 catalogue's services (unchanged in revision 34).
R112_TEMPLATE_SHA256='5300fe1aa4c2072208df1d0b9853083c48ece0725a57636fc58d1655ab7b8e27'
R119_REVISIONS=(34,35)
# The repository revision 34 catalogue's services, unchanged in revision 35 (the same template as R112's).
R119_TEMPLATE_SHA256=R112_TEMPLATE_SHA256
R128_REVISIONS=(35,36)
# The repository revision 35 catalogue's services, unchanged in revision 36 (the same template again).
R128_TEMPLATE_SHA256=R112_TEMPLATE_SHA256
R142_REVISIONS=(36,37)
# The repository revision 36 catalogue's services, unchanged in revision 37 (the same template again).
R142_TEMPLATE_SHA256=R112_TEMPLATE_SHA256
R146_REVISIONS=(37,38)
R146_SERVICES=frozenset({'group_chat_summary'})
# R144: the release of the commit being deployed, from --release (main); None leaves the release unknown.
RELEASE_PATTERN=re.compile('R[0-9]{3}')
RELEASE={'value':None}


def services_sha256(services):
    return hashlib.sha256(json.dumps(services,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def retired(key):return key in R091_KEYS or key.startswith(R091_PREFIXES)


def prepare(config,catalogue,candidate,commit,origin,audience,cutoff,release=None):
    release=RELEASE['value'] if release is None else release
    base.require(re.fullmatch('[0-9a-f]{40}',commit or '') is not None,'Exact commit required')
    base.require(release is None or (isinstance(release,str) and RELEASE_PATTERN.fullmatch(release) is not None),'Release must look like R144')
    base.require(config.get('state_backend')=='postgres','PostgreSQL state backend required')
    live,wanted=set(catalogue['services']),set(candidate['services'])
    r091=(catalogue.get('revision'),candidate.get('revision'))==R091_REVISIONS
    r102=(catalogue.get('revision'),candidate.get('revision'))==R102_REVISIONS
    r112=(catalogue.get('revision'),candidate.get('revision'))==R112_REVISIONS
    r119=(catalogue.get('revision'),candidate.get('revision'))==R119_REVISIONS
    r128=(catalogue.get('revision'),candidate.get('revision'))==R128_REVISIONS
    r142=(catalogue.get('revision'),candidate.get('revision'))==R142_REVISIONS
    r146=(catalogue.get('revision'),candidate.get('revision'))==R146_REVISIONS
    if r146:
        base.require(wanted-live==R146_SERVICES and live<=wanted,'R146 catalogue must add exactly group_chat_summary')
        base.require(all(candidate['services'][k]=={'enabled':False,'implemented':True} for k in R146_SERVICES),'R146 group_chat_summary must arrive disabled')
    elif r091:
        base.require(live-wanted==R091_SERVICES and wanted<=live,'R091 catalogue must drop exactly the retired conversation services')
    elif r102:
        base.require(wanted-live==R102_SERVICES and live<=wanted,'R102 catalogue must add exactly chat_messages_relay')
        base.require(all(candidate['services'][k]=={'enabled':False,'implemented':True} for k in R102_SERVICES),'R102 chat_messages_relay must arrive disabled')
    elif r112:
        # Repository revision 34 against repository revision 33: no service definition or default switch changed.
        base.require(services_sha256(candidate['services'])==R112_TEMPLATE_SHA256,'R112 candidate must keep the revision 33 services and switches')
        base.require(live==wanted,'R112 catalogue must keep every service')
    elif r119:
        # Repository revision 35 against repository revision 34: no service definition or default switch changed.
        base.require(services_sha256(candidate['services'])==R119_TEMPLATE_SHA256,'R119 candidate must keep the revision 34 services and switches')
        base.require(live==wanted,'R119 catalogue must keep every service')
    elif r128:
        # Repository revision 36 against repository revision 35: no service definition or default switch changed.
        base.require(services_sha256(candidate['services'])==R128_TEMPLATE_SHA256,'R128 candidate must keep the revision 35 services and switches')
        base.require(live==wanted,'R128 catalogue must keep every service')
    elif r142:
        # Repository revision 37 against repository revision 36: no service definition or default switch changed.
        base.require(services_sha256(candidate['services'])==R142_TEMPLATE_SHA256,'R142 candidate must keep the revision 36 services and switches')
        base.require(live==wanted,'R142 catalogue must keep every service')
    else:
        base.require(catalogue.get('revision')==candidate.get('revision'),'Catalogue revision drift')
        base.require(live==wanted,'Service drift')
    base.require(all(catalogue['services'][k].get('implemented')==candidate['services'][k].get('implemented') for k in wanted&live),'Capability drift')
    c=copy.deepcopy(config)
    for key in [k for k in c if retired(k)]:del c[key]
    c['code_version']=commit
    if release is None:c.pop('code_release',None)
    else:c['code_release']=release
    cat=copy.deepcopy(catalogue)
    if r091:
        cat['revision']=candidate['revision']
        for name in R091_SERVICES:del cat['services'][name]
    if r112:
        cat['revision']=candidate['revision']
        base.require(cat['services']==catalogue['services'],'R112 must keep the live switches')
    if r119:
        cat['revision']=candidate['revision']
        base.require(cat['services']==catalogue['services'],'R119 must keep the live switches')
    if r128:
        cat['revision']=candidate['revision']
        base.require(cat['services']==catalogue['services'],'R128 must keep the live switches')
    if r142:
        cat['revision']=candidate['revision']
        base.require(cat['services']==catalogue['services'],'R142 must keep the live switches')
    if r102:
        cat['revision']=candidate['revision']
        for name in R102_SERVICES:cat['services'][name]=dict(candidate['services'][name])
    if r146:
        cat['revision']=candidate['revision']
        for name in R146_SERVICES:cat['services'][name]=dict(candidate['services'][name])
    return c,cat


base.POINTER=Path('/var/lib/mw-integration-agent/rollback/runtime-current')
base.PREFIX='runtime-'
base.prepare=prepare


def main(argv=None):
    """The engine's CLI plus R144 --release Rnnn (also --release=Rnnn), validated before any phase runs."""
    argv=list(sys.argv[1:] if argv is None else argv)
    rest,release,seen=[],None,0
    i=0
    while i<len(argv):
        arg=argv[i]
        if arg=='--release':
            base.require(i+1<len(argv),'--release needs a value');release,seen,i=argv[i+1],seen+1,i+2;continue
        if arg.startswith('--release='):
            release,seen=arg.split('=',1)[1],seen+1
        else:
            rest.append(arg)
        i+=1
    base.require(seen<=1,'Give --release once')
    base.require(release is None or RELEASE_PATTERN.fullmatch(release) is not None,'Release must look like R144')
    RELEASE['value']=release
    sys.argv=[sys.argv[0]]+rest
    base.main()


if __name__ == '__main__':
    main()
