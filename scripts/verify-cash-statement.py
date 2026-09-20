"""Reconcile the prepared snapshot against direct ledger totals; print counts only."""
import argparse
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from PIL import Image
from mw_integration_agent.cash_statement import read_query, period
from mw_integration_agent.config import load_json

p=argparse.ArgumentParser()
p.add_argument('--config',default='/etc/mw-integration-agent/config.json')
p.add_argument('--date')
p.add_argument('--review-thai',action='store_true')
a=p.parse_args()
c=load_json(a.config)
start,end=period(a.date,preview=a.review_thai)
folder=Path(c['state_directory'])/'cash-statements'/('review-thai' if a.review_thai else 'calendar-day')/start.date().isoformat()
report=json.loads((folder/'snapshot.json').read_text())
start,end=(datetime.fromisoformat(report[k]) for k in ('start','end'))
cutoff=end.replace(tzinfo=None).isoformat()
direct=read_query(c,f'''SELECT coalesce(json_agg(t),'[]'::json) FROM (
 SELECT a."Row ID" AS id,c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
 +coalesce((SELECT sum(CASE WHEN l."Ref To Cash Account"=a."Row ID" THEN l."Amount" ELSE 0 END
 -CASE WHEN l."Ref From Cash Account"=a."Row ID" THEN l."Amount" ELSE 0 END)
 FROM public."Cash Ledger" l WHERE l."Created At"<timestamp '{cutoff}'),0) AS closing
 FROM public."Cash Accounts" a JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID") t;''')
actual={r['id']:Decimal(str(r['closing'])) for r in direct}
assert set(actual)=={r['id'] for r in report['accounts']}
for account in report['accounts']:
    assert Decimal(account['closing'])==actual[account['id']]
    assert Decimal(account['opening'])+Decimal(account['money_in'])-Decimal(account['money_out'])==actual[account['id']]
    for row in account['transactions']:
        assert start.replace(tzinfo=None)<=datetime.fromisoformat(row['posted_at'])<end.replace(tzinfo=None)
images=list(folder.glob('*/*/page-*.png'))
for path in images:
    with Image.open(path) as im:
        assert im.width==1200 and im.height>600
    assert path.stat().st_size<8_000_000
print(json.dumps({'reconciled_accounts':len(actual),'verified_images':len(images),
                  'transaction_rows':sum(len(x['transactions']) for x in report['accounts']),
                  'source':'direct Cash Ledger + R008 baseline','status':'passed'}))
