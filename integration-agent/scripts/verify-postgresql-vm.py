"""Read-only cutover checks and bounded VM latency measurements, no delivery."""
import json
import statistics
import time
from pathlib import Path
from mw_integration_agent.config import load_json,validate_config
from mw_integration_agent import state
from mw_integration_agent.conversation_dml import connect
from mw_integration_agent.statement_snapshot import load

c=load_json('/etc/mw-integration-agent/config.json');validate_config(c)
samples=[]
for i in range(31):
    start=time.perf_counter()
    with state.transaction(c) as db:
        assert db.execute('SELECT current_database(),current_user').fetchone()==('mw_agent','mw_agent_worker')
        assert db.execute('SELECT count(*) FROM runtime.conversations').fetchone()[0]>0
    if i:samples.append(1000*(time.perf_counter()-start))
with state.transaction(c) as db:
    count=db.execute('SELECT count(*) FROM runtime.conversations').fetchone()[0]
    snapshots=db.execute('SELECT snapshot_key FROM runtime.statement_snapshots').fetchall()
    controls=db.execute('SELECT count(*) FROM runtime.service_control WHERE processing_enabled').fetchone()[0]
for key, in snapshots:assert load(c,key)
with connect(c) as db:
    assert db.execute('SELECT current_database() AS db,current_user AS role').fetchone()=={'db':'loan_manager_prod','role':'mw_reviewer_dml'}  # current_user: under database_dml_auth=iam the session user is the IAM login
    assert db.execute("SELECT count(*) AS n FROM pg_trigger WHERE tgname='mw_agent_capture'").fetchone()['n']==10
    assert not db.execute("SELECT has_table_privilege(current_user,'agent_audit.row_changes','INSERT') AS allowed").fetchone()['allowed']
for filename,mapping in state.TABLES.items():
    journal=state.connect(Path(c['state_directory'])/filename,c)
    for name in mapping:
        if filename.endswith('notices.db'):journal.execute('SELECT count(*) FROM partner_notices WHERE id<>?',('',)).fetchone()
        else:journal.execute('SELECT count(*) FROM '+name).fetchone()
result={'central_identity_verified':True,'business_identity_verified':True,'restricted_audit_grants':True,
        'conversation_bindings':count,'snapshots_verified':len(snapshots),'active_generation_controls':controls,
        'warm_read_transaction_ms':{'samples':len(samples),'median':round(statistics.median(samples),2),'p95':round(sorted(samples)[28],2),'max':round(max(samples),2)},
        'writes_or_messages':0}
Path('/home/MWCredit/r015-private/vm-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
