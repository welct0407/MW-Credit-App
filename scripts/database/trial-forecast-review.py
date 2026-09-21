"""Read-only local forecast experiment. Private snapshot in, private results out.

No database connection, training, historical collection-rate assumptions or writes.
Amounts use Decimal; existing charges take precedence over generated projections.
"""
import calendar
import json
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR
from pathlib import Path

ROOT = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/forecast-review-20260921')
ZERO = Decimal(0)
ACTIVE = 'ยังไม่ปิดยอด'
DAILY = 'ดอกเบี้ยรายวัน'
FIXED = 'กำหนดวันชำระ'
INSTALLMENT = 'ผ่อนชำระรายวัน'

def num(x):
    return ZERO if x is None else Decimal(str(x))

def day(x):
    return date.fromisoformat(x) if x else None

def cents(x):
    return x.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)

def run_loan(loan, charges, asof, end):
    """Mirror generator eligibility/interval arithmetic without posting anything.

    Explicit future charges are authoritative for all types, including disabled
    plans. No automatic projection for closed/defaulted/fully repaid loans.
    Future scheduled principal payments are assumed paid on the stated date.
    """
    existing = defaultdict(list)
    for c in charges:
        if c['date']:
            existing[day(c['date'])].append(c)
    generated = []
    issues = []
    start, due = day(loan['start']), day(loan['due'])
    anchor = day(loan['anchor']) or start
    interval = loan['interval'] or 0
    eligible = loan['status'] == ACTIVE and not loan['defaulted']
    balance = max(ZERO, num(loan['outstanding']))
    if eligible and loan['auto'] and balance > 0:
        if not start:
            issues.append('Missing loan date; automatic projection withheld')
        if loan['kind'] in (DAILY, INSTALLMENT) and interval < 1:
            issues.append('Invalid interest interval; automatic projection withheld')
        if loan['kind'] in (FIXED, INSTALLMENT) and (not due or not start or due < start):
            issues.append('Invalid contractual dates; automatic projection withheld')
            eligible = False
    known_dates = list(existing)
    for offset in range((end-asof).days+1):
        d = asof+timedelta(days=offset)
        if d in existing:
            # Today's posted principal is already reflected in outstanding.
            if d > asof:
                balance -= sum((max(ZERO,num(c['principal_remaining'])) for c in existing[d]), ZERO)
            continue
        if not eligible or not loan['auto'] or balance <= 0 or not start or d < start:
            continue
        interest, principal = ZERO, ZERO
        if loan['kind'] == DAILY:
            if num(loan['daily']) <= 0 or interval < 1 or not anchor or d <= anchor or (d-anchor).days % interval:
                continue
            prior = max((x for x in known_dates if x <= d), default=start)
            interest = num(loan['daily'])*max(0,(d-prior).days)
        elif loan['kind'] == FIXED:
            if d != due:
                continue
            interest, principal = num(loan['fixed']), balance
        elif loan['kind'] == INSTALLMENT:
            if not due or d <= start or d > due or interval < 1:
                continue
            if (d-start).days % interval and d != due:
                continue
            prior = max(known_dates, default=None)
            if prior is None:
                issues.append('Installment missing initial charge; projection withheld')
                continue
            elapsed = (d-prior).days
            if elapsed <= 0:
                issues.append('Future installment charge suppresses earlier missing date; review schedule')
                continue
            term = (due-start).days+1
            base = (num(loan['principal'])/term).to_integral_value(rounding=ROUND_FLOOR)
            remainder = num(loan['principal']) % term
            principal = base*elapsed+max(ZERO,min(Decimal((d-start).days+1),remainder)-Decimal((prior-start).days+1))
            interest = num(loan['payment'])*elapsed-principal
        else:
            issues.append('Unknown loan type; projection withheld')
            continue
        if interest < 0 or principal < 0:
            issues.append('Invalid negative schedule component; projection withheld')
            continue
        if interest or principal:
            generated.append({'date':d.isoformat(),'interest':cents(interest),'principal':cents(principal)})
            known_dates.append(d)
            balance -= principal
    posted_future = sum((max(ZERO,num(c['remaining'])) for c in charges if c['date'] and asof < day(c['date']) <= end),ZERO)
    generated_future = sum((g['interest'] for g in generated if day(g['date']) > asof),ZERO)
    missing_today = sum((g['interest'] for g in generated if day(g['date']) == asof),ZERO)
    today_due = sum((max(ZERO,num(c['interest'])) for c in existing[asof]),ZERO)+missing_today
    arrears = sum((max(ZERO,num(c['remaining'])) for c in charges if c['date'] and day(c['date']) <= asof),ZERO)
    return dict(posted_future=posted_future,generated_future=generated_future,missing_today=missing_today,
                forecast=posted_future+generated_future+missing_today,today_due=today_due,arrears=arrears,
                generated=generated,issues=sorted(set(issues)))

def trial(snapshot):
    asof = day(snapshot['asof'])
    end = asof.replace(day=calendar.monthrange(asof.year,asof.month)[1])
    byloan = defaultdict(list)
    for c in snapshot['charges']:
        byloan[c['loan']].append(c)
    result=[]
    for l in snapshot['loans']:
        r=run_loan(l,byloan[l['id']],asof,end)
        result.append(dict(id=l['id'],label=l['label'],kind=l['kind'],auto=l['auto'],interval=l['interval'],
                           old_daily=num(l['old_daily']),old_forecast=num(l['old_forecast']),**r))
    totals={k:sum((r[k] for r in result),ZERO) for k in ['forecast','posted_future','generated_future','missing_today','today_due','arrears','old_daily','old_forecast']}
    totals['daily_average_remaining']=((totals['posted_future']+totals['generated_future'])/(end-asof).days) if end>asof else None
    totals['projected_month_interest']=num(snapshot['before']['Realized Profit MTD'])+totals['arrears']+totals['forecast']
    assert cents(totals['old_daily'])==cents(num(snapshot['before']['Expected Daily Interest']))
    assert cents(totals['old_forecast'])==cents(num(snapshot['before']['Forecast Remaining Interest']))
    assert cents(totals['arrears'])==cents(num(snapshot['before']["Today's Outstanding Interest"]))
    return dict(asof=str(asof),end=str(end),captured=snapshot['captured'],before=snapshot['before'],after=totals,loans=result)

def encode(obj):
    if isinstance(obj,Decimal):return float(obj)
    raise TypeError(type(obj))

if __name__=='__main__':
    for env in ['production','development']:
        snapshot=json.loads((ROOT/f'{env}.json').read_text(encoding='utf-8-sig'),parse_float=Decimal)
        result=trial(snapshot)
        (ROOT/f'{env}-trial.json').write_text(json.dumps(result,default=encode,indent=2),encoding='utf-8')
        print(json.dumps(dict(environment=env,asof=result['asof'],before=result['before'],after=result['after'],
            diagnostics={'loans':len(result['loans']),'issues':sum(bool(r['issues']) for r in result['loans'])}),default=encode))
