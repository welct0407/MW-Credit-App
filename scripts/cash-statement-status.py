"""Private journal metadata only; no identities, statements, or provider IDs printed."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path

c=json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
path=Path(c['state_directory'])/'cash-statement-delivery.db'
with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
    counts=dict(db.execute('SELECT state,count(*) FROM cash_statement_sends GROUP BY state'))
print(json.dumps({'sending_enabled':c['sending_enabled'],'processing_enabled':c['processing_enabled'],
                  'writes_enabled':c['writes_enabled'],'daily_briefing_enabled':c['daily_briefing_enabled'],
                  'cash_statement_delivery_counts':counts}))
