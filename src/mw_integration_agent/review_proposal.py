"""Build a fixed payment proposal from current balances, never an AI command."""
from datetime import date,datetime
from decimal import Decimal
from .cash_statement import read_query
from .receipt_rules import BANGKOK,ReceiptInvalid


def facts(config,borrower_id):
    key="'"+str(borrower_id).replace("'","''")+"'"
    return read_query(config,'''SELECT json_build_object(
      'loans',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
       SELECT "Row ID" id,"Loan Status" status,"Loan Type" type,"Auto Charge Enabled" auto,
        "Outstanding Principal"::text principal,"Current Daily Interest"::numeric::text daily,
        "Loan Date"::text date FROM public."Loans" WHERE "Ref Borrowers"='''+key+''' ORDER BY "Row ID") t),
      'charges',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
       SELECT c."Row ID" id,c."Ref Loans" loan,c."Charge Date"::text date,
        c."Principal Remaining"::text principal,c."Interest Remaining"::text interest
       FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
       WHERE l."Ref Borrowers"='''+key+''' ORDER BY c."Row ID") t));''')


def plan(receipt,borrower,current,today=None):
    today=today or datetime.now(BANGKOK).date().isoformat()
    amount=Decimal(receipt['amount'])
    if amount!=amount.to_integral_value():raise ReceiptInvalid('WHOLE_BAHT_REQUIRED')
    if any(Decimal(c['principal'])<0 or Decimal(c['interest'])<0 for c in current['charges']):
        raise ReceiptInvalid('BALANCES_REQUIRE_RECONCILIATION')
    due=sum((Decimal(c['principal'])+Decimal(c['interest']) for c in current['charges'] if c['date']<=receipt['date']),Decimal(0))
    closures=[]
    for loan in current['loans']:
        if loan['status']!='ยังไม่ปิดยอด' or loan['type']!='ดอกเบี้ยรายวัน' or loan['auto'] is not True:continue
        charges=[c for c in current['charges'] if c['loan']==loan['id']]
        if not charges or any(c['date']>today for c in charges):continue
        existing_today=[c for c in charges if c['date']==today]
        if len(existing_today)>1:raise ReceiptInvalid('MULTIPLE_TODAY_CHARGES')
        missing_interest=Decimal(0)
        if not existing_today:
            last=max([c['date'] for c in charges]+[loan['date']])
            missing_interest=Decimal(loan['daily'])*max(0,(date.fromisoformat(today)-date.fromisoformat(last)).days)
        total=Decimal(loan['principal'])+sum((Decimal(c['interest']) for c in charges),Decimal(0))+missing_interest
        if total==amount and receipt['date']==today and Decimal(loan['principal'])>0:closures.append(loan['id'])
    if len(closures)>1:raise ReceiptInvalid('LOAN_CLOSE_AMBIGUOUS')
    dated=[c for c in current['charges'] if c['date']<=receipt['date'] and Decimal(c['principal'])+Decimal(c['interest'])>0]
    latest=max(dated,key=lambda c:(c['date'],c['id']),default=None)
    current_amount=Decimal(latest['principal'])+Decimal(latest['interest']) if latest else Decimal(0)
    potential_close=bool(closures) or any(Decimal(l['principal'])>0 and amount>=Decimal(l['principal']) for l in current['loans'] if l['status']=='ยังไม่ปิดยอด')
    if potential_close:action='Loan Close';loan_id=closures[0] if closures else None
    elif amount<=current_amount and amount<=due:action='Lump Sum';loan_id=None
    else:action='Overpayment review';loan_id=None
    return {'receipt':receipt,'borrower':borrower,'action':action,'loan_id':loan_id,'facts':current,'planned_on':today}
