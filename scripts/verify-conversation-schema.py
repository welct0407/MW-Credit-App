"""Read-only live schema/API and Partner actor checks. Never prints row values."""
import hashlib
import json
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.conversation_schema import load_schema
from mw_integration_agent.conversation_write import actor_email
from mw_integration_agent.cash_statement import partners
from mw_integration_agent.appsheet import AppSheet

c=load_json('/etc/mw-integration-agent/config.json')
c['conversation_schema_file']='/etc/mw-integration-agent/appsheet-schema.json'
c['conversation_schema_sha256']=hashlib.sha256(Path(c['conversation_schema_file']).read_bytes()).hexdigest()
s=load_schema(c)
enabled=[p for p in partners(c) if p['enabled'] is True]
assert enabled, 'No opted-in Partner to verify'
actors=[actor_email(c,p['id']) for p in enabled]
assert len(set(actors))==len(actors),'Partner login actors must be unique'
results={}
for app,data in s['apps'].items():
    result={'version':data['version'],'tables':0,'nonempty_tables':0,'missing_fields':{}}
    for table,definition in data['tables'].items():
        client=AppSheet(dict(c,_appsheet_run_as_user_email=actors[0]),app)
        rows=client.find(table,'Top(Filter('+json.dumps(table)+', true), 1)')
        if rows:
            assert definition['key'] in rows[0], 'API key mismatch'
            missing=sorted(set(definition['columns'])-set(rows[0])-{'_RowNumber'})
            if missing:result['missing_fields'][table]=missing
            result['nonempty_tables']+=1
        result['tables']+=1
    results[app]=result
for actor in actors:
    for app in s['apps']:
        AppSheet(dict(c,_appsheet_run_as_user_email=actor),app).find('Borrowers','Top(Filter("Borrowers", true), 1)')
print(json.dumps({'apps':results,'partner_actors_verified':len(actors),'business_writes':0,'messages_sent':0}))
