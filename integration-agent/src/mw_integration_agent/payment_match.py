"""Fresh bank-reference duplicate guard; conflicting reference matches stop processing."""
import re
from decimal import Decimal
from .cash_statement import read_query
from .receipt_rules import ReceiptInvalid


def decision(receipt,borrower,rows):
    reference=re.sub(r'[\s-]','',str(receipt.get('reference') or '')).upper()
    if not re.fullmatch(r'[A-Z0-9]{6,100}',reference):raise ReceiptInvalid('REFERENCE_UNREADABLE')
    possible=[]
    for row in rows:
        same_ref=re.sub(r'[\s-]','',str(row.get('reference') or '')).upper()==reference
        if not same_ref:continue
        same_facts=(row['borrower']==borrower['id'] and Decimal(str(row['amount']))==Decimal(receipt['amount'])
                    and row['date']==receipt['date'])
        exact_facts=(same_facts and row['account']==receipt['account_id'])
        confirmed=(row['status']=='Posted' and exact_facts)
        possible.append(confirmed)
    if len(possible)==1 and possible[0]:return 'PAYMENT_ALREADY_RECORDED'
    if possible:return 'POSSIBLE_EXISTING_PAYMENT_REVIEW'
    return None


def check(config,receipt,borrower):
    reference=re.sub(r'[\s-]','',str(receipt.get('reference') or '')).upper()
    if not re.fullmatch(r'[A-Z0-9]{6,100}',reference):raise ReceiptInvalid('REFERENCE_UNREADABLE')
    # Values are SQL string literals, never identifiers or model-generated SQL.
    def literal(value):return "'"+str(value).replace("'","''")+"'"
    rows=read_query(config,'''SELECT coalesce(json_agg(t),'[]'::json) FROM (
      SELECT "Status" status,"Ref Borrower" borrower,"Amount Received"::numeric amount,
       "Payment Date"::text date,"Ref Received By Cash Account" account,"Bank Reference" reference
      FROM public."Payments" WHERE
       upper(regexp_replace(coalesce("Bank Reference",''),'[[:space:]-]','','g'))='''+literal(reference)+''') t;''')
    reason=decision(receipt,borrower,rows)
    if reason:raise ReceiptInvalid(reason)
