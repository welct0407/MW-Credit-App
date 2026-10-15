"""Explicit operator migration CLI. Connection/secret files remain outside Git."""
import argparse
import json
from pathlib import Path
import uuid
import psycopg
from mw_integration_agent.state_migration import backup_journals, import_journals, migrate

p=argparse.ArgumentParser()
p.add_argument('command',choices=['backup','migrate','import'])
p.add_argument('--source');p.add_argument('--target');p.add_argument('--connection-file')
p.add_argument('--config');p.add_argument('--source-commit');p.add_argument('--batch-id')
p.add_argument('--writers-stopped',action='store_true')
p.add_argument('--output')
a=p.parse_args()
if a.command=='backup':
    if not a.writers_stopped:p.error('verify affected writers stopped before final backup')
    result=backup_journals(a.source,a.target)
else:
    path=Path(a.connection_file).resolve()
    if any(part.lower()=='.git' or part.lower()=='github' for part in path.parts):p.error('connection file must be outside Git')
    options=json.loads(path.read_text(encoding='utf-8-sig'))
    if options['dbname']!='mw_agent':p.error('central database target must be mw_agent')
    if 'password_file' in options:options['password']=Path(options.pop('password_file')).read_text().strip()
    with psycopg.connect(**options,autocommit=True) as c:
        if a.command=='migrate': result=migrate(c,Path(__file__).resolve().parents[1]/'database/migrations')
        else:
            config=json.loads(Path(a.config).read_text(encoding='utf-8-sig'))
            if not a.writers_stopped:p.error('verify affected writers stopped before import')
            with c.transaction():
                result=import_journals(c,a.source,config,uuid.UUID(a.batch_id),a.source_commit)
if a.output:Path(a.output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'ok','command':a.command,'rows':result.get('rows'),'applied':result.get('applied')}))
