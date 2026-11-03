"""Build a fixed payment proposal from current balances, never an AI command.

R112 (Pay Forward Release 3): with `pay_forward_options_enabled` (default off, fail closed) a slip dated today above
what is due, or with nothing due, that is not a loan payoff becomes 'Pay forward options': the numbers come from the
server's own plan function (pwa_pay_forward_plan_v1, read only) and the proposal keeps planSha256, the hash of the plans
it shows, so a changed plan is detected before anything posts. With the switch off the proposal is today's
'Overpayment review' hold."""
import hashlib
import json
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
        c."Principal Remaining"::text principal,c."Interest Remaining"::text interest,c."Late Charge Remaining"::text late
       FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
       WHERE l."Ref Borrowers"='''+key+''' ORDER BY c."Row ID") t));''')
    for loan in result['loans']:
        if loan.pop('label_borrower_id') != str(borrower_id):raise ReceiptInvalid('LOAN_KEY_UNAVAILABLE')
        loan['loan_key']=loan_display_key(loan.pop('label_name'),loan.pop('label_description'),
                                         loan.pop('label_principal'),loan['date'],loan.pop('label_rate'))
    return result


def owed(c):
    """R118: what a charge still asks for: principal, interest and late charge (late 0 in facts before V132)."""
    return Decimal(c['principal'])+Decimal(c['interest'])+Decimal(c.get('late') or 0)


def due_charges(current,day):
    """Charges owed on `day`: charge date not after it and something left to pay."""
    return [c for c in current['charges'] if c['date']<=day and owed(c)>0]


def fits(receipt,borrower,current):
    """The receipt amount exactly equals one due charge's total or interest, all due charges, or this borrower's
    Loan Close payoff (R095 weak-context narrowing)."""
    amount=Decimal(receipt['amount']);due=due_charges(current,receipt['date'])
    if any(owed(c)==amount or Decimal(c['interest'])==amount for c in due):return True
    if due and sum((owed(c) for c in due),Decimal(0))==amount:return True
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
        if saved.get('action')==OPTIONS or fresh.get('action')==OPTIONS:
            # R112: the options keep their approval only while the server's plans are unchanged.
            return (not automatic and saved['receipt']==fresh['receipt'] and saved['borrower']['id']==fresh['borrower']['id']
                    and saved.get('action')==fresh.get('action')==OPTIONS
                    and saved['options']['planSha256']==fresh['options']['planSha256'])
        return (saved['receipt']==fresh['receipt'] and saved['borrower']['id']==fresh['borrower']['id']
                and full(saved) and full(fresh))
    except (KeyError, TypeError, AttributeError):
        return False


OPTIONS='Pay forward options'
# One read-only call of the server's plan; every value goes in as a psql variable.
PLAN_SQL="SELECT public.pwa_pay_forward_plan_v1(:'borrower',:'amount'::numeric,:'day'::date,:'purpose'::jsonb);"
MAX_PRINCIPAL_OPTIONS=5


def options_enabled(config):
    return isinstance(config,dict) and config.get('pay_forward_options_enabled') is True


def pay_forward_plan(config,borrower_id,amount,day,purpose):
    """The server's plan for one purpose {forward, principal:[{loanId, amount}], loans: None}."""
    value=read_query(config,PLAN_SQL,{'borrower':str(borrower_id),'amount':str(amount),'day':day,
                                      'purpose':json.dumps(purpose,separators=(',',':'),sort_keys=True)})
    if not isinstance(value,dict):raise ReceiptInvalid('PAY_FORWARD_PLAN_UNAVAILABLE')
    return value


def plan_digest(plans):
    return hashlib.sha256(json.dumps(plans,sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str).encode()).hexdigest()


def pay_forward_options(config,receipt,borrower_id,current,today):
    """The choices a slip above what is due offers, from the server's plans, or None when none can be offered.
    1 pay forward: the forward plan covers the whole remainder; 2 repay principal: per eligible daily-interest loan,
    the remainder after its accrued interest, unless that settles the loan (then Loan Close); 3 split: a principal part
    of the one principal loan, the rest pays forward (its plan is read when chosen)."""
    amount=str(int(Decimal(receipt['amount'])))
    forward=pay_forward_plan(config,borrower_id,amount,today,{'forward':True,'principal':[],'loans':None})
    plans={'forward':forward}
    keys={l['id']:l.get('loan_key') for l in current.get('loans',[])}
    remainder=Decimal(str(forward.get('remainder','0')))
    if remainder<=0:return None
    principal,blocked=[],[]
    for option in sorted(forward.get('options') or [],key=lambda o:str(o.get('loanId')).encode())[:MAX_PRINCIPAL_OPTIONS]:
        loan=str(option.get('loanId'))
        # R113: a loan only a settle can take, or whose payoff the remainder reaches, settles in the app only (the agent
        # receipt command keeps refusing a settle): the request says "record in the app".
        payoff=option.get('payoffRemainder')
        if option.get('kind') is None:
            if payoff is not None and Decimal(str(payoff))<=remainder:blocked.append({'loanId':loan,'reason':'settles','loanKey':keys.get(loan)})
            continue
        part=remainder-Decimal(str(option.get('accruedInterest','0')))
        if part<=0:blocked.append({'loanId':loan,'reason':'interest'});continue
        purpose={'forward':False,'principal':[{'loanId':loan,'amount':str(int(part))}],'loans':None}
        read=pay_forward_plan(config,borrower_id,amount,today,purpose);plans['principal:'+loan]=read
        entry=(read.get('principal') or [None])[0]
        if loan in (read.get('settles') or []) or any(b.get('loanId')==loan and b.get('reason') in ('needs_gap_interest','exceeds') for b in read.get('blocked') or []):
            blocked.append({'loanId':loan,'reason':'settles','loanKey':keys.get(loan)})
        elif not entry or read.get('uncovered')!='0':
            reasons=[b.get('reason') for b in read.get('blocked') or [] if b.get('loanId')==loan]
            blocked.append({'loanId':loan,'reason':str(reasons[0] if reasons else 'unavailable')})
        else:principal.append({'loanId':loan,'loanKey':keys.get(loan),'amount':str(int(part)),'dailyAfter':str(entry.get('dailyAfter')),
                               'outstandingAfter':str(entry.get('outstandingAfter'))})
    rows=[r for r in forward.get('forward') or [] if isinstance(r,dict)]
    through=max((d for d in (forward.get('paidThrough') or {}).values() if isinstance(d,str)),default=None)
    uncovered=str(forward.get('uncovered','0'))
    offered=uncovered=='0' and bool(rows) and not forward.get('settles')
    if not offered and not principal:return None
    # R118: the due part's late charge (step 1 pays every due charge in full when there is a remainder), named in the
    # request as "Interest X + Late charge Y"; the key is present only when a late charge is due.
    due_ids=set(forward.get('due') or []);due_lines=[l for l in forward.get('allocations') or [] if isinstance(l,dict) and l.get('chargeId') in due_ids]
    due_late=sum((Decimal(str(l.get('lateCharge') or 0)) for l in due_lines),Decimal(0))
    late_parts={'duePrincipal':str(int(sum((Decimal(str(l.get('principal') or 0)) for l in due_lines),Decimal(0)))),
                'dueInterest':str(int(sum((Decimal(str(l.get('interest') or 0)) for l in due_lines),Decimal(0)))),'dueLate':str(int(due_late))} if due_late>0 else {}
    return {'planSha256':plan_digest(plans),'dueTotal':str(forward.get('dueTotal')),**late_parts,'remainder':str(int(remainder)),
            'forward':{'first':rows[0].get('chargeDate') if rows else None,'last':rows[-1].get('chargeDate') if rows else None,
                       'through':through,'uncovered':uncovered} if rows or uncovered!='0' else None,
            'principal':principal,'blocked':blocked}


def forward_offered(options):
    forward=options.get('forward')
    return bool(forward) and forward.get('uncovered')=='0' and bool(forward.get('first'))


def chosen_purpose(options,choice):
    """{'kind':'forward'|'principal'|'split','loan':n,'amount':text} -> the plan purpose, or None when not offered."""
    principal=options.get('principal') or []
    if choice['kind']=='forward':
        return {'forward':True,'principal':[],'loans':None} if forward_offered(options) else None
    index=choice.get('loan')
    if index is None:
        if len(principal)!=1:return None
        index=1
    if not 1<=index<=len(principal):return None
    option=principal[index-1]
    if choice['kind']=='principal':
        return {'forward':False,'principal':[{'loanId':option['loanId'],'amount':option['amount']}],'loans':None}
    amount=choice.get('amount')
    if not forward_offered(options) or len(principal)!=1 or not isinstance(amount,str) or not amount.isdecimal() \
            or amount.startswith('0') or int(amount)>=int(option['amount']):return None
    return {'forward':True,'principal':[{'loanId':option['loanId'],'amount':amount}],'loans':None}


def chosen_plan(config,proposal,purpose):
    """The server's plan for the chosen purpose now (the command must equal it); refuses a plan that leaves money
    uncovered, settles a loan or drops a requested principal."""
    receipt=proposal['receipt']
    read=pay_forward_plan(config,proposal['borrower']['id'],str(int(Decimal(receipt['amount']))),receipt['date'],purpose)
    if read.get('uncovered')!='0' or read.get('settles') or len(read.get('principal') or [])!=len(purpose['principal']) \
            or not read.get('allocations'):raise ReceiptInvalid('PAY_FORWARD_PLAN_CHANGED')
    return read


def plan(receipt,borrower,current,today=None,config=None):
    today=today or datetime.now(BANGKOK).date().isoformat()
    amount=Decimal(receipt['amount'])
    if amount!=amount.to_integral_value():raise ReceiptInvalid('WHOLE_BAHT_REQUIRED')
    if any(Decimal(c['principal'])<0 or Decimal(c['interest'])<0 or Decimal(c.get('late') or 0)<0 for c in current['charges']):
        raise ReceiptInvalid('BALANCES_REQUIRE_RECONCILIATION')
    due=sum((owed(c) for c in current['charges'] if c['date']<=receipt['date']),Decimal(0))
    dated=[c for c in current['charges'] if c['date']<=receipt['date'] and owed(c)>0]
    latest_day=max((c['date'] for c in dated),default=None)
    current_amount=sum((owed(c) for c in dated if c['date']==latest_day),Decimal(0))
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
            # R118: the Loan Close payoff includes every unpaid late charge of the loan.
            total=Decimal(loan['principal'])+sum((Decimal(c['interest'])+Decimal(c.get('late') or 0) for c in charges),Decimal(0))+missing_interest
            if total==amount and receipt['date']==today and Decimal(loan['principal'])>0:closures.append(loan['id'])
        if len(closures)>1:raise ReceiptInvalid('LOAN_CLOSE_AMBIGUOUS')
        if closures:action='Loan Close';loan_id=closures[0]
        else:action='Overpayment review';loan_id=None
    relevant={c['loan'] for c in dated}
    loan_keys=[l['loan_key'] for l in current['loans'] if l.get('loan_key') and (l['id']==loan_id if loan_id else l['id'] in relevant)]
    proposal={'receipt':receipt,'borrower':borrower,'action':action,'loan_id':loan_id,'loan_keys':loan_keys,'facts':current,'planned_on':today}
    # R112: with the switch on, a slip of today above what is due asks which use of the remainder to post.
    if action=='Overpayment review' and options_enabled(config) and receipt['date']==today:
        choices=pay_forward_options(config,receipt,borrower['id'],current,today)
        if choices:
            proposal.update(action=OPTIONS,options=choices)
            return proposal
    if action=='Overpayment review':proposal['approved_allocation_method']='Lump Sum'
    return proposal


def review_posts_overpayment(proposal):
    # Earlier requests explicitly promised manual handling; do not reinterpret their replies.
    return proposal.get('action')=='Overpayment review' and proposal.get('approved_allocation_method')=='Lump Sum'
