"""Synthetic boundary tests; no real borrower data or financial writes."""
import importlib.util
from pathlib import Path
from datetime import date
from decimal import Decimal as D

spec=importlib.util.spec_from_file_location('trial',Path(__file__).with_name('trial-forecast-review.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
count=0
def loan(**changes):
    l=dict(start='2026-09-01',due=None,anchor=None,interval=1,status=m.ACTIVE,defaulted=False,
           outstanding=1000,auto=True,kind=m.DAILY,daily=10,fixed=100,payment=200,principal=1000)
    return dict(l,**changes)
def charge(d,interest=10,remaining=None,principal=0):
    return dict(date=d,interest=interest,remaining=interest if remaining is None else remaining,principal_remaining=principal)
def run(l,cs=(),asof='2026-09-21',end='2026-09-30'):
    return m.run_loan(l,list(cs),date.fromisoformat(asof),date.fromisoformat(end))
def check(name,actual,expected):
    global count
    assert actual==expected,(name,actual,expected)
    count+=1

check('daily normal',run(loan(),[charge('2026-09-21')])['forecast'],D(90))
check('three-day last date Sep28',run(loan(interval=3),[charge('2026-09-19')])['forecast'],D(90))
check('anchor change',run(loan(interval=5,anchor='2026-09-22'),[charge('2026-09-21')])['forecast'],D(60))
check('manual ignores nominal rate',run(loan(auto=False,daily=999),[charge('2026-09-25',80)])['forecast'],D(80))
check('future partial paid',run(loan(auto=False),[charge('2026-09-25',80,30)])['forecast'],D(30))
check('future fully paid',run(loan(auto=False),[charge('2026-09-25',80,0)])['forecast'],D(0))
check('manual beyond month excluded',run(loan(auto=False),[charge('2026-10-01',80)])['forecast'],D(0))
check('existing future prevents duplicate and resets accrual',run(loan(interval=3),[charge('2026-09-19'),charge('2026-09-22',30,20)])['forecast'],D(80))
check('fixed due',run(loan(kind=m.FIXED,due='2026-09-25'))['forecast'],D(100))
check('fixed already loaded partial',run(loan(kind=m.FIXED,due='2026-09-25'),[charge('2026-09-25',100,40)])['forecast'],D(40))
check('fixed overdue not reinvented',run(loan(kind=m.FIXED,due='2026-09-10'))['forecast'],D(0))
check('closed no new income',run(loan(status='ปิดยอดแล้ว'))['forecast'],D(0))
check('default no new income',run(loan(defaulted=True))['forecast'],D(0))
check('fully repaid no new income',run(loan(outstanding=0))['forecast'],D(0))
check('future start interval',run(loan(start='2026-09-28'))['forecast'],D(20))
check('principal payoff stops future generation',run(loan(),[charge('2026-09-21'),charge('2026-09-25',40,40,1000)])['forecast'],D(70))
# 3-day loan: principal 100 apportions 34,33,33; day one already posted.
check('installment rounding + final remainder',run(loan(kind=m.INSTALLMENT,start='2026-09-21',due='2026-09-23',principal=100,outstanding=66,payment=40),[charge('2026-09-21',6)])['forecast'],D(14))
check('installment forced final interval',run(loan(kind=m.INSTALLMENT,start='2026-09-21',due='2026-09-23',principal=100,outstanding=66,payment=40,interval=5),[charge('2026-09-21',6)])['forecast'],D(14))
check('installment no seed guarded',bool(run(loan(kind=m.INSTALLMENT,start='2026-09-20',due='2026-09-23',principal=100,payment=40))['issues']),True)
check('zero-rate existing charge retained',run(loan(daily=0),[charge('2026-09-25',12)])['forecast'],D(12))
check('missing today separate',run(loan(),[charge('2026-09-20')])['missing_today'],D(10))
check('month-end no divide by zero period',run(loan(),[charge('2026-09-30')],asof='2026-09-30')['forecast'],D(0))
check('invalid interval diagnostic',bool(run(loan(interval=0))['issues']),True)
check('invalid fixed dates diagnostic',bool(run(loan(kind=m.FIXED,due='2026-08-01'))['issues']),True)
check('installment future gap diagnostic',bool(run(loan(kind=m.INSTALLMENT,start='2026-09-20',due='2026-09-25'),[charge('2026-09-20'),charge('2026-09-24')])['issues']),True)
print(f'{count} synthetic forecast boundary tests passed')
