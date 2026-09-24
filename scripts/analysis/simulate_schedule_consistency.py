"""Read-only schedule-concession simulation; identifiable artifacts stay outside Git.

No generation functions are invoked. Expected amounts are a counterfactual using
current setup, not a reconstruction of immutable original terms or amounts owed.
"""
import argparse
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[2]
D = Decimal


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, default=str, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def capture():
    sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/python-deps'))
    import psycopg
    from psycopg.rows import dict_row
    target = json.loads((REPO / 'database/environments.json').read_text())['production']
    assert (target['instance'], target['host'], target['database']) == (
        'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_prod')
    with psycopg.connect(host=target['host'], dbname=target['database'], user=target['user'],
                        password=Path(target['passwordFile']).read_text().strip(), sslmode='require',
                        row_factory=dict_row,
                        options='-c default_transaction_read_only=on -c statement_timeout=30000') as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        identity = conn.execute("""select current_database() database,host(inet_server_addr()) host,
            current_setting('transaction_read_only') read_only,public.olap_reporting_date() reporting_date,
            statement_timestamp() captured_at""").fetchone()
        assert identity['database'] == target['database'] and identity['host'] == target['host']
        assert identity['read_only'] == 'on'
        borrowers = conn.execute('''select b."Description" name,m.borrower_id,m.quadrant,
            m.relative_contribution,m.reliability_score,m.confidence,h.recent_obligation_count,
            h.recent_on_time_count,h.current_health_status,h.oldest_unpaid_days
            from public.reporting_borrower_matrix_v2 m join public.olap_borrowers_analytics b
            on b."Row ID"=m.borrower_id join public.reporting_borrower_payment_health_v1 h using(borrower_id)
            order by b."Description"''').fetchall()
        loans = conn.execute('''select l."Row ID" loan_id,l."Ref Borrowers" borrower_id,
            l."Loan Type" kind,l."Loan Date" start,l."Close Date" close,l."Due Date" due,
            l."Interest Schedule Anchor Date" anchor,l."Interest Payment Interval" interval,
            l."Current Daily Interest"::numeric daily_interest,l."Transfer Fee"::numeric transfer_fee,
            l."Auto Charge Enabled" auto,l."Outstanding Principal"::numeric outstanding,
            l."Defaulted" defaulted
            from public."Loans" l join public.reporting_borrower_matrix_v2 m on m.borrower_id=l."Ref Borrowers"
            where l."Loan Status"='ยังไม่ปิดยอด' and l."Loan Date"<=public.olap_reporting_date()
            and (l."Close Date" is null or l."Close Date">public.olap_reporting_date())
            order by l."Ref Borrowers",l."Loan Date",l."Row ID"''').fetchall()
        loan_ids = [r['loan_id'] for r in loans]
        charges = conn.execute('''select "Ref Loans" loan_id,"Charge Date" due_date,
            sum("Interest Due"::numeric) interest,sum("Principal Due"::numeric) principal,
            count(*) rows from public."Charges" where "Ref Loans"=any(%s)
            and "Charge Date"<public.olap_reporting_date() group by 1,2 order by 1,2''', (loan_ids,)).fetchall()
        definitions = conn.execute("""select proname,pg_get_functiondef(oid) definition from pg_proc
            where pronamespace='public'::regnamespace
            and proname in ('generate_loan_charge','create_first_day_charge') order by proname""").fetchall()
        crosscheck = conn.execute('''select coalesce(sum("Interest Due"::numeric),0) interest,
            coalesce(sum("Principal Due"::numeric),0) principal,count(*) charge_rows
            from public."Charges" where "Ref Loans"=any(%s)
            and "Charge Date">=public.olap_reporting_date()-30
            and "Charge Date"<public.olap_reporting_date()''', (loan_ids,)).fetchone()
        # Future entries are descriptive plan evidence only. Auto-enabled loans
        # normally generate later, so their absent future rows are not failures.
        future = conn.execute('''select b."Description" name,c."Charge Date" due_date,
            sum(c."Principal Due"::numeric) principal,sum(c."Interest Due"::numeric) interest,count(*) charge_rows
            from public."Charges" c join public."Loans" l on l."Row ID"=c."Ref Loans"
            join public.olap_borrowers_analytics b on b."Row ID"=l."Ref Borrowers"
            where l."Row ID"=any(%s) and not coalesce(l."Auto Charge Enabled",false)
            and c."Charge Date">=public.olap_reporting_date() and c."Charge Date"<public.olap_reporting_date()+90
            group by 1,2 order by 1,2''', (loan_ids,)).fetchall()
        return dict(identity=identity, borrowers=borrowers, loans=loans, charges=charges,
                    definitions=definitions, crosscheck=crosscheck, future_charge_dates=future)


