"""Fresh read-only manual-payment duplicate guard; uncertain matches stop processing."""
import re
from decimal import Decimal
from .cash_statement import read_query
from .receipt_rules import ReceiptInvalid


def decision(receipt,borrower,rows):
    reference=receipt['reference']
    possible=[]
    for row in rows:
        same_ref=re.sub(r'[\s-]','',str(row.get('reference') or '')).upper()==reference
        same_facts=(row['borrower']==borrower['id'] and Decimal(str(row['amount']))==Decimal(receipt['amount'])
                    and row['date']==receipt['date'])
        if not (same_ref or same_facts):continue
        exact_facts=(same_facts and row['account']==receipt['account_id'])
        confirmed=(row['status']=='Posted' and exact_facts and
                   (same_ref or row.get('minute')==receipt['date']+' '+receipt['time'][:5]))
        possible.append(confirmed)
    if len(possible)==1 and possible[0]:return 'PAYMENT_ALREADY_RECORDED'
    if possible:return 'POSSIBLE_EXISTING_PAYMENT_REVIEW'
    return None


def check(config,receipt,borrower):
    # Values are SQL string literals, never identifiers or model-generated SQL.
    def literal(value):return "'"+str(value).replace("'","''")+"'"
    rows=read_query(config,'''SELECT coalesce(json_agg(t),'[]'::json) FROM (
      SELECT "Status" status,"Ref Borrower" borrower,"Amount Received"::numeric amount,
       "Payment Date"::text date,"Ref Received By Cash Account" account,"Bank Reference" reference,
       to_char("Created At",'YYYY-MM-DD HH24:MI') minute
      FROM public."Payments" WHERE
       upper(regexp_replace(coalesce("Bank Reference",''),'[[:space:]-]','','g'))='''+literal(receipt['reference'])+
      ''' OR ("Ref Borrower"='''+literal(borrower['id'])+''' AND "Payment Date"='''+literal(receipt['date'])+'''::date
       AND "Amount Received"::numeric='''+literal(receipt['amount'])+'''::numeric)) t;''')
    reason=decision(receipt,borrower,rows)
    if reason:raise ReceiptInvalid(reason)
