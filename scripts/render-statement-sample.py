"""Synthetic bilingual visual fixture; safe for tracked review artifacts."""
import argparse
from pathlib import Path
from mw_integration_agent.cash_statement import summarize
from mw_integration_agent.statement_image import render

p=argparse.ArgumentParser()
p.add_argument('--output',default='outputs/cash-statement-sample')
p.add_argument('--font',default='/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf')
a=p.parse_args()
account={'id':'synthetic','label':'Sample account / บัญชีตัวอย่าง','bank':'Demo Bank',
         'last4':'0000','initialized':True,'opening':'12500.00','transactions':[
 {'ledger_id':'a','direction':'IN','posted_at':'2026-09-19T06:00:00','effective_date':'2026-09-19',
  'amount':'450.00','type':'LOAN_PAYMENT','kind':'BORROWER','borrower_en':'Sample customer A','borrower_th':'ลูกค้าตัวอย่าง ก'},
 {'ledger_id':'b','direction':'OUT','posted_at':'2026-09-19T11:25:08','effective_date':'2026-09-19',
  'amount':'-3000.00','type':'LOAN_DISBURSEMENT','kind':'BORROWER','borrower_en':'Sample customer B','borrower_th':'ลูกค้าตัวอย่าง ข'},
 {'ledger_id':'c','direction':'OUT','posted_at':'2026-09-19T15:14:09','effective_date':'2026-09-19',
  'amount':'-250.00','type':'BUSINESS_EXPENSE','kind':'PAYEE','counterparty':'Office supplies / อุปกรณ์สำนักงาน'},
 {'ledger_id':'d','direction':'IN','posted_at':'2026-09-20T05:59:59','effective_date':'2026-09-18',
  'amount':'1200.00','type':'ACCOUNT_TRANSFER','kind':'ACCOUNT','other_account':'Sample reserve / บัญชีสำรองตัวอย่าง'}]}
summarize(account)
report={'start':'2026-09-19T06:00:00+07:00','end':'2026-09-20T06:00:00+07:00'}
for language,name in [('English','en'),('ไทย','th')]:
    render(report,account,language,Path(a.output)/name,a.font)
print('Synthetic English and Thai statements rendered')