def expected_schedule(loan, end, charge_rows=(), anchor_aware=True):
    """Regular ideal schedule; deliberately ignores auto=False and actual gaps."""
    start = date.fromisoformat(loan['start'])
    anchor = date.fromisoformat(loan['anchor'] or loan['start'])
    rate = D(loan['daily_interest'])
    interval = loan['interval']
    assert loan['kind'] == 'ดอกเบี้ยรายวัน', 'Unsupported loan type: no untested approximation'
    assert interval and interval > 0 and rate > 0 and anchor >= start
    assert not loan['defaulted'], 'Default accounting needs separate treatment'
    # An explicit later anchor is a schedule transition, not proof that the
    # current interval held since origination. Censor earlier history. Mirror
    # generation's accrual baseline using the latest recorded pre-anchor date.
    transition = anchor_aware and anchor > start
    compare_from = anchor + timedelta(days=1) if transition else start
    result = {start: rate} if start < end and not transition else {}
    previous = max((date.fromisoformat(r['due_date']) for r in charge_rows
                    if date.fromisoformat(r['due_date']) <= anchor), default=start) if transition else start
    day = anchor + timedelta(days=interval)
    while day < end:
        result[day] = rate * (day - previous).days
        previous = day
        day += timedelta(days=interval)
    return result, compare_from


def simulate(snapshot, anchor_aware=True):
    for name, filename in [('generate_loan_charge','V8__common_charge_generation.sql'),
                           ('create_first_day_charge','V6__core_payment_transaction.sql')]:
        source=(REPO/'database/migrations'/filename).read_text(encoding='utf-8')
        body=source.split('CREATE FUNCTION public.'+name+'(',1)[1].split('AS $$',1)[1].split('$$;',1)[0]
        live=next(f['definition'] for f in snapshot['definitions'] if f['proname']==name)
        assert body.strip()==live.split('$function$',2)[1].strip(), 'Charging rules changed; review simulation before reuse'
    end = date.fromisoformat(snapshot['identity']['reporting_date'])
    charges = defaultdict(list)
    for row in snapshot['charges']:
        charges[row['loan_id']].append(row)
    windows = [7, 14, 30, 60, 90]
    per_loan = []
    for loan in snapshot['loans']:
        schedule, compare_from = expected_schedule(loan, end, charges[loan['loan_id']], anchor_aware)
        actual = {}
        for row in charges[loan['loan_id']]:
            amount = D(row['interest'])
            assert amount >= 0 and D(row['principal']) >= 0
            if row['due_date'] == loan['start']:
                amount -= D(loan['transfer_fee'] or '0')
            assert amount >= 0, 'First-day fee not represented in recorded interest'
            actual[date.fromisoformat(row['due_date'])] = amount
        metrics = {}
        for days in windows:
            start = max(end - timedelta(days=days), compare_from)
            exp = {dt: value for dt, value in schedule.items() if start <= dt < end}
            act = {dt: value for dt, value in actual.items() if start <= dt < end}
            expected = sum(exp.values(), D(0))
            recorded = sum(act.values(), D(0))
            exp_dates = {dt for dt, value in exp.items() if value > 0}
            act_dates = {dt for dt, value in act.items() if value > 0}
            metrics[str(days)] = dict(expected=expected, recorded=recorded,
                coverage=recorded / expected if expected else None,
                deficit=max(expected - recorded, D(0)), elapsed_days=max(0,(end-start).days),
                expected_dates=len(exp_dates), actual_dates=len(act_dates),
                matching_dates=len(exp_dates & act_dates), off_schedule_dates=len(act_dates-exp_dates),
                actual_principal=sum((D(r['principal']) for r in charges[loan['loan_id']]
                                      if start <= date.fromisoformat(r['due_date']) < end), D(0)))
        per_loan.append(dict(**loan, comparison_start=compare_from,
                            latest_recorded_charge=max(actual, default=None), metrics=metrics))
    per_borrower = []
    for borrower in snapshot['borrowers']:
        loans = [l for l in per_loan if l['borrower_id'] == borrower['borrower_id']]
        assert loans, 'Matrix borrower without an active dated loan'
        metrics = {}
        for days in windows:
            subset = [l['metrics'][str(days)] for l in loans]
            totals = {k: sum((m[k] for m in subset), D(0)) for k in
                      ('expected','recorded','deficit','expected_dates','actual_dates','matching_dates','off_schedule_dates','actual_principal')}
            totals['coverage'] = totals['recorded'] / totals['expected'] if totals['expected'] else None
            metrics[str(days)] = totals
        per_borrower.append(dict(**borrower, loans=len(loans), auto_off_loans=sum(not l['auto'] for l in loans),
                                 outstanding=sum((D(l['outstanding']) for l in loans), D(0)), metrics=metrics))
    sensitivity = []
    for window in (7,14,30):
        for threshold in (D('.7'),D('.8'),D('.9')):
            flags = set()
            off_flags = set()
            for loan in per_loan:
                m = loan['metrics'][str(window)]
                # Minimum seven elapsed days and two contractual due dates.
                if m['elapsed_days'] >= 7 and m['expected_dates'] >= 2 and m['coverage'] < threshold:
                    flags.add(loan['borrower_id'])
                    if not loan['auto']:
                        off_flags.add(loan['borrower_id'])
            def categories(ids):
                return dict(Counter(('Question Mark' if D(b['relative_contribution']) >= 1 else 'Dog')
                    if b['borrower_id'] in ids and b['quadrant'] in ('Star','Cash Cow') else b['quadrant']
                    for b in per_borrower))
            sensitivity.append(dict(window=window, threshold=threshold,
                schedule_flags=[b['name'] for b in per_borrower if b['borrower_id'] in flags],
                combined_flags=[b['name'] for b in per_borrower if b['borrower_id'] in off_flags],
                schedule_categories=categories(flags),combined_categories=categories(off_flags)))
    # Reconcile captured, grouped input independently with SQL totals.
    charge_window = [r for r in snapshot['charges'] if end-timedelta(days=30) <= date.fromisoformat(r['due_date']) < end]
    assert sum((D(r['interest']) for r in charge_window), D(0)) == D(snapshot['crosscheck']['interest'])
    assert sum((D(r['principal']) for r in charge_window), D(0)) == D(snapshot['crosscheck']['principal'])
    assert sum(r['rows'] for r in charge_window) == snapshot['crosscheck']['charge_rows']
    assert sum(b['loans'] for b in per_borrower) == len(per_loan)
    return dict(identity=snapshot['identity'], anchor_aware=anchor_aware,
                baseline=dict(Counter(b['quadrant'] for b in per_borrower)),
                borrowers=per_borrower, loans=per_loan, sensitivity=sensitivity,
                checks=['Source identity/read-only transaction','Active cohort coverage',
                        'Captured live charging function bodies match V6/V8 source',
                        'Supported positive daily-interest setups','SQL interest/principal/count reconciliation'])


