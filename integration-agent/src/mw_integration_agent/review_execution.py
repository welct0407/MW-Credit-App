"""Read-only reconciliation of existing receipt payments; no legacy transport."""
from decimal import Decimal
from .config import ConfigurationError
from .cash_statement import read_query


def add_payment(config,key,proposal,actor):
    """Retired entry point fails closed; old attempts use SQL readback only."""
    raise ConfigurationError('LEGACY_RECEIPT_TRANSPORT_RETIRED')


def readback(config,key,proposal):
    """The posted payment carries the slip's facts and its repayments sum to the amount. R128: the repayments include the
    late charge paid (R118; a late charge was left out before), and an approved close is also the Loan Close of its loan."""
    from .review_proposal import review_posts_close
    literal="'"+key.replace("'","''")+"'"
    rows=read_query(config,'''SELECT coalesce(json_agg(t),'[]'::json) FROM (
      SELECT p."Status" status,p."Ref Borrower" borrower,p."Amount Received"::numeric::text amount,
       p."Payment Date"::text date,to_char(p."Created At",'YYYY-MM-DD HH24:MI') clock,
       p."Ref Received By Cash Account" account,p."Bank Reference" reference,
       p."Allocation Method" method,p."Ref Target Loan" loan,
       (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric+coalesce(r."Late Charge Paid"::numeric,0)),0)::text
        FROM public."Repayments" r WHERE r."Ref Payment"=p."Row ID") posted
       FROM public."Payments" p WHERE p."Row ID"='''+literal+''') t;''')
    if len(rows)!=1:return False
    p=rows[0];r=proposal['receipt']
    if review_posts_close(proposal) and (p.get('method')!='Loan Close' or p.get('loan')!=proposal.get('loan_id')):return False
    return (p['status']=='Posted' and p['borrower']==proposal['borrower']['id'] and
        Decimal(p['amount'])==Decimal(r['amount'])==Decimal(p['posted']) and p['date']==r['date'] and
        p['clock']==r['date']+' '+r['time'][:5] and p['account']==r['account_id'] and p['reference']==r['reference'])
