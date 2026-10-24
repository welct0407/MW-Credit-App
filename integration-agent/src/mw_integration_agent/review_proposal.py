"""Build a fixed payment proposal from current balances, never an AI command."""
from datetime import date,datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from .cash_statement import read_query
from .receipt_rules import BANGKOK,ReceiptInvalid


def loan_display_key(name, description, principal, loan_date, rate):
    """Native receiving label: payment-command/draft.mjs paymentLoanDisplayKey."""
    borrower = (name if isinstance(name, str) else '') + ' - ' + (description if isinstance(description, str) else '')
    try:
        if principal is None:
            amount = ''
        else:
            number = Decimal(str(principal))
            if not number.is_finite() or abs(number) > 9007199254740991:
                raise ValueError()
            rounded = abs(number).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
            amount = ('-' if number.is_signed() else '') + '฿' + format(rounded, ',.0f')
        day = '' if loan_date is None else date.fromisoformat(loan_date).strftime('%d/%m')
        if loan_date is not None and date.fromisoformat(loan_date).isoformat() != loan_date:
            raise ValueError()
    except (ValueError, TypeError, InvalidOperation):
        raise ReceiptInvalid('LOAN_KEY_UNAVAILABLE') from None
    return borrower + '-' + amount + '-' + day + '-' + ('Unavailable' if rate is None else str(rate) + '%')


def facts(config,borrower_id):
    key="'"+str(borrower_id).replace("'","''")+"'"
    result=read_query(config,'''SELECT json_build_object(
      'loans',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
       SELECT l."Row ID" id,l."Loan Status" status,l."Loan Type" type,l."Auto Charge Enabled" auto,
        l."Outstanding Principal"::text principal,l."Current Daily Interest"::numeric::text daily,
        l."Loan Date"::text date,b."Row ID" label_borrower_id,b."Borrower Name" label_name,b."Description" label_description,
        l."Principal Amount"::numeric::text label_principal,l."Original Daily Interest Rate"::text label_rate
       FROM public."Loans" l LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
       WHERE l."Ref Borrowers"='''+key+''' ORDER BY l."Row ID") t),
      'charges',(SELECT coalesce(json_agg(t),'[]'::json) FROM (
       SELECT c."Row ID" id,c."Ref Loans" loan,c."Charge Date"::text date,
        c."Principal Remaining"::text principal,c."Interest Remaining"::text interest
       FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
       WHERE l."Ref Borrowers"='''+key+''' ORDER BY c."Row ID") t));''')
    for loan in result['loans']:
        if loan.pop('label_borrower_id') != str(borrower_id):raise ReceiptInvalid('LOAN_KEY_UNAVAILABLE')
        loan['loan_key']=loan_display_key(loan.pop('label_name'),loan.pop('label_description'),
                                         loan.pop('label_principal'),loan['date'],loan.pop('label_rate'))
    return result


def due_charges(current,day):
    """Charges owed on `day`: charge date not after it and something left to pay."""
    return [c for c in current['charges'] if c['date']<=day and Decimal(c['principal'])+Decimal(c['interest'])>0]


def fits(receipt,borrower,current):
    """The receipt amount exactly equals one due charge's total or interest, all due charges, or this borrower's
    Loan Close payoff (R095 weak-context narrowing)."""
    amount=Decimal(receipt['amount']);due=due_charges(current,receipt['date'])
    if any(Decimal(c['principal'])+Decimal(c['interest'])==amount or Decimal(c['interest'])==amount for c in due):return True
    if due and sum((Decimal(c['principal'])+Decimal(c['interest']) for c in due),Decimal(0))==amount:return True
    try:return plan(receipt,borrower,current)['action']=='Loan Close'
    except (ReceiptInvalid,KeyError,InvalidOperation,ValueError):return False


def unlabelled(current):
    """Balance facts without display labels; a label-only change is not a facts change."""
    try:return {**current,'loans':[{k:v for k,v in loan.items() if k!='loan_key'} for loan in current['loans']]}
    except (KeyError,TypeError,AttributeError):return current


def same_posting_outcome(saved, fresh, automatic):
    """Owner rule (20 Oct 2026): an approval survives a charge/loan edit while the receipt,
    borrower and consequence (post the full amount as Lump Sum) are unchanged. Never raises."""
    def full(proposal):
        return proposal.get('action')=='Lump Sum' or (not automatic and review_posts_overpayment(proposal))
    try:
        return (saved['receipt']==fresh['receipt'] and saved['borrower']['id']==fresh['borrower']['id']
                and full(saved) and full(fresh))
    except (KeyError, TypeError, AttributeError):
        return False


def plan(receipt,borrower,current,today=None):
    today=today or datetime.now(BANGKOK).date().isoformat()
    amount=Decimal(receipt['amount'])
    if amount!=amount.to_integral_value():raise ReceiptInvalid('WHOLE_BAHT_REQUIRED')
    if any(Decimal(c['principal'])<0 or Decimal(c['interest'])<0 for c in current['charges']):
        raise ReceiptInvalid('BALANCES_REQUIRE_RECONCILIATION')
    due=sum((Decimal(c['principal'])+Decimal(c['interest']) for c in current['charges'] if c['date']<=receipt['date']),Decimal(0))
    dated=[c for c in current['charges'] if c['date']<=receipt['date'] and Decimal(c['principal'])+Decimal(c['interest'])>0]
    latest_day=max((c['date'] for c in dated),default=None)
    current_amount=sum((Decimal(c['principal'])+Decimal(c['interest']) for c in dated if c['date']==latest_day),Decimal(0))
    # A payment covered by current charges is ordinary, even if it happens to
    # equal a smaller loan's payoff. Principal alone is not a closure signal.
    if amount<=current_amount and amount<=due:action='Lump Sum';loan_id=None
    else:
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
        if closures:action='Loan Close';loan_id=closures[0]
        else:action='Overpayment review';loan_id=None
    relevant={c['loan'] for c in dated}
    loan_keys=[l['loan_key'] for l in current['loans'] if l.get('loan_key') and (l['id']==loan_id if loan_id else l['id'] in relevant)]
    proposal={'receipt':receipt,'borrower':borrower,'action':action,'loan_id':loan_id,'loan_keys':loan_keys,'facts':current,'planned_on':today}
    if action=='Overpayment review':proposal['approved_allocation_method']='Lump Sum'
    return proposal


def review_posts_overpayment(proposal):
    # Earlier requests explicitly promised manual handling; do not reinterpret their replies.
    return proposal.get('action')=='Overpayment review' and proposal.get('approved_allocation_method')=='Lump Sum'