def self_test():
    # Meaningful boundary cases: due-date cadence, anchor transition, and fees
    # are independent of the observed population's desired classification.
    loan = dict(start='2026-09-01',anchor=None,kind='ดอกเบี้ยรายวัน',interval=3,
                daily_interest='100',defaulted=False)
    schedule, start = expected_schedule(loan,date(2026,9,8))
    assert schedule == {date(2026,9,1):D(100), date(2026,9,4):D(300), date(2026,9,7):D(300)}
    # Due today excluded, and interest between scheduled dates is not overdue.
    schedule, _ = expected_schedule(loan,date(2026,9,7))
    assert sum(schedule.values()) == 400
    loan['anchor'] = '2026-09-05'
    schedule, start = expected_schedule(loan,date(2026,9,12),[{'due_date':'2026-09-05'}])
    assert start == date(2026,9,6) and schedule == {date(2026,9,8):D(300),date(2026,9,11):D(300)}
    # Anchor doesn't reset accrual: a pre-anchor baseline on Sep 4 -> four days.
    schedule, _ = expected_schedule(loan,date(2026,9,9),[{'due_date':'2026-09-04'}])
    assert schedule == {date(2026,9,8):D(400)}
    return 'Four synthetic schedule/cutoff/accrual boundary checks passed'


