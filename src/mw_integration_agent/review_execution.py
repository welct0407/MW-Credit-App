"""One approved ordinary receipt -> one Payments Add; unknown results never replay."""
import json
import urllib.request
from decimal import Decimal
from .config import ConfigurationError,load_secret
from .cash_statement import read_query


def add_payment(config,key,proposal,actor):
    if config.get('partner_review_execution_enabled') is not True:raise ConfigurationError('REVIEW_EXECUTION_DISABLED')
    if proposal['action']!='Lump Sum':raise ConfigurationError('PARTNER_MANUAL_HANDLING_REQUIRED')
    if config['appsheet_app_id']!='93844270-6aa5-420b-a960-bcdf08abd357':raise ConfigurationError('WRONG_PAYMENT_APP')
    r=proposal['receipt']
    row={'Row ID':key,'Status':'Processing','Ref Borrower':proposal['borrower']['id'],
         'Amount Received':r['amount'],'Payment Method':'Bank Transfer','Allocation Method':'Lump Sum',
         'Bank Reference':r['reference'],'Ref Received By Cash Account':r['account_id'],
         'Payment Date':r['date'][5:7]+'/'+r['date'][8:10]+'/'+r['date'][:4],
         'Created At':r['date'][5:7]+'/'+r['date'][8:10]+'/'+r['date'][:4]+' '+r['time'][:5]+':00',
         'Created By':actor,'Notes':'Approved Instagram receipt review '+key}
    url='https://www.appsheet.com/api/v2/apps/'+config['appsheet_app_id']+'/tables/Payments/Action'
    req=urllib.request.Request(url,data=json.dumps({'Action':'Add','Properties':{'Locale':'en-US','Timezone':'Asia/Bangkok'},'Rows':[row]}).encode(),
        headers={'Content-Type':'application/json','ApplicationAccessKey':load_secret(config,'appsheet_key_file')},method='POST')
    # Caller commits POSTING first. Any failure is UNKNOWN; no automatic Add retry.
    with urllib.request.urlopen(req,timeout=60) as response:response.read()


def readback(config,key,proposal):
    literal="'"+key.replace("'","''")+"'"
    rows=read_query(config,'''SELECT coalesce(json_agg(t),'[]'::json) FROM (
      SELECT p."Status" status,p."Ref Borrower" borrower,p."Amount Received"::numeric::text amount,
       p."Payment Date"::text date,to_char(p."Created At",'YYYY-MM-DD HH24:MI') clock,
       p."Ref Received By Cash Account" account,p."Bank Reference" reference,
       (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0)::text FROM public."Repayments" r WHERE r."Ref Payment"=p."Row ID") posted
       FROM public."Payments" p WHERE p."Row ID"='''+literal+''') t;''')
    if len(rows)!=1:return False
    p=rows[0];r=proposal['receipt']
    return (p['status']=='Posted' and p['borrower']==proposal['borrower']['id'] and
        Decimal(p['amount'])==Decimal(r['amount'])==Decimal(p['posted']) and p['date']==r['date'] and
        p['clock']==r['date']+' '+r['time'][:5] and p['account']==r['account_id'] and p['reference']==r['reference'])
