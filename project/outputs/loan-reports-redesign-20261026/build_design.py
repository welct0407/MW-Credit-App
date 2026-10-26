"""Loan Reports redesign — single specification for the proposed parallel dashboard.

Run from the repository root with bundled Python:
    python project/outputs/loan-reports-redesign-20261026/build_design.py
It rewrites layout.json (machine-readable, for the installer) and the generated card tables in DESIGN.md
(between the GENERATED markers). The specification below is the authority; edit it, not the outputs.

Card references: an integer is an existing saved question on dashboard 3 (reused as is, with a title override
where given); a string key is a new question defined in NEW_QUESTIONS; "text:..." and "heading:..." are
virtual cards; "iframe:matrix" is the custom BCG matrix dashcard, copied verbatim from live dashcard 1501.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GRID = 24

# ---------------------------------------------------------------------------------------------------------
# Dashboard-level definitions
# ---------------------------------------------------------------------------------------------------------
DASHBOARD = {
    'name': 'Loan Reports · proposed',
    'collection': {'name': 'Loan Reports · proposed', 'parent_collection_id': 5,
                   'description': 'Parallel redesign of Loan Reports (dashboard 3) for side-by-side review. '
                                  'Reuses the governed models and saved questions; new questions live here.'},
    'description': 'Parallel redesign of Loan Reports for owner review. Live PROD OLAP · THB · Bangkok dates. '
                   'Same models, snippets and saved questions as dashboard 3; diagnostics on the Data health tab.',
    'auto_apply_filters': True,
}

# New parameter id -> definition. `replaces` lists the dashboard-3 parameter ids whose card mappings the
# installer copies (same template tag or model dimension) when it places a reused card.
PARAMETERS = [
    {'id': 'period', 'name': 'Period', 'slug': 'period', 'type': 'date/all-options', 'default': 'past30days',
     'replaces': ['overview-trend-period', 'review-position-trend', 'review-performance', 'bp-period', 'bd-period']},
    {'id': 'statement-period', 'name': 'Statement period', 'slug': 'statement_period', 'type': 'date/all-options',
     'default': 'thismonth', 'replaces': ['review-income', 'review-flow', 'pt-period']},
    {'id': 'position-date', 'name': 'Date', 'slug': 'position_date', 'type': 'date/all-options', 'default': 'today',
     'replaces': ['review-position']},
    {'id': 'account', 'name': 'Account', 'slug': 'account', 'type': 'string/=', 'default': ['__ALL__'],
     'values_source': {'card_id': 199}, 'replaces': ['review-account']},
    {'id': 'population', 'name': 'Population', 'slug': 'population', 'type': 'string/=',
     'default': ['All with loan history'], 'values_source': 'copy', 'replaces': ['bp-population']},
    {'id': 'borrower', 'name': 'Borrower', 'slug': 'borrower', 'type': 'string/=', 'default': None,
     'values_source': {'card_id': 277}, 'replaces': ['bd-borrower']},
    {'id': 'scenario-amount', 'name': 'Scenario · additional principal', 'slug': 'scenario_amount',
     'type': 'number/=', 'default': [0], 'replaces': ['bd-amount']},
    {'id': 'collection-borrower', 'name': 'Collection · borrower', 'slug': 'collection_borrower', 'type': 'string/=',
     'default': None, 'values_source': {'card_id': 77}, 'replaces': ['collection-detail-borrower']},
    {'id': 'collection-status', 'name': 'Collection · status', 'slug': 'collection_status', 'type': 'string/=',
     'default': None, 'values_source': 'copy', 'replaces': ['collection-detail-status']},
    {'id': 'partner', 'name': 'Partner', 'slug': 'partner', 'type': 'string/=', 'default': None,
     'values_source': {'card_id': 324}, 'multi': True, 'replaces': ['pt-partner']},
    {'id': 'settlement-status', 'name': 'Settlement status', 'slug': 'settlement_status', 'type': 'string/=',
     'default': None, 'values_source': 'copy', 'replaces': ['pt-status']},
    {'id': 'scenario', 'name': 'Scenario', 'slug': 'scenario', 'type': 'string/=', 'default': ['Planning'],
     'values_source': 'copy', 'replaces': ['fp-scenario']},
    {'id': 'interest-collected', 'name': 'Interest collected %', 'slug': 'interest_collected', 'type': 'number/=',
     'default': [100], 'replaces': ['fp-ci']},
    {'id': 'principal-collected', 'name': 'Principal collected %', 'slug': 'principal_collected',
     'type': 'number/=', 'default': [100], 'replaces': ['fp-cp']},
    {'id': 'overdue-recovered', 'name': 'Overdue recovered %', 'slug': 'overdue_recovered', 'type': 'number/=',
     'default': [0], 'replaces': ['fp-rr']},
    {'id': 'loan-kind', 'name': 'Loan type', 'slug': 'loan_kind', 'type': 'string/=', 'default': ['All'],
     'values_source': 'copy', 'replaces': ['fp-kind']},
    {'id': 'target', 'name': 'Interest target ฿', 'slug': 'target', 'type': 'number/=', 'default': None,
     'replaces': ['fp-target']},
    {'id': 'plan-lending', 'name': 'Plan · new lending ฿', 'slug': 'plan_lending', 'type': 'number/=',
     'default': None, 'replaces': ['fp-lending']},
    {'id': 'plan-expenses', 'name': 'Plan · cash expenses ฿', 'slug': 'plan_expenses', 'type': 'number/=',
     'default': None, 'replaces': ['fp-expenses']},
    {'id': 'plan-withdrawals', 'name': 'Plan · payouts & withdrawals ฿', 'slug': 'plan_withdrawals',
     'type': 'number/=', 'default': None, 'replaces': ['fp-withdrawals']},
    {'id': 'plan-inflows', 'name': 'Plan · external inflows ฿', 'slug': 'plan_inflows', 'type': 'number/=',
     'default': None, 'replaces': ['fp-inflows']},
    {'id': 'plan-reserve', 'name': 'Plan · cash reserve ฿', 'slug': 'plan_reserve', 'type': 'number/=',
     'default': None, 'replaces': ['fp-reserve']},
]

FORECAST_PARAMS = ['scenario', 'interest-collected', 'principal-collected', 'overdue-recovered', 'loan-kind', 'target']
PLAN_PARAMS = FORECAST_PARAMS + ['plan-lending', 'plan-expenses', 'plan-withdrawals', 'plan-inflows', 'plan-reserve']

# ---------------------------------------------------------------------------------------------------------
# New questions (saved in the proposed collection). `basis` names the governed source; `definition` is the
# query intent the installer implements as MBQL on the model or as native SQL following the named pattern.
# ---------------------------------------------------------------------------------------------------------
NEW_QUESTIONS = {
    'today.principal-smart': {
        'name': 'Principal at work · change over the period', 'display': 'smartscalar',
        'basis': 'model 74 Daily Performance', 'params': ['period'],
        'definition': 'MBQL on model 74: Outstanding Principal (max) by Date, filtered by Period on Date. '
                      'Smart scalar shows the latest completed-day value and the change against the first '
                      'date in the period. Whole baht.',
        'settings': {'scalar.compact_primary_number': False, 'scalar.comparisons': [{'id': 'first', 'type': 'periodsAgo', 'value': 30}]},
    },
    'today.realization': {
        'name': 'Interest this month · share of projection', 'display': 'progress',
        'basis': 'model 73 Portfolio Overview', 'params': [],
        'definition': 'MBQL on model 73: field Forecast Realization (Realized Profit MTD ÷ Projected Monthly Profit). '
                      'Progress goal 1 shows the share of the projected month collected so far; the card description '
                      'names the projected amount source.',
        'settings': {'progress.goal': 1, 'progress.color': '#2a78d6'},
    },
    'today.collection-rate': {
        'name': 'Collected today · share of amount due', 'display': 'progress',
        'basis': 'model 73 Portfolio Overview', 'params': [],
        'definition': 'MBQL on model 73: field Amount Collection Rate Today (Amount Collected Today ÷ Amount Due Today). '
                      'Progress goal 1. Reused on Today and Collection.',
        'settings': {'progress.goal': 1, 'progress.color': '#067647'},
    },
    'cash.pool-selected': {
        'name': 'Total cash pool · selected date', 'display': 'scalar',
        'basis': 'snippet 4 Cash position source routing (models 205, 206, 164, 73)', 'params': ['position-date'],
        'definition': 'Native, same routing as question 207: today reads model 73 Total Cash Pool, a past date reads '
                      'model 205 Total Cash Pool for that date; blank when no snapshot exists.',
        'settings': {'scalar.field': 'Total Cash Pool'},
    },
    'cash.principal-selected': {
        'name': 'Principal outstanding · selected date', 'display': 'scalar',
        'basis': 'snippet 4 Cash position source routing (models 205, 73)', 'params': ['position-date'],
        'definition': 'Native, same routing as question 207, selecting Outstanding Principal.',
        'settings': {'scalar.field': 'Outstanding Principal'},
    },
    'income.vs-previous': {
        'name': 'This period and the previous period', 'display': 'table',
        'basis': 'snippet 2 Income statement period (model 186 Income Events)', 'params': ['statement-period'],
        'definition': 'Native: for the selected statement period and the immediately preceding period of equal length, '
                      'Income, Expenses, Net profit, Days and Net per day, plus change % of each. Two rows '
                      '(This period, Previous period) and one Change row. Whole baht, one-decimal percent.',
        'settings': {'table.column_formatting': 'change row: positive green, negative red'},
    },
    'income.monthly': {
        'name': 'Monthly income, expenses and net profit', 'display': 'bar',
        'basis': 'model 186 Income Events', 'params': [],
        'definition': 'MBQL on model 186: sum Income, sum Expenses and sum (Income − Expenses) by Date month, '
                      'filtered to the previous five complete months plus the current month. Current month is partial '
                      'and labelled "to date" in the card description.',
        'settings': {'graph.dimensions': ['Date'], 'graph.metrics': ['Income', 'Expenses', 'Net profit'], 'graph.show_values': True},
    },
    'cashflow.by-type-row': {
        'name': 'Cash movement by transaction type · chart', 'display': 'row',
        'basis': 'snippet 3 Cashflow statement period (same query as question 203)', 'params': ['statement-period', 'account'],
        'definition': 'Native: question 203\'s query unchanged, displayed as a horizontal bar of Money in and Money out '
                      'per transaction type. Question 203 stays the table beside it.',
        'settings': {'graph.dimensions': ['Transaction Type'], 'graph.metrics': ['Money In', 'Money Out']},
    },
    'perf.vs-previous': {
        'name': 'This period and the previous period', 'display': 'table',
        'basis': 'models 71 Repayment Ledger and 70 Loan Book (pattern of questions 217–219)', 'params': ['period'],
        'definition': 'Native: for the selected Period and the preceding period of equal length, Gross interest, '
                      'Principal issued, Loans issued and Principal returned, with change %. Same date rules as '
                      'questions 217–219 (loan dates and payment dates both use the filter).',
        'settings': {'table.column_formatting': 'change row: positive green, negative red'},
    },
    'partners.capital-share-row': {
        'name': 'Capital share · full pool', 'display': 'row',
        'basis': 'model 318 Partners · position source (same query as question 331)', 'params': ['partner'],
        'definition': 'Native: question 331\'s query unchanged, displayed as a horizontal bar with the share percent as '
                      'the value label. Replaces the two-slice pie.',
        'settings': {'graph.show_values': True},
    },
}

# ---------------------------------------------------------------------------------------------------------
# Tabs. Each entry: key, name, purpose, filters, rows. A row is a list of cards placed left to right;
# a card is (ref, width, height[, options]) with options: title, params (override), note.
# ---------------------------------------------------------------------------------------------------------
def T(text, w=GRID, h=1):
    return ('text:' + text, w, h)


def H(text, w=GRID, h=1):
    return ('heading:' + text, w, h)


TABS = [
    {
        'key': 'today', 'name': 'Today', 'filters': ['period'],
        'purpose': 'The first page every day: cash available, principal at work, interest this month against the '
                   'projection, collection progress, what needs attention, and the two trends that explain the month.',
        'replaces': '1 · Overview (tab 4)',
        'rows': [
            [T('**Today** · live figures on refresh, Bangkok dates; trends from completed-day snapshots. Gross interest before expenses.', 18, 2),
             (257, 6, 2, {'title': 'As of · Bangkok'})],
            [(49, 6, 3, {'title': 'Cash available'}),
             ('today.principal-smart', 6, 3, {'title': 'Principal at work'}),
             (51, 6, 3, {'title': 'Interest this month · realized'}),
             (237, 6, 3, {'title': 'Collected today'})],
            [(68, 8, 4, {'title': 'Capital deployed · live'}),
             ('today.realization', 8, 4, {'title': 'Interest this month · share of projection'}),
             ('today.collection-rate', 8, 4, {'title': 'Collected today · share of amount due'})],
            [H('Needs attention · chips open Collection and Borrower Health')],
            [(240, 4, 2, {'title': '🟣 Overdue · people'}), (254, 4, 2, {'title': 'Overdue ฿'}),
             (242, 4, 2, {'title': '🔴 Not paid today'}), (244, 4, 2, {'title': '🟠 Partially paid'}),
             (270, 4, 2, {'title': 'Modified plans'}), (251, 4, 2, {'title': 'Unclassified · expect 0'})],
            [(62, 12, 7, {'title': 'Principal at work · daily close', 'note': 'goal line = principal reference 120,000'}),
             (222, 12, 7, {'title': 'Daily gross interest · 7-day average', 'note': 'goal line = daily interest goal 10,000'})],
            [(60, 12, 7, {'title': 'Principal by borrower · top four + others'}),
             (61, 12, 7, {'title': 'Interest · past 30 days by borrower'})],
            [T('Card descriptions hold the exact definitions. Profit means gross interest before expenses.', 24, 1)],
        ],
        'dropped': [47, 50, 52, 54, 55, 56, 57, 58, 59, 63, 64],
        'phone': 'Headline cards stack in the order shown; the attention chips wrap two per row; charts stack.',
    },
    {
        'key': 'cash-position', 'name': 'Cash Position', 'filters': ['position-date', 'period'],
        'purpose': 'Where the money is on a chosen date: pool, principal, lending capital and net cash, by holder and '
                   'account, with the completed-day trend.',
        'replaces': '2 · Cash Position (tab 14)',
        'rows': [
            [T('**Cash position** · Date selects the position (today = live, past dates = hourly snapshot). Lending capital is not a bank balance; net cash includes negative balances.', 24, 2)],
            [('cash.pool-selected', 6, 3, {'title': 'Total cash pool'}),
             ('cash.principal-selected', 6, 3, {'title': 'Principal outstanding'}),
             (207, 6, 3, {'title': 'Remaining lending capital'}),
             (208, 6, 3, {'title': 'Net cash balance'})],
            [(68, 8, 6, {'title': 'Capital deployed · live'}),
             (210, 16, 6, {'title': 'Net cash by holder · selected date'})],
            [(211, 24, 7, {'title': 'Account balances · selected date (signed)'})],
            [(202, 24, 7, {'title': 'Daily closing positions · completed days', 'params': ['period']})],
            [T('Unknown openings stay blank rather than showing current values. Source and freshness: Data health tab.', 24, 1)],
        ],
        'dropped': [47, 48, 209],
        'phone': 'Four numbers stack; holder chart above the account table; trend last.',
    },
    {
        'key': 'income', 'name': 'Income', 'filters': ['statement-period'],
        'purpose': 'Income − expenses = net profit for the statement period, compared with the previous period and '
                   'the previous months, with expense categories and detail.',
        'replaces': '3 · Income Statement (tab 16)',
        'rows': [
            [T('**Income statement** · live, includes later corrections · daily chart from completed-day snapshots. Net profit = gross interest − expenses.', 24, 2)],
            [(168, 8, 3, {'title': 'Income · gross interest'}), (169, 8, 3, {'title': '− Expenses'}),
             (170, 8, 3, {'title': '= Net profit'})],
            [('income.vs-previous', 16, 4, {'title': 'This period and the previous period'}),
             (171, 8, 4, {'title': 'Net profit per day · calendar days'})],
            [('income.monthly', 16, 8, {'title': 'Monthly income, expenses and net profit'}),
             (178, 8, 8, {'title': 'Expenses by category · this period'})],
            [(213, 24, 7, {'title': 'Daily income and expenses · completed days'})],
            [(212, 24, 7, {'title': 'Expense detail · this period'})],
            [T('Per-day average uses calendar days in the period. Period freshness and snapshot coverage: Data health tab.', 24, 1)],
        ],
        'dropped': [184, 204, 214],
        'phone': 'Equation band stacks vertically with the − and = in the titles; tables scroll sideways.',
    },
    {
        'key': 'cashflow', 'name': 'Cashflow', 'filters': ['statement-period', 'account'],
        'purpose': 'Opening + money in − money out = closing for the period and account, movement by type, the '
                   'daily movement and the transaction list.',
        'replaces': '4 · Cashflow Statement (tab 15)',
        'rows': [
            [T('**Cashflow statement** · live · All accounts nets transfers to zero. Unknown openings show Unavailable.', 24, 2)],
            [(195, 6, 3, {'title': 'Opening cash'}), (192, 6, 3, {'title': '+ Money in'}),
             (193, 6, 3, {'title': '− Money out'}), (197, 6, 3, {'title': '= Closing cash'})],
            [(194, 6, 3, {'title': 'Net cash movement'}),
             ('cashflow.by-type-row', 18, 7, {'title': 'Cash movement by transaction type'})],
            [(203, 24, 6, {'title': 'Cash movement by transaction type · table'})],
            [(215, 24, 7, {'title': 'Daily cash movement · completed days'})],
            [(196, 24, 10, {'title': 'Transactions · chronological'})],
            [T('Statement date plus posting time. Repayments keep their recorded type. Freshness: Data health tab.', 24, 1)],
        ],
        'dropped': [198, 216],
        'phone': 'Equation band stacks; the transaction table keeps date, type, amount and account, the rest scroll.',
    },
    {
        'key': 'performance', 'name': 'Performance', 'filters': ['period'],
        'purpose': 'Lending results for the period: interest, principal issued and returned, loans issued, cohort '
                   'return, with the daily and weekly trends.',
        'replaces': '5 · Performance (tab 18)',
        'rows': [
            [T('**Performance** · totals live · trends from completed-day snapshots · loan dates and interest dates both use Period.', 24, 2)],
            [(217, 5, 3, {'title': 'Gross interest'}), (218, 5, 3, {'title': 'Principal issued'}),
             (219, 4, 3, {'title': 'Loans issued'}), (234, 5, 3, {'title': 'Net principal deployed'}),
             (235, 5, 3, {'title': 'Loan-cohort return'})],
            [('perf.vs-previous', 24, 4, {'title': 'This period and the previous period'})],
            [(223, 12, 7, {'title': 'Principal issued and returned · daily'}),
             (222, 12, 7, {'title': 'Daily gross interest · 7-day average'})],
            [H('Lending volume')],
            [(220, 8, 6, {'title': 'Gross interest by loan type'}), (224, 8, 6, {'title': 'Loans issued per day'}),
             (225, 8, 6, {'title': 'Average loan size · per week'})],
            [H('Returns')],
            [(232, 12, 6, {'title': 'Daily capital yield'}), (233, 12, 6, {'title': 'Weekly loan-cohort return'})],
            [(230, 12, 6, {'title': 'Cumulative gross interest · 7-day average'}),
             (226, 12, 6, {'title': 'Active loans and borrowers · end of day'})],
            [(227, 24, 8, {'title': 'Daily performance · snapshots'})],
            [T('Principal counts once per loan. Snapshot coverage and rolling-average rules: Data health tab.', 24, 1)],
        ],
        'dropped': [221, 228, 231],
        'phone': 'Five headline numbers become two columns; chart pairs stack.',
    },
    {
        'key': 'borrowers', 'name': 'Borrowers', 'filters': ['period', 'population'],
        'purpose': 'Who holds the principal and who pays the interest, lifetime returns, concentration and ageing '
                   '(from the former Risks tab), and the comparison table that opens Borrower Detail.',
        'replaces': '6 · Borrowers (tab 104) and 9 · Risks (tab 8)',
        'rows': [
            [T('**Borrowers** · live · current positions ignore Period; activity uses it. Population applies everywhere.', 24, 2)],
            [(278, 6, 3, {'title': 'Active borrowers'}), (279, 6, 3, {'title': 'Active loans'}),
             (280, 6, 3, {'title': 'Principal outstanding'}), (281, 6, 3, {'title': 'Interest received · period'})],
            [(285, 8, 8, {'title': 'Principal outstanding by borrower'}),
             (286, 8, 8, {'title': 'Interest received · period by borrower'}),
             (314, 8, 8, {'title': 'Lifetime interest return on principal lent · top 8'})],
            [H('Concentration & ageing')],
            [(110, 6, 3, {'title': 'Top three concentration'}), (111, 6, 3, {'title': 'Past-due amount'}),
             (117, 12, 6, {'title': 'Default loss over time'})],
            [(114, 8, 6, {'title': 'Active loan count by age'}), (115, 8, 6, {'title': 'Active principal by age'}),
             (116, 8, 6, {'title': 'Borrower risk · excluding largest exposure'})],
            [(289, 24, 11, {'title': 'Borrower comparison · click a name for Detail'})],
            [H('Activity over time')],
            [(287, 12, 7, {'title': 'Interest received over time · top 5 + others'}),
             (288, 12, 7, {'title': 'First and repeat loans · weekly'})],
            [T('Gross interest before expenses. Categories come from Borrower Health. Lifetime daily rate (question 313) and the risk monitor (118) stay available as saved questions.', 24, 1)],
        ],
        'dropped': [282, 283, 284, 311, 312, 313, 315, 48, 81, 112, 113, 118],
        'phone': 'Headline two per row; ranked bars stack; the comparison table keeps borrower, category, principal and overdue.',
    },
    {
        'key': 'health', 'name': 'Borrower Health', 'filters': [],
        'purpose': 'The payment-behaviour × contribution matrix and the category lists, with the rating detail below.',
        'replaces': '7 · Borrower Health Review (tab 31)',
        'rows': [
            [T('**Borrower Health** · current portfolio, refreshed on load · click a name to open Borrower Detail.', 12, 2),
             (270, 6, 2, {'title': 'Modified plans'}), (257, 6, 2, {'title': 'As of · Bangkok'})],
            [(253, 6, 3, {'title': 'Active borrowers'}), (254, 6, 3, {'title': 'Overdue ฿ · all borrowers'}),
             (255, 6, 3, {'title': 'Provisional · active'}), (256, 6, 3, {'title': 'Unclassified · active'})],
            [('iframe:matrix', 24, 22)],
            [(260, 6, 2, {'title': 'Star'}), (258, 6, 2, {'title': 'Cash Cow'}),
             (264, 6, 2, {'title': 'Question Mark'}), (262, 6, 2, {'title': 'Dog'})],
            [(275, 24, 9, {'title': 'Borrowers by category · scores, schedule and contribution',
                           'note': 'column order: Category, Borrower, Score, Contribution, Schedule, then detail; sorted by category'})],
            [H('Rating detail')],
            [(267, 24, 10, {'title': 'Payment health · all borrowers'})],
            [(269, 24, 6, {'title': 'Unavailable ratings and default context'})],
            [(268, 24, 10, {'title': 'Reliability components and effective weights · active borrowers'})],
            [(271, 24, 8, {'title': 'Automatic schedule assessment · active borrowers'})],
            [(272, 24, 8, {'title': 'Modified schedules · loan and next-plan detail'})],
            [T('Rating: recent punctuality 45% · older punctuality 15% · average delay 15% · current payment health 25%; threshold 80; contribution boundary 1×. Full method in the dictionary.', 24, 2)],
        ],
        'dropped': [259, 261, 263, 265],
        'phone': 'The matrix scales to width; category counts two per row; detail tables scroll.',
    },
    {
        'key': 'borrower-detail', 'name': 'Borrower Detail', 'filters': ['borrower', 'period', 'scenario-amount'],
        'purpose': 'One borrower: profile, current and lifetime position, charge lights, activity in the period, '
                   'the three working tables, the evidence tables and the lending scenario.',
        'replaces': '8 · Borrower Detail (tab 105)',
        'rows': [
            [T('**Borrower Detail** · select one borrower. Lifetime and current sections ignore Period; activity uses it.', 24, 2)],
            [(290, 24, 4, {'title': 'Profile · current position'})],
            [(378, 6, 3, {'title': 'Category · BCG matrix'}), (293, 6, 3, {'title': 'Overdue ฿'}),
             (294, 6, 3, {'title': 'Portfolio share'}), (292, 6, 3, {'title': 'Active loans'})],
            [H('Active loans · lifetime receipts / current principal')],
            [(291, 4, 3, {'title': 'Current principal ฿'}), (370, 4, 3, {'title': 'Outstanding ฿'}),
             (371, 4, 3, {'title': 'Interest earned ฿'}), (372, 4, 3, {'title': 'After coverage ฿'}),
             (373, 4, 3, {'title': 'Return %'}), (374, 4, 3, {'title': 'Coverage date'})],
            [H('Closed loans · lifetime')],
            [(375, 8, 3, {'title': 'Original principal ฿'}), (376, 8, 3, {'title': 'Interest earned ฿'}),
             (377, 8, 3, {'title': 'Return on closed loans'})],
            [(369, 24, 5, {'title': 'Most recent seven charge dates · red overdue, orange paid late, green on time'})],
            [H('Activity · selected period')],
            [(296, 6, 3, {'title': 'Interest received ฿'}), (297, 6, 3, {'title': 'Principal issued ฿'}),
             (298, 6, 3, {'title': 'Principal returned ฿'}), (299, 6, 3, {'title': 'Loans issued'})],
            [(301, 12, 7, {'title': 'Principal issued and returned'}), (302, 12, 7, {'title': 'Interest received over time'})],
            [(303, 24, 8, {'title': 'Active loans and recorded next plan'})],
            [(308, 24, 7, {'title': 'All current overdue obligations'})],
            [(305, 24, 8, {'title': 'Loan history · lifetime'})],
            [(316, 24, 4, {'title': 'Payment punctuality · selected due dates'})],
            [(304, 24, 7, {'title': 'Payment punctuality over time · due month'})],
            [H('Records · selected period')],
            [(307, 24, 8, {'title': 'Obligation evidence · selected due dates'})],
            [(317, 24, 8, {'title': 'Payments · selected payment dates'})],
            [(306, 24, 8, {'title': 'Repayment allocations · selected payment dates'})],
            [H('Additional lending scenario · hypothetical only')],
            [(309, 24, 5, {'title': 'Additional lending · hypothetical only'})],
            [T('All amounts are baht. Allocations are not unique receipts; corrections remain signed. Context and dates: Data health tab.', 24, 1)],
        ],
        'dropped': [300],
        'phone': 'Profile first, then the number rows two per row; charge lights full width; tables scroll.',
    },
    {
        'key': 'collection', 'name': 'Collection', 'filters': ['collection-borrower', 'collection-status'],
        'purpose': 'Today\'s collection board: progress, the four status lanes, the detail table and today\'s charges.',
        'replaces': '10 · Collection Monitor (tab 19)',
        'rows': [
            [T('**Collection · Bangkok today** · live · refresh every minute · payments appear after sync. Filters apply to the detail table only.', 12, 2),
             (250, 12, 2, {'title': 'As of · query time'})],
            [(237, 6, 3, {'title': 'Collected today'}), (238, 6, 3, {'title': 'Left to collect'}),
             (239, 6, 3, {'title': 'People fully paid'}), (252, 6, 3, {'title': "Today's charges · paid %"})],
            [('today.collection-rate', 24, 2, {'title': 'Collected today · share of amount due'})],
            [(242, 6, 2, {'title': '🔴 Not paid · people'}), (244, 6, 2, {'title': '🟠 Partially paid · people'}),
             (240, 6, 2, {'title': '🟣 Overdue · people'}), (246, 6, 2, {'title': '🟢 Fully paid · people'})],
            [(243, 6, 9, {'title': '🔴 Not paid', 'note': 'sort by amount left desc'}),
             (245, 6, 9, {'title': '🟠 Partially paid', 'note': 'sort by amount left desc'}),
             (241, 6, 9, {'title': '🟣 Overdue', 'note': 'sort by overdue amount desc'}),
             (247, 6, 9, {'title': '🟢 Fully paid', 'note': 'sort by received desc'})],
            [(251, 6, 6, {'title': 'Unclassified · expect 0'}),
             (64, 18, 6, {'title': 'Overdue charges · completed days', 'params': []})],
            [(248, 24, 10, {'title': 'Collection detail · filters above apply here'})],
            [(249, 24, 5, {'title': 'Charges dated today · separate from board balances'})],
            [T('Received = receipts today. Left includes older dues. A payment today can still leave someone Overdue; people move lanes after refresh.', 24, 1)],
        ],
        'dropped': [],
        'phone': 'Lanes stack in the order Not paid, Partially paid, Overdue, Fully paid; the detail table keeps borrower, status, left.',
    },
    {
        'key': 'partners', 'name': 'Partners', 'filters': ['partner', 'statement-period', 'settlement-status'],
        'purpose': 'Each partner\'s capital, earnings, payouts, pending settlements and net available, the activity '
                   'in the period and the ledgers.',
        'replaces': '11 · Partners (tab 249)',
        'rows': [
            [T('**Partners** · current balances stay current when the period changes · baht · net available is an entitlement after reservations, not cash on hand.', 24, 2)],
            [(325, 5, 3, {'title': 'Net capital ฿'}), (326, 5, 3, {'title': 'Net earned to date ฿'}),
             (327, 5, 3, {'title': 'Completed payouts ฿'}), (328, 5, 3, {'title': 'Pending settlements ฿'}),
             (329, 4, 3, {'title': 'Net available ฿'})],
            [(330, 16, 7, {'title': 'Partner positions · current'}),
             ('partners.capital-share-row', 8, 7, {'title': 'Capital share · full pool'})],
            [(340, 24, 6, {'title': 'Pending settlements · all dates'})],
            [H('Activity · statement period')],
            [(333, 6, 3, {'title': 'Allocated interest ฿'}), (334, 6, 3, {'title': 'Allocated expenses ฿'}),
             (335, 6, 3, {'title': 'Net earned ฿'}), (336, 6, 3, {'title': 'Payouts in period ฿'})],
            [(337, 12, 8, {'title': 'Monthly net earned versus paid'}), (338, 12, 8, {'title': 'Capital contributions and withdrawals'})],
            [(339, 24, 8, {'title': 'Net contributed capital over time'})],
            [H('Ledgers · statement period')],
            [(341, 24, 8, {'title': 'Capital transaction ledger'})],
            [(342, 24, 8, {'title': 'Settlement transaction ledger'})],
            [T('Capital withdrawals and profit payouts are separate. Calculation and source checks: Data health tab.', 24, 1)],
        ],
        'dropped': [331, 332, 343],
        'phone': 'Five numbers two per row; the positions table keeps partner, capital, available.',
    },
    {
        'key': 'forecast', 'name': 'Forecast & Plan', 'filters': PLAN_PARAMS,
        'purpose': 'Interest outlook for the current month under one scenario, the drivers and the watchlist, then the '
                   'cash plan with its inputs checklist and month-end bridge.',
        'replaces': '12 · Forecast & Planning (tab 262)',
        'rows': [
            [T('**Forecast & Plan · current Bangkok month** · existing loan book · scenarios are assumptions, not promised collections. Interest and principal stay separate.', 24, 2)],
            [(353, 24, 4, {'title': 'Scenario and assumptions in force'})],
            [H('Interest outlook')],
            [(348, 6, 3, {'title': 'Interest received · month to date'}), (349, 6, 3, {'title': 'Remaining · scenario'}),
             (350, 6, 3, {'title': 'Month-end outlook'}), (351, 6, 3, {'title': 'Target gap'})],
            [(356, 16, 9, {'title': 'Cumulative interest · actual and projected'}),
             (355, 8, 9, {'title': 'Month-end by scenario'})],
            [(357, 12, 8, {'title': 'Upcoming dues · remaining weeks'}), (360, 12, 8, {'title': 'Watchlist · dues at risk'})],
            [(354, 12, 7, {'title': 'Interest outlook bridge'}), (358, 12, 7, {'title': 'Borrower forecast contribution'})],
            [(359, 12, 6, {'title': 'Interest by loan type'}), (352, 12, 6, {'title': 'Principal receipts · scenario'})],
            [H('Cash plan · whole portfolio')],
            [(365, 8, 3, {'title': 'Business cash now ฿'}), (366, 8, 3, {'title': 'Month-end cash ฿'}),
             (367, 8, 3, {'title': 'Reserve shortfall ฿'})],
            [(364, 24, 6, {'title': 'Plan inputs and status', 'note': 'Plan not ready until all five inputs are set; blank results until then'})],
            [(368, 24, 8, {'title': 'Month-end cash bridge'})],
            [T('Recorded obligations come before simulated ones. Planned new lending adds no forecast income. Month-end cash is not the lowest balance of the month. Detail and coverage: Data health tab.', 24, 2)],
        ],
        'dropped': [361, 362, 363],
        'phone': 'Headline numbers two per row; the cumulative chart first among charts; plan inputs above the bridge.',
    },
    {
        'key': 'data-health', 'name': 'Data health',
        'filters': ['statement-period', 'account', 'period', 'position-date', 'population', 'borrower', 'partner'] + FORECAST_PARAMS,
        'purpose': 'Freshness, coverage, source and calculation checks for every page, in page order, so the business '
                   'pages stay clean and the checks stay one click away.',
        'replaces': 'new tab; cards moved from tabs 14, 16, 15, 18, 104, 105, 249 and 262',
        'rows': [
            [T('**Data health** · every page\'s freshness, coverage and source checks. Filters here mirror the pages they belong to.', 24, 2)],
            [(276, 8, 3, {'title': 'Reporting connection · SELECT 1'}), (257, 8, 3, {'title': 'Queried at · Bangkok'}),
             (250, 8, 3, {'title': 'Bangkok date and query time'})],
            [H('Cash Position')], [(209, 24, 6, {'title': 'Cash position · source and freshness'})],
            [H('Income')], [(184, 12, 6, {'title': 'Income period and freshness'}), (214, 12, 6, {'title': 'Profit trend snapshot freshness'})],
            [H('Cashflow')], [(198, 12, 8, {'title': 'Cashflow period and freshness'}), (216, 12, 8, {'title': 'Cash trend snapshot freshness'})],
            [H('Performance')], [(221, 8, 7, {'title': 'Live period and source'}), (228, 16, 7, {'title': 'Snapshot coverage and generation times'})],
            [(231, 24, 4, {'title': 'Rolling-average coverage · selected completed dates'})],
            [H('Borrowers and Borrower Detail')], [(284, 12, 4, {'title': 'Period, population and source'}), (315, 12, 4, {'title': 'Overall charts · dates and data availability'})],
            [(300, 24, 5, {'title': 'Activity dates and lifetime context · selected borrower'})],
            [H('Partners')], [(332, 12, 7, {'title': 'How net available is calculated'}), (343, 12, 7, {'title': 'Source and balance checks'})],
            [H('Forecast')], [(363, 24, 7, {'title': 'Forecast coverage and exceptions'})],
            [(361, 24, 10, {'title': 'Loan forecast detail'})], [(362, 24, 10, {'title': 'Recorded and simulated obligations'})],
        ],
        'dropped': [],
        'phone': 'Reference only; tables scroll.',
    },
]

# Cards whose dashboard-3 parameter mappings must be copied; everything else maps by the tab's filter list.
# Special cases: question 64 on Collection is placed without a period mapping (fixed past-30-day window per the
# card's default); questions 202 and 222 keep their own mappings where they have any.


def build():
    layout = {'dashboard': DASHBOARD, 'parameters': PARAMETERS, 'new_questions': NEW_QUESTIONS, 'tabs': []}
    md = ['\n### Filters\n', '| Id | Name | Type | Default | Replaces on dashboard 3 | Values |', '| --- | --- | --- | --- | --- | --- |']
    for p in PARAMETERS:
        vs = p.get('values_source')
        vs = ('card ' + str(vs['card_id'])) if isinstance(vs, dict) else ('copy static list' if vs == 'copy' else '')
        md.append(f"| `{p['id']}` | {p['name']} | {p['type']} | {p.get('default')} | {', '.join(p['replaces'])} | {vs} |")
    md += ['\n### New questions\n', '| Key | Name | Display | Basis | Filters | Definition |', '| --- | --- | --- | --- | --- | --- |']
    for k, q in NEW_QUESTIONS.items():
        md.append(f"| `{k}` | {q['name']} | {q['display']} | {q['basis']} | {', '.join(q['params']) or 'none'} | {q['definition']} |")
    all_refs = []
    for ti, tab in enumerate(TABS):
        placements = []
        row = 0
        for cards in tab['rows']:
            col = 0
            height = 0
            for card in cards:
                ref, w, h = card[0], card[1], card[2]
                opt = card[3] if len(card) > 3 else {}
                if col + w > GRID:
                    row += height
                    col = 0
                    height = 0
                p = {'row': row, 'col': col, 'size_x': w, 'size_y': h}
                if isinstance(ref, str) and ref.startswith('text:'):
                    p['virtual'] = 'text'
                    p['text'] = ref[5:]
                elif isinstance(ref, str) and ref.startswith('heading:'):
                    p['virtual'] = 'heading'
                    p['text'] = ref[8:]
                elif ref == 'iframe:matrix':
                    p['copy_dashcard'] = 1501
                elif isinstance(ref, int):
                    p['reuse_card_id'] = ref
                else:
                    p['new_question'] = ref
                if 'title' in opt:
                    p['title'] = opt['title']
                if 'note' in opt:
                    p['note'] = opt['note']
                p['params'] = opt.get('params', [f for f in tab['filters']] if not p.get('virtual') else [])
                placements.append(p)
                all_refs.append(ref)
                col += w
                height = max(height, h)
            row += height
        layout['tabs'].append({'key': tab['key'], 'name': tab['name'], 'position': ti, 'filters': tab['filters'],
                               'placements': placements, 'height_rows': row,
                               'dropped_from_dashboard_3': tab['dropped']})
        # Markdown
        md.append(f"\n### {ti + 1} · {tab['name']} (`{tab['key']}`)\n")
        md.append(f"Replaces: {tab['replaces']}. Filters: {', '.join('`' + f + '`' for f in tab['filters']) or 'none'}. "
                  f"Height {row} grid rows, {len(placements)} placements "
                  f"({sum(1 for p in placements if not p.get('virtual'))} visuals).\n")
        md.append(tab['purpose'] + '\n')
        md.append('| Row/col | Size | Source | Title on the page | Notes |\n| --- | --- | --- | --- | --- |')
        for p in placements:
            if p.get('virtual'):
                src = f"{p['virtual']} card"
                title = p['text'][:110] + ('…' if len(p['text']) > 110 else '')
            elif 'copy_dashcard' in p:
                src = 'live dashcard 1501 (iframe, copied verbatim)'
                title = 'Custom BCG matrix'
            elif 'reuse_card_id' in p:
                src = f"reuse q{p['reuse_card_id']}"
                title = p.get('title', '')
            else:
                src = f"new `{p['new_question']}`"
                title = p.get('title', '')
            notes = p.get('note', '')
            md.append(f"| {p['row']}/{p['col']} | {p['size_x']}×{p['size_y']} | {src} | {title} | {notes} |")
        md.append(f"\nDropped from dashboard 3: {', '.join('q' + str(d) for d in tab['dropped']) or 'none'} "
                  f"(the saved questions are kept; nothing is deleted).\n\nPhone: {tab['phone']}\n")
    reused = sorted({r for r in all_refs if isinstance(r, int)})
    new = sorted({r for r in all_refs if isinstance(r, str) and not r.startswith(('text:', 'heading:', 'iframe:'))})
    layout['summary'] = {'tabs': len(TABS), 'placements': sum(len(t['placements']) for t in layout['tabs']),
                         'reused_questions': reused, 'new_questions': new, 'parameters': len(PARAMETERS)}
    with open(os.path.join(HERE, 'layout.json'), 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)
        f.write('\n')
    design = os.path.join(HERE, 'DESIGN.md')
    text = open(design, encoding='utf-8').read()
    start, end = '<!-- GENERATED:START -->', '<!-- GENERATED:END -->'
    generated = '\n'.join(md)
    summary = (f"\n{len(TABS)} tabs, {layout['summary']['placements']} placements, {len(PARAMETERS)} filters, "
               f"{len(reused)} reused saved questions, {len(new)} new questions.\n")
    text = re.sub(re.escape(start) + '.*?' + re.escape(end), start + summary + generated + '\n' + end, text, flags=re.S)
    open(design, 'w', encoding='utf-8').write(text)
    print(json.dumps(layout['summary']))


if __name__ == '__main__':
    build()
