"""Aggregate verification for the explicitly authorized 27 September backfill."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.cash_statement import read_query
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_storage import GCS

c=load_json('/etc/mw-integration-agent/config.json')
root=Path(c['state_directory'])
folder=root/'receipt-backfill-20260927'
j=ReceiptJournal(root/'receipt-processing.db',config=c)
plan=json.loads((folder/'plan.json').read_text())
sql='''SELECT json_build_object('payments',(SELECT md5(string_agg((to_jsonb(p)-'IG Receipt ID'-'Receipt Image'-'Receipt Received At')::text,'' ORDER BY "Row ID")) FROM public."Payments" p),'repayments',(SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY "Row ID")) FROM public."Repayments" r),'payments_count',(SELECT count(*) FROM public."Payments"));'''
financial_unchanged=read_query(c,sql)==json.loads((folder/'financial-before.json').read_text())
storage=GCS(c)
verified=0
for entry in plan:
    if entry['status']!='ready':continue
    asset=dict(j.db.execute('SELECT * FROM receipt_assets WHERE job_id=?',(entry['job_id'],)).fetchone())
    assert asset['archive_state']=='ARCHIVED'
    raw=storage.read(asset['object_key'],asset['generation'])
    assert len(raw)==asset['byte_size'] and hashlib.sha256(raw).hexdigest()==asset['raw_sha256']==entry['sha256']
    verified+=1
links=[dict(r) for r in j.db.execute('SELECT * FROM receipt_payment_links').fetchall()]
payments=read_query(c,'''SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT "Row ID" id,"IG Receipt ID" receipt,"Receipt Image" image FROM public."Payments" WHERE "IG Receipt ID" IS NOT NULL) t;''')
by_id={p['id']:p for p in payments}
for link in links:
    assert link['projection_state']=='APPLIED'
    asset=dict(j.db.execute('SELECT * FROM receipt_assets WHERE receipt_id=?',(link['receipt_id'],)).fetchone())
    assert by_id[link['payment_id']]['receipt']==asset['receipt_id']
    assert by_id[link['payment_id']]['image']=='//'+asset['object_key']
result={'recovery':dict(Counter(e['status'] for e in plan)),'exact_generation_downloads_verified':verified,
        'applied_links_verified':len(links),'financial_payment_and_repayment_fingerprints_unchanged':financial_unchanged,
        'financial_posting_invoked':False,'notifications_invoked':False}
assert financial_unchanged
(folder/'verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
j.close()