def write_report(private, result, future, confirmed_names):
    def pct(x):
        return 'N/A' if x is None else f'{D(x)*100:.1f}%'
    def money(x):
        return f'{D(x):,.2f}'
    def category(b):
        return ('Question Mark' if D(b['relative_contribution']) >= 1 else 'Dog') if b['quadrant'] in ('Star','Cash Cow') else b['quadrant']
    candidate = next(s for s in result['sensitivity'] if s['window']==30 and s['threshold']==D('.8'))
    flagged = set(candidate['combined_flags'])
    confirmed = set(confirmed_names)
    assert confirmed <= {b['name'] for b in result['borrowers']}
    confirmed_distribution = dict(Counter(category(b) if b['name'] in confirmed else b['quadrant'] for b in result['borrowers']))
    result['confirmed_label_scenario'] = dict(names=sorted(confirmed), categories=confirmed_distribution,
        source='Owner statement in conversation; simulation labels only, no database classification or permanent name rules')
    rows = [
        '# Schedule consistency simulation — owner review', '',
        f"Snapshot: **{result['identity']['captured_at']} UTC; reporting date {result['identity']['reporting_date']} Bangkok**.",
        f"{len(result['borrowers'])} active borrowers / {len(result['loans'])} active daily-interest loans. Production was accessed in a repeatable-read, read-only transaction. No DB, AppSheet or Metabase changes.", '',
        '## Main conclusion', '',
        f'The combined signal identifies {len(flagged)} candidates, including {len(flagged & confirmed)} owner-confirmed settlement cases. This detects departures from normal terms; it does not establish that every difference is an interest waiver or financial distress.', '',
        '## Method', '',
        '- Counterfactual regular interest schedule from current daily interest, loan date, payment interval and schedule anchor. Auto-off is deliberately ignored in expected interest; otherwise expected obligations would disappear exactly for the cases being tested.',
        '- Compare actual interest charged with expected interest due on completed dates. Principal charged is shown separately, not counted as interest. First-day transfer fees are excluded from both sides.',
        f"- Window: {date.fromisoformat(result['identity']['reporting_date'])-timedelta(days=30)} through {date.fromisoformat(result['identity']['reporting_date'])-timedelta(days=1)}, clipped to each loan start and supported post-anchor history. Today excluded; no synthetic arrears are booked.",
        '- Later explicit anchors: exclude history through the anchor and initialize subsequent accrual from the last recorded charge at/before that anchor. Earlier current-interval history cannot be assumed.',
        '- Loan-level candidate: at least seven completed observation days, at least two expected due dates, actual/expected interest below 80%. Combined candidate also requires auto-generation disabled. Any qualifying active loan flags its borrower; loan amounts do not cancel one another out.',
        '- Borrower percentages below aggregate eligible-window amounts across active loans. These may differ from the individual loan ratio that triggers the flag.',
        '- Keep the existing payment score and contribution fixed to isolate this new signal. In the what-if only, flagged Star/Cash Cow cases move to Question Mark for contribution >=1x, otherwise Dog. Existing lower categories remain unchanged.',
        '- Future planned charges are descriptive evidence of deferral/restructuring. Their absence on ordinary auto-enabled loans is not a failure.', '',
        '## Distribution scenarios', '',
        '| Scenario | Star | Cash Cow | Question Mark | Dog |', '|---|---:|---:|---:|---:|']
    for label, distribution in [('Current captured model',result['baseline']),('Only owner-confirmed settlement cases',confirmed_distribution),('All combined candidates (unconfirmed what-if)',candidate['combined_categories'])]:
        rows.append('| '+label+' | '+' | '.join(str(distribution.get(k,0)) for k in ('Star','Cash Cow','Question Mark','Dog'))+' |')
    rows += ['', 'The third scenario is not a recommendation to downgrade unconfirmed cases without review. No target quadrant percentages were imposed.', '',
        '## All borrower results', '',
        '| Borrower | Current | Score | Loans/off | Expected interest THB | Recorded interest THB | 30d coverage | 14d | 7d | Interpretation | What-if |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|']
    for b in result['borrowers']:
        m=b['metrics']['30']
        eligible=any(l['metrics']['30']['elapsed_days']>=7 and l['metrics']['30']['expected_dates']>=2 for l in result['loans'] if l['borrower_id']==b['borrower_id'])
        meaning='Owner-confirmed settlement' if b['name'] in confirmed else 'Schedule review candidate' if b['name'] in flagged else 'Insufficient observation' if not eligible else 'No combined flag'
        rows.append(f"| {b['name']} | {b['quadrant']} | {D(b['reliability_score']):.2f} | {b['loans']}/{b['auto_off_loans']} | {money(m['expected'])} | {money(m['recorded'])} | {pct(m['coverage'])} | {pct(b['metrics']['14']['coverage'])} | {pct(b['metrics']['7']['coverage'])} | {meaning} | {category(b) if b['name'] in flagged else b['quadrant']} |")
    rows += ['', '“No combined flag” is not a certification of normal terms. Coverage above 100% may reflect changed rates, catch-up charges or manual adjustments, not superior reliability.', '',
        '## Candidate detail', '',
        '| Borrower | Latest matured recorded charge | Latest 7d principal charged | Latest 7d interest charged | Auto-off loans |',
        '|---|---|---:|---:|---:|']
    for b in result['borrowers']:
        if b['name'] in flagged:
            last=max(l['latest_recorded_charge'] for l in result['loans'] if l['borrower_id']==b['borrower_id'])
            rows.append(f"| {b['name']} | {last} | {money(b['metrics']['7']['actual_principal'])} | {money(b['metrics']['7']['recorded'])} | {b['auto_off_loans']} |")
    rows += ['', '### Loaded future plan (separate read-only follow-up)', '',
        '| Borrower | Due date | Principal THB | Interest THB | Total THB |', '|---|---|---:|---:|---:|']
    for f in future['future_charge_dates']:
        rows.append(f"| {f['name']} | {f['due_date']} | {money(f['principal'])} | {money(f['interest'])} | {money(D(f['principal'])+D(f['interest']))} |")
    rows += ['', f"Future-plan evidence captured: {future['identity']['captured_at']}.", '',
        '## Sensitivity', '',
        '| Window | Coverage threshold | Schedule-only candidates | Auto-off + schedule candidates |', '|---|---:|---|---|']
    for s in result['sensitivity']:
        rows.append(f"| {s['window']}d | <{pct(s['threshold'])} | {', '.join(s['schedule_flags'])} | {', '.join(s['combined_flags'])} |")
    rows += ['', '## Interpretation and limitations', '',
        '- Owner-confirmed labels are supplied separately. Unconfirmed candidates are not ground truth; precision and false-positive rate require a reviewed negative set.',
        '- Compare auto-off alone with the combined rule before claiming added predictive accuracy. Amount/date comparisons can add explanation even when they identify the same borrowers.',
        '- Current setup is available; immutable original rate/interval history is not established here. Changed daily rates without a recorded transition may distort historical ratios.',
        '- The numerator is obligations charged, not cash paid. A low ratio is not additional collectible debt, a financial loss or an instruction to restore charges.',
        '- Deferral, interest concession, principal recovery and payment compliance must remain separate. Use a review/status gate for upper categories rather than multiplying the punctuality score by charge coverage.',
        '- Only daily-interest products were present and supported. No claim is made for installment/fixed-due products, historical defaults or closed-loan portfolios.',
        '- New/limited histories can still be Stars/Cash Cows under the unchanged base model. This simulation does not correct the separate confidence/weighting concern.',
        '- Snapshot numbers differ from earlier delivered screenshots because the reporting day/window and live financial records can change.', '',
        '## Verification', '', *['- '+check for check in result['checks']],
        f"- Snapshot SHA-256: `{result['snapshot_sha256']}`", '',
        'Live charging function definitions were captured for comparison with V6/V8. No charging or other mutating function was invoked. Borrower-identifiable evidence is retained in the private task folder, outside Git.']
    notes=private/'REVIEW_NOTES.md'
    if notes.exists():
        rows += ['', notes.read_text(encoding='utf-8')]
    (private/'REPORT.md').write_text('\n'.join(rows)+'\n',encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-directory', type=Path, required=True)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--confirmed-names', nargs='*', default=[])
    args = parser.parse_args()
    private = args.private_directory.resolve()
    allowed = Path('C:/Users/MWCredit/Documents/ChatGPT').resolve()
    assert private.is_relative_to(allowed), 'Identifiable data must remain in external private storage'
    source = private / 'snapshot.json'
    if args.capture:
        assert not source.exists(), 'Preserve original snapshot; choose a new directory'
        dump(source, capture())
    snapshot = json.loads(source.read_text(encoding='utf-8'))
    result = simulate(snapshot)
    naive = simulate(snapshot, anchor_aware=False)
    result['naive_sensitivity'] = naive['sensitivity']
    result['checks'].append(self_test())
    result['snapshot_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    future_path=private/'future-plans.json'
    future=json.loads(future_path.read_text(encoding='utf-8')) if future_path.exists() else dict(identity=snapshot['identity'],future_charge_dates=snapshot.get('future_charge_dates',[]))
    write_report(private,result,future,args.confirmed_names)
    dump(private / 'results.json', result)
    print(json.dumps(dict(identity=result['identity'], baseline=result['baseline'],
                         borrowers=len(result['borrowers']),loans=len(result['loans']),
                         confirmed_scenario=result['confirmed_label_scenario']['categories'],
                         checks=result['checks'],report=str(private/'REPORT.md')), default=str, ensure_ascii=False))


if __name__ == '__main__':
    main()
