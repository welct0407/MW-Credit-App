"""Loan Reports redesign — single specification for the proposed parallel dashboard.

Run from the repository root with bundled Python:
    python3 -I project/outputs/loan-reports-redesign-20261026/build_design.py
It rewrites layout.json (machine-readable, for the installer) and the generated card tables in DESIGN.md
(between the GENERATED markers). The specification below is the authority; edit it, not the outputs.

Card references: an integer is an existing saved question on dashboard 3 (reused as is, with placement-level
presentation overrides only); a string key is a new question defined in NEW_QUESTIONS; "text:..." and
"heading:..." are virtual cards; "iframe:matrix" is the custom BCG matrix dashcard, copied verbatim from live
dashcard 1501. A list as the reference is a vertical stack of cards in one column (see `stack`).

Placement options (the installer applies them generically):
    title       -> visualization_settings['card.title'] (and inside a visualizer block when present)
    description -> visualization_settings['card.description'] (words moved out of a shortened title)
    vs          -> merged into visualization_settings (and inside visualization.settings for visualizer-format
                   placements copied from dashboard 3, where the inner settings win at render time)
    columns     -> {'order': [...], 'hide': [...]} -> table.columns from the card's result_metadata names: the
                   named columns first in that order, the rest in their saved order, hidden ones disabled
    hide_empty  -> visualization_settings['card.hide_empty'] = True (Metabase hides the card when it has no rows)
    params      -> the dashboard filters mapped on this placement (default: the tab's filter list)
    note        -> documentation only

Revision 2 (26 October 2026, after the owner's review of the first build): new questions replace reused ones
wherever a placement setting cannot reach the plan (sorted lanes, top-N + others, strips, statement tables),
and every placement carries the settings Metabase needs to look like the prototype boards.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GRID = 24
SITE = 'https://reports.mw-credit.com'

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

# Shared visualization fragments
BAHT = {'number_style': 'decimal', 'decimals': 0, 'number_separators': '.,', 'compact': False}
PCT = {'number_style': 'percent', 'decimals': 1, 'number_separators': '.,'}
STATUS = {'not_paid': '#ED6E6E', 'partial': '#F9A825', 'overdue': '#7172AD', 'paid': '#1E9F5A'}
BLUE, TEAL, ORANGE = '#509EE3', '#178F8A', '#EB6834'


def cols(names, fmt=BAHT):
    return {json.dumps(['name', n]): dict(fmt) for n in names}


def titled(name, title, fmt=BAHT):
    return {json.dumps(['name', name]): {**fmt, 'column_title': title}}


# ---------------------------------------------------------------------------------------------------------
# New questions (saved in the proposed collection). Fields:
#   basis       the governed source (model, snippet or origin question)
#   origin      the dashboard-3 question whose query, template tags and parameter mappings the copy inherits
#               (the installer copies the mapping contract from that origin; `params` names the new filter ids)
#   kind        'native' (sql given, with {{#id}} model tags and the origin's template tags) | 'mbql' (query given)
#   settings    visualization_settings of the saved question
#   reconcile   what Chase checks against the origin with the same filters
# ---------------------------------------------------------------------------------------------------------
LANE_FIELDS = ['Borrower', 'Borrower ID', 'Daily Collection Status']


def lane(status, emoji_name, first, first_title, second, second_title, sort_field, origin, tint, widths):
    """Copy of a Collection Monitor lane (MBQL on model 77 Collection Worklist) with the prototype's columns
    and a sort by amount. Hidden columns keep the origin's click-through to Borrower Detail. Column titles are
    short so headers fit a 6-column card; the row tint is a rule on the hidden status column so every cell of
    the row gets the same colour (a rule on a visible column darkens that cell)."""
    fields = ['Borrower', first, second] + LANE_FIELDS[1:]
    return {
        'name': f'{emoji_name} · lane', 'display': 'table', 'kind': 'mbql',
        'basis': 'model 77 Collection Worklist', 'origin': origin, 'params': [],
        'definition': f'MBQL on model 77 filtered Daily Collection Status = {status!r}; fields {fields}; '
                      f'ORDER BY {sort_field} desc, Borrower asc. Same rows as question {origin}, resorted. Column titles '
                      f'Name / {first_title} / {second_title}; widths {widths} px for the three visible columns.',
        'query': {'source-table': 'card__77', 'filter': ['=', ['field', 'Daily Collection Status', {'base-type': 'type/Text'}], status],
                  'fields': [['field', f, {'base-type': 'type/Text' if f in LANE_FIELDS else 'type/Decimal'}] for f in fields],
                  'order-by': [['desc', ['field', sort_field, {'base-type': 'type/Decimal'}]],
                               ['asc', ['field', 'Borrower', {'base-type': 'type/Text'}]]]},
        'settings': {'table.pivot': False,
                     'table.columns': [{'name': f, 'enabled': f not in ('Borrower ID', 'Daily Collection Status')} for f in fields],
                     'table.column_widths': widths,
                     'column_settings': {**titled('Borrower', 'Name', {}), **titled(first, first_title), **titled(second, second_title)},
                     'table.column_formatting': [{'id': 0, 'columns': ['Daily Collection Status'], 'type': 'single', 'operator': '=',
                                                  'value': status, 'color': tint, 'highlight_row': True}],
                     'copy_from_origin': ['click_behavior']},
        'reconcile': f'Same Borrower set and the same values per borrower as question {origin} (order differs).',
    }


NEW_QUESTIONS = {
    # ---- Today -------------------------------------------------------------------------------------------
    'today.principal-smart': {
        'name': 'Principal at work · change over the period', 'display': 'smartscalar', 'kind': 'mbql',
        'basis': 'model 74 Daily Performance', 'origin': 62, 'params': ['period'],
        'definition': 'MBQL on model 74: Outstanding Principal (max) by Date, filtered by Period on Date. '
                      'Smart scalar shows the latest completed-day value and the change against the first '
                      'date in the period (29 periods ago on the default 30-day Period). Whole baht.',
        'settings': {'scalar.compact_primary_number': False, 'scalar.comparisons': [{'id': 'first', 'type': 'periodsAgo', 'value': 29}]},
        'reconcile': 'Latest value equals question 62\'s last completed day; first value equals its first day (built, verified).',
    },
    'today.realization': {
        'name': 'Interest this month · share of projection', 'display': 'progress', 'kind': 'mbql',
        'basis': 'model 73 Portfolio Overview', 'origin': 52, 'params': [],
        'definition': 'MBQL on model 73: field Forecast Realization (Realized Profit MTD ÷ Projected Monthly Profit). '
                      'Progress goal 1 shows the share of the projected month collected so far.',
        'settings': {'progress.goal': 1, 'progress.color': '#2a78d6'},
        'reconcile': 'Equals question 51 ÷ question 52 (built, verified).',
    },
    'today.collection-rate': {
        'name': 'Collected today · share of amount due', 'display': 'progress', 'kind': 'mbql',
        'basis': 'model 73 Portfolio Overview', 'origin': 252, 'params': [],
        'definition': 'MBQL on model 73: field Amount Collection Rate Today (Amount Collected Today ÷ Amount Due Today). '
                      'Progress goal 1. Reused on Today and Collection.',
        'settings': {'progress.goal': 1, 'progress.color': '#067647'},
        'reconcile': 'Equals model 73 Amount Collection Rate Today and question 252 (built, verified).',
    },
    'today.attention': {
        'name': 'Needs attention · strip', 'display': 'table', 'kind': 'native',
        'basis': 'models 162 Collection Status Summary and 77 Collection Worklist; views of questions 254 and 270',
        'origin': 240, 'params': [],
        'definition': 'One row per attention item with people and baht: 🟣 Overdue (count from model 162 as question 240, '
                      'amount as question 254), 🔴 Not paid today (model 162 count as 242, amount left), 🟠 Partially paid '
                      '(model 162 as 244, amount left), Modified plans (question 270). Columns Item, People, Amount ฿, '
                      'Opens, Tab and Tint (both hidden; Tint drives an even row tint). The installer substitutes __TAB_COLLECTION__ and __TAB_HEALTH__ with the '
                      'proposed tab ids and sets the Item column click behaviour to the link template '
                      f'{SITE}/dashboard/<dashboard>?tab={{{{Tab}}}}. Replaces six chips with one card.',
        'sql': "WITH s AS (SELECT \"Collection Status\" status,\"Borrower Count\" people,\"Amount Remaining\" remaining FROM {{#162}})\n"
               "SELECT v.\"Item\",v.\"People\",v.\"Amount ฿\",v.\"Opens\",v.\"Tab\",v.\"Tint\" FROM (VALUES\n"
               " (1,'🟣 Overdue',coalesce((SELECT people FROM s WHERE status='Overdue'),0)::bigint,(SELECT CASE WHEN bool_and(overdue_amount IS NOT NULL) THEN sum(overdue_amount) END FROM public.reporting_borrower_payment_health_v1)::numeric,'Collection','__TAB_COLLECTION__','overdue'),\n"
               " (2,'🔴 Not paid today',coalesce((SELECT people FROM s WHERE status='Not Paid'),0)::bigint,(SELECT remaining FROM s WHERE status='Not Paid')::numeric,'Collection','__TAB_COLLECTION__','not_paid'),\n"
               " (3,'🟠 Partially paid',coalesce((SELECT people FROM s WHERE status='Partially Paid'),0)::bigint,(SELECT remaining FROM s WHERE status='Partially Paid')::numeric,'Collection','__TAB_COLLECTION__','partial'),\n"
               " (4,'Modified plans',(SELECT count(*) FROM public.reporting_borrower_matrix_v3 WHERE arrangement_gate)::bigint,NULL::numeric,'Borrower Health','__TAB_HEALTH__','')\n"
               ") v(ord,\"Item\",\"People\",\"Amount ฿\",\"Opens\",\"Tab\",\"Tint\") ORDER BY v.ord",
        'settings': {'table.pivot': False, 'column_settings': cols(['Amount ฿']),
                     'table.columns': [{'name': n, 'enabled': n not in ('Tab', 'Tint')} for n in ['Item', 'People', 'Amount ฿', 'Opens', 'Tab', 'Tint']],
                     'table.column_formatting': [
                         {'id': 0, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'overdue', 'color': STATUS['overdue'], 'highlight_row': True},
                         {'id': 1, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'not_paid', 'color': STATUS['not_paid'], 'highlight_row': True},
                         {'id': 2, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'partial', 'color': STATUS['partial'], 'highlight_row': True}]},
        'reconcile': 'People: rows 1–3 equal questions 240, 242, 244; row 4 equals 270. Amount: row 1 equals 254; rows 2–3 equal '
                     'model 162 Amount Remaining for the status (also the sum of the lane\'s Left column).',
    },
    'today.principal-top4': {
        'name': 'Principal by borrower · top four + others', 'display': 'row', 'kind': 'native',
        'basis': 'model 72 Borrower Performance', 'origin': 60, 'params': [],
        'definition': 'Native on model 72: borrowers with Principal Rank ≤ 4 named, the rest summed as "Others (n)" '
                      '(n counts borrowers with principal above zero). Same total as question 60, four bars instead of ten.',
        'sql': "WITH r AS (SELECT \"Borrower\",\"Outstanding Principal\" amount,\"Principal Rank\" rank FROM {{#72}})\n"
               "SELECT CASE WHEN rank<=4 THEN \"Borrower\" ELSE 'Others ('||(SELECT count(*) FROM r WHERE rank>4 AND amount>0)||')' END AS \"Borrower\","
               "sum(amount) AS \"Amount ฿\",min(rank) AS \"Order\" FROM r GROUP BY 1 ORDER BY 3",
        'settings': {'graph.dimensions': ['Borrower'], 'graph.metrics': ['Amount ฿'], 'graph.show_values': True, 'graph.show_legend': False,
                     'graph.label_value_formatting': 'full', 'graph.x_axis.title_enabled': False, 'graph.y_axis.title_enabled': False,
                     'graph.max_categories_enabled': False, 'graph.colors': [TEAL], 'column_settings': cols(['Amount ฿'])},
        'reconcile': 'Sum of the five bars equals the sum of question 60\'s bars; the four named bars equal question 60\'s first four.',
    },
    'today.interest-top4': {
        'name': 'Interest · past 30 days by borrower · top four + others', 'display': 'row', 'kind': 'native',
        'basis': 'model 72 Borrower Performance', 'origin': 61, 'params': [],
        'definition': 'Native on model 72 with question 61\'s filter (Payments 30D > 0): Profit Rank ≤ 4 named, the rest '
                      'summed as "Others (n)". Same total as question 61.',
        'sql': "WITH r AS (SELECT \"Borrower\",\"Profit 30D\" amount,\"Profit Rank\" rank FROM {{#72}} WHERE \"Payments 30D\">0)\n"
               "SELECT CASE WHEN rank<=4 THEN \"Borrower\" ELSE 'Others ('||(SELECT count(*) FROM r WHERE rank>4)||')' END AS \"Borrower\","
               "sum(amount) AS \"Amount ฿\",min(rank) AS \"Order\" FROM r GROUP BY 1 ORDER BY 3",
        'settings': {'graph.dimensions': ['Borrower'], 'graph.metrics': ['Amount ฿'], 'graph.show_values': True, 'graph.show_legend': False,
                     'graph.label_value_formatting': 'full', 'graph.x_axis.title_enabled': False, 'graph.y_axis.title_enabled': False,
                     'graph.max_categories_enabled': False, 'graph.colors': ['#7472BE'], 'column_settings': cols(['Amount ฿'])},
        'reconcile': 'Sum of the five bars equals the sum of question 61\'s bars; the four named bars equal question 61\'s first four.',
    },
    # ---- Cash Position -----------------------------------------------------------------------------------
    'cash.pool-selected': {
        'name': 'Total cash pool · selected date', 'display': 'scalar', 'kind': 'native',
        'basis': 'snippet 4 Cash position source routing (models 205, 73)', 'origin': 207, 'params': ['position-date'],
        'definition': 'Native, same routing as question 207: today reads model 73 Total Cash Pool, a past date reads '
                      'model 205 Total Cash Pool for that date; blank when no snapshot exists.',
        'settings': {'scalar.field': 'Total Cash Pool'},
        'reconcile': 'Today equals question 47; a past date equals model 205 (built, verified).',
    },
    'cash.principal-selected': {
        'name': 'Principal outstanding · selected date', 'display': 'scalar', 'kind': 'native',
        'basis': 'snippet 4 Cash position source routing (models 205, 73)', 'origin': 207, 'params': ['position-date'],
        'definition': 'Native, same routing as question 207, selecting Outstanding Principal.',
        'settings': {'scalar.field': 'Outstanding Principal'},
        'reconcile': 'Today equals question 48; a past date equals model 205 (built, verified).',
    },
    # ---- Income ------------------------------------------------------------------------------------------
    'income.expenses': {
        'name': 'Expenses · statement period (positive)', 'display': 'scalar', 'kind': 'native',
        'basis': 'snippet 2 Income statement period', 'origin': 169, 'params': ['statement-period'],
        'definition': 'Question 169\'s query with the sign flipped, so the equation band reads "Income − Expenses = Net profit" '
                      'with the minus in the title and a positive magnitude in the card. Copies 169\'s template tags '
                      '(statement_period, #186, snippet 2) and mapping.',
        'sql': 'WITH statement AS ({{snippet: Income statement period}}) SELECT -"Operating Expenses" AS "Expenses" FROM statement',
        'settings': {'scalar.field': 'Expenses', 'column_settings': cols(['Expenses'])},
        'reconcile': 'Equals −(question 169) for the same Statement period.',
    },
    'income.vs-previous': {
        'name': 'This period and the previous period', 'display': 'table', 'kind': 'native',
        'basis': 'snippet 2 Income statement period (model 186 Income Events)', 'origin': 168, 'params': ['statement-period'],
        'definition': 'Native: for the selected statement period and the immediately preceding period of equal length, one row '
                      'per measure (Income, Expenses, Net profit, Net profit per day) with This period, Previous period, Change '
                      'and Change %. Previous period blank before the reporting calendar. Whole baht, one-decimal percent.',
        'settings': {'table.column_formatting': 'Change and Change % columns: positive green, negative red'},
        'reconcile': 'This period equals 168–171; previous equals them with the preceding range (built, verified).',
    },
    'income.monthly': {
        'name': 'Monthly income, expenses and net profit', 'display': 'bar', 'kind': 'mbql',
        'basis': 'model 186 Income Events', 'origin': 213, 'params': [],
        'definition': 'MBQL on model 186: sum Income, sum Expenses and sum (Income − Expenses) by Date month, the previous '
                      'five complete months plus the current month (partial). One shared y-axis so expenses read at true scale.',
        'settings': {'graph.dimensions': ['Date'], 'graph.metrics': ['Income', 'Expenses', 'Net profit'], 'graph.show_values': True,
                     'graph.y_axis.auto_split': False},
        'reconcile': 'Each month equals the model 186 month sums (built, verified).',
    },
    # ---- Cashflow ----------------------------------------------------------------------------------------
    'cashflow.by-type-row': {
        'name': 'Cash movement by transaction type · chart', 'display': 'row', 'kind': 'native',
        'basis': 'snippet 3 Cashflow statement period (same query as question 203)', 'origin': 203, 'params': ['statement-period', 'account'],
        'definition': 'Question 203\'s query wrapped: TOTAL row and rows with no movement removed, ordered by Money In + Money Out '
                      'descending. Horizontal bars of Money In (green) and Money Out (red), stacked (stackable.stack_type = stacked): on this '
                      'version Metabase folds unstacked row-chart categories into "Other (n)" regardless of graph.max_categories_enabled; '
                      'each type moves money one way, so stacking changes nothing visually.',
        'sql_wrap': 'SELECT * FROM (<203>) t WHERE t."Transaction Type"<>\'TOTAL\' AND (coalesce(t."Money In",0)<>0 OR coalesce(t."Money Out",0)<>0) '
                    'ORDER BY coalesce(t."Money In",0)+coalesce(t."Money Out",0) DESC,t."Transaction Type"',
        'settings': {'graph.dimensions': ['Transaction Type'], 'graph.metrics': ['Money In', 'Money Out'], 'graph.show_values': True,
                     'stackable.stack_type': 'stacked', 'graph.x_axis.title_enabled': False, 'graph.y_axis.title_enabled': False,
                     'series_settings': {'Money In': {'color': '#13855B'}, 'Money Out': {'color': '#D1495B'}}},
        'reconcile': 'Row set equals question 203 without TOTAL and zero rows, for three period/account cases.',
    },
    # ---- Performance -------------------------------------------------------------------------------------
    'perf.vs-previous': {
        'name': 'This period and the previous period', 'display': 'table', 'kind': 'native',
        'basis': 'models 71 Repayment Ledger and 70 Loan Book (pattern of questions 217–219)', 'origin': 217, 'params': ['period'],
        'definition': 'Native: for the selected Period and the preceding period of equal length, one row per measure: Gross '
                      'interest, Principal issued, Loans issued, Principal returned and Net principal deployed (issued − returned), '
                      'with This period, Previous period, Change and Change %. Same date rules as questions 217–219.',
        'settings': {'table.column_formatting': 'Change and Change % columns: positive green, negative red'},
        'reconcile': 'Rows 1–3 equal 217–219 (built, verified); row 5 equals question 234 for the same Period; previous equals the preceding range.',
    },
    # ---- Borrowers ---------------------------------------------------------------------------------------
    'borrowers.principal-top5': {
        'name': 'Principal outstanding by borrower · top five + others', 'display': 'row', 'kind': 'native',
        'basis': 'view reporting_borrower_directory_v1 (same query as question 285)', 'origin': 285, 'params': ['population'],
        'definition': 'Question 285\'s query with rank<=10 changed to rank<=5 (both occurrences) and the label '
                      '\'Others\' replaced by \'Others (\'||(SELECT count(*) FROM ranked WHERE rank>5)||\')\'. Template tag '
                      'population copied verbatim; maps `population` as 285 maps bp-population.',
        'settings': {'graph.dimensions': ['Borrower'], 'graph.metrics': ['Amount ฿'], 'graph.show_values': True, 'graph.show_legend': False,
                     'graph.label_value_formatting': 'full', 'graph.max_categories_enabled': False, 'graph.colors': [TEAL],
                     'graph.x_axis.title_enabled': False, 'graph.y_axis.title_enabled': False, 'copy_from_origin': ['click_behavior']},
        'reconcile': 'Sum of bars equals the sum of question 285\'s bars; the five named bars equal 285\'s first five, for two Population values.',
    },
    'borrowers.interest-top5': {
        'name': 'Interest received · period by borrower · top five + others', 'display': 'row', 'kind': 'native',
        'basis': 'function reporting_borrower_period_v1 (same query as question 286)', 'origin': 286, 'params': ['period', 'population'],
        'definition': 'Question 286\'s query with the same two edits as borrowers.principal-top5. Template tags period and '
                      'population copied verbatim; maps `period` and `population` as 286 maps bp-period and bp-population.',
        'settings': {'graph.dimensions': ['Borrower'], 'graph.metrics': ['Amount ฿'], 'graph.show_values': True, 'graph.show_legend': False,
                     'graph.label_value_formatting': 'full', 'graph.max_categories_enabled': False, 'graph.colors': ['#7472BE'],
                     'graph.x_axis.title_enabled': False, 'graph.y_axis.title_enabled': False, 'copy_from_origin': ['click_behavior']},
        'reconcile': 'Sum of bars equals the sum of question 286\'s bars; named bars equal 286\'s first five, for two Periods.',
    },
    # ---- Collection --------------------------------------------------------------------------------------
    'collection.people': {
        'name': 'People paid today · x of n', 'display': 'scalar', 'kind': 'native',
        'basis': 'model 162 Collection Status Summary', 'origin': 239, 'params': [],
        'definition': 'Text scalar "<fully paid> of <people with a status today> paid" from model 162 Borrower Count. '
                      'Replaces the percent card 239 with the prototype\'s wording.',
        'sql': "SELECT coalesce(sum(\"Borrower Count\") FILTER (WHERE \"Collection Status\"='Fully Paid'),0)||' of '||coalesce(sum(\"Borrower Count\"),0)||' paid' AS \"People paid\" FROM {{#162}}",
        'settings': {'scalar.field': 'People paid'},
        'reconcile': 'First number equals question 246; first ÷ second equals question 239.',
    },
    'collection.board': {
        'name': 'Collection board · lanes summary', 'display': 'table', 'kind': 'native',
        'basis': 'model 162 Collection Status Summary', 'origin': 242, 'params': [],
        'definition': 'One row per lane in board order (🔴 Not paid, 🟠 Partially paid, 🟣 Overdue, 🟢 Fully paid; all four '
                      'always present, zero when empty) plus one row per unexpected status (⚪), with People, Left ฿ and '
                      'Received ฿ from model 162, plus a hidden Tint column that drives an even row tint. Replaces the four count chips and the Unclassified card.',
        'sql': "WITH lanes(ord,status,label,tint) AS (VALUES (1,'Not Paid','🔴 Not paid','not_paid'),(2,'Partially Paid','🟠 Partially paid','partial'),(3,'Overdue','🟣 Overdue','overdue'),(4,'Fully Paid','🟢 Fully paid','paid')),\n"
               " rows AS (SELECT l.ord,l.label,l.tint,coalesce(s.\"Borrower Count\",0) people,coalesce(s.\"Amount Remaining\",0) remaining,coalesce(s.\"Receipts Today\",0) received FROM lanes l LEFT JOIN {{#162}} s ON s.\"Collection Status\"=l.status\n"
               " UNION ALL SELECT 9,'⚪ '||coalesce(s.\"Collection Status\",'Unclassified'),'',s.\"Borrower Count\",s.\"Amount Remaining\",s.\"Receipts Today\" FROM {{#162}} s WHERE s.\"Collection Status\" IS NULL OR s.\"Collection Status\" NOT IN ('Not Paid','Partially Paid','Overdue','Fully Paid'))\n"
               "SELECT label AS \"Lane\",people AS \"People\",remaining AS \"Left ฿\",received AS \"Received ฿\",tint AS \"Tint\" FROM rows ORDER BY ord,label",
        'settings': {'table.pivot': False, 'column_settings': cols(['Left ฿', 'Received ฿']),
                     'table.columns': [{'name': n, 'enabled': n != 'Tint'} for n in ['Lane', 'People', 'Left ฿', 'Received ฿', 'Tint']],
                     'table.column_formatting': [
                         {'id': 0, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'not_paid', 'color': STATUS['not_paid'], 'highlight_row': True},
                         {'id': 1, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'partial', 'color': STATUS['partial'], 'highlight_row': True},
                         {'id': 2, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'overdue', 'color': STATUS['overdue'], 'highlight_row': True},
                         {'id': 3, 'columns': ['Tint'], 'type': 'single', 'operator': '=', 'value': 'paid', 'color': STATUS['paid'], 'highlight_row': True}]},
        'reconcile': 'People per lane equal questions 242, 244, 240, 246; the ⚪ rows\' People sum equals question 251; Left ฿ per lane equals the sum of that lane table\'s Left column.',
    },
    'collection.lane-not-paid': lane('Not Paid', '🔴 Not paid', 'Amount Due', 'Due', 'Amount Remaining', 'Left', 'Amount Remaining', 243, STATUS['not_paid'], [80, 76, 76]),
    'collection.lane-partial': lane('Partially Paid', '🟠 Partially paid', 'Receipts Today', 'Paid', 'Amount Remaining', 'Left', 'Amount Remaining', 245, STATUS['partial'], [80, 76, 76]),
    'collection.lane-overdue': lane('Overdue', '🟣 Overdue', 'Overdue Amount', 'Overdue', 'Amount Remaining', 'Left', 'Overdue Amount', 241, STATUS['overdue'], [72, 90, 70]),
    'collection.lane-paid': lane('Fully Paid', '🟢 Fully paid', 'Receipts Today', 'Paid', 'Amount Due', 'Due', 'Receipts Today', 247, STATUS['paid'], [80, 76, 76]),
    # ---- Partners ----------------------------------------------------------------------------------------
    'partners.statement': {
        'name': 'Partner positions · statement', 'display': 'table', 'kind': 'native',
        'basis': 'model 318 Partners · position source (same query as question 330)', 'origin': 330, 'params': ['partner'],
        'definition': 'Question 330\'s query as a CTE, unpivoted to (Measure, Partner, Amount ฿) for the five statement measures '
                      'Net capital, Net earned to date, Completed payouts, Pending settlements, Net available; shown pivoted '
                      '(measures as rows, partners as columns) with table.pivot. Template tags partner and #318 copied; maps '
                      '`partner` as 330 maps pt-partner. If table.pivot does not render for a native result on this version, '
                      'the fallback is question 330 reused with columns limited to Partner and the five measures.',
        'sql_wrap': 'WITH p AS (<330>) SELECT m."Measure",p."Partner",m.amount AS "Amount ฿" FROM p CROSS JOIN LATERAL (VALUES '
                    '(1,\'Net capital ฿\',p."Net capital ฿"),(2,\'Net earned to date ฿\',p."Net earned ฿"),(3,\'Completed payouts ฿\',p."Paid ฿"),'
                    '(4,\'Pending settlements ฿\',p."Pending ฿"),(5,\'Net available ฿\',p."Net available ฿")) m(ord,"Measure",amount) ORDER BY m.ord,p."Partner"',
        'settings': {'table.pivot': True, 'table.pivot_column': 'Partner', 'table.cell_column': 'Amount ฿', 'column_settings': cols(['Amount ฿'])},
        'reconcile': 'Every (Measure, Partner) cell equals the matching column of question 330 for the same Partner filter.',
    },
    'partners.capital-share-row': {
        'name': 'Capital share · full pool', 'display': 'row', 'kind': 'native',
        'basis': 'model 318 Partners · position source (same query as question 331)', 'origin': 331, 'params': ['partner'],
        'definition': 'Question 331\'s query with Capital share % (each row\'s share of the rows) as the plotted value.',
        'settings': {'graph.show_values': True, 'graph.max_categories_enabled': False},
        'reconcile': 'Rows equal question 331 (built, verified).',
    },
}

# Placement-level column sets for wide reused tables (names are the saved question's result_metadata names).
COLUMNS_289 = {'order': ['Borrower', 'BCG Matrix category', 'Current health', 'Active loans', 'Principal ฿', 'Principal share',
                         'Interest ฿', 'Lifetime interest return', 'Last payment'],
               'hide': ['Borrower ID', 'Period start', 'Period end']}
COLUMNS_275 = {'order': ['Category', 'Borrower', 'Payment score /100', 'Contribution ×', 'Schedule'], 'hide': ['Borrower ID']}
COLUMNS_248 = {'order': ['Borrower', 'Daily Collection Status', 'Amount Remaining', 'Amount Due', 'Amount Collected', 'Receipts Today', 'Overdue Amount'],
               'hide': ['Borrower ID']}


# ---------------------------------------------------------------------------------------------------------
# Tabs. Each entry: key, name, purpose, filters, rows. A row is a list of cards placed left to right;
# a card is (ref, width, height[, options]); ref may be a list of (ref, height[, options]) stacked in one column.
# ---------------------------------------------------------------------------------------------------------
def T(text, w=GRID, h=1):
    return ('text:' + text, w, h)


def H(text, w=GRID, h=1):
    return ('heading:' + text, w, h)


def stack(w, *cards):
    return (list(cards), w, sum(c[1] for c in cards))


SERIES_BLUE = {'series_settings': {'COLUMN_2': {'color': BLUE}}, 'graph.colors': [BLUE]}

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
             (51, 6, 3, {'title': 'Interest this month'}),
             (237, 6, 3, {'title': 'Collected today'})],
            [('today.realization', 12, 3, {'title': 'Interest this month · of projection'}),
             ('today.collection-rate', 12, 3, {'title': 'Collected today · share of amount due'})],
            [('today.attention', 24, 6, {'title': 'Needs attention · rows open pages', 'description': 'Click a row to open Collection or Borrower Health.'})],
            [(62, 12, 7, {'title': 'Principal at work · daily close', 'vs': {'graph.show_goal': True, 'graph.goal_value': 120000, 'graph.goal_label': 'Principal reference 120,000', **SERIES_BLUE},
                          'note': 'goal line = principal reference 120,000; series blue (red is a status colour)'}),
             (222, 12, 7, {'title': 'Daily gross interest · 7-day average', 'vs': {'graph.show_goal': True, 'graph.goal_value': 10000, 'graph.goal_label': 'Daily interest goal 10,000'},
                           'note': 'goal line = daily interest goal 10,000'})],
            [('today.principal-top4', 12, 7, {'title': 'Principal by borrower · top 4 + others'}),
             ('today.interest-top4', 12, 7, {'title': 'Interest 30d by borrower · top 4 + rest'})],
            [T('Card descriptions hold the exact definitions. Profit means gross interest before expenses. Capital deployed gauge: Cash Position tab.', 24, 1)],
        ],
        'dropped': [47, 50, 52, 54, 55, 56, 57, 58, 59, 63, 64, 68, 60, 61, 240, 254, 242, 244, 270, 251],
        'phone': 'Eleven cards instead of eighteen: header, As of, four numbers, two meters, the attention strip (one card), '
                 'then the four charts, in this order. Metabase stacks one card per row below about 760 px, in grid order, '
                 'with fixed heights by display type; the prototype\'s phone order (Collected today first) and its '
                 'side-by-side pairs cannot be expressed, so the desktop order is the phone order.',
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
            [(211, 24, 6, {'title': 'Account balances · selected date', 'description': 'Signed balances; negative balances count.'})],
            [(202, 24, 7, {'title': 'Daily closing positions · completed days', 'params': ['period']})],
            [T('Unknown openings stay blank rather than showing current values. Source and freshness: Data health tab.', 24, 1)],
        ],
        'dropped': [47, 48, 209],
        'phone': 'Four numbers, gauge, holder chart, account table, trend, in that order; nothing to merge.',
    },
    {
        'key': 'income', 'name': 'Income', 'filters': ['statement-period'],
        'purpose': 'Income − expenses = net profit for the statement period, compared with the previous period and '
                   'the previous months, with expense categories and detail.',
        'replaces': '3 · Income Statement (tab 16)',
        'rows': [
            [T('**Income statement** · live, includes later corrections · daily chart from completed-day snapshots. Net profit = gross interest − expenses.', 24, 2)],
            [(168, 8, 3, {'title': 'Income · gross interest'}), ('income.expenses', 8, 3, {'title': '− Expenses'}),
             (170, 8, 3, {'title': '= Net profit'})],
            [('income.vs-previous', 16, 6, {'title': 'This period and the previous period', 'note': 'height fits the four measure rows'}),
             (171, 8, 6, {'title': 'Net profit per day · calendar days'})],
            [('income.monthly', 16, 8, {'title': 'Monthly income, expenses and net profit'}),
             (178, 8, 8, {'title': 'Expenses by category · this period'})],
            [(213, 24, 7, {'title': 'Daily income and expenses · snapshots'})],
            [(212, 24, 7, {'title': 'Expense detail · this period'})],
            [T('Per-day average uses calendar days in the period. Period freshness and snapshot coverage: Data health tab.', 24, 1)],
        ],
        'dropped': [184, 204, 214, 169],
        'phone': 'Equation band stacks vertically with the − and = in the titles; comparison table, per-day number, charts, tables.',
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
            [(203, 24, 10, {'title': 'Movement by transaction type · table', 'note': 'height fits all nine type rows'})],
            [(215, 24, 7, {'title': 'Daily cash movement · completed days', 'vs': {'graph.show_values': False}, 'note': 'value labels off: they overlapped'})],
            [(196, 24, 10, {'title': 'Transactions · chronological'})],
            [T('Statement date plus posting time. Repayments keep their recorded type. Freshness: Data health tab.', 24, 1)],
        ],
        'dropped': [198, 216],
        'phone': 'Equation band stacks; chart, type table, daily chart, transactions; tables scroll sideways (no phone column set exists in Metabase).',
    },
    {
        'key': 'performance', 'name': 'Performance', 'filters': ['period'],
        'purpose': 'Lending results for the period: interest, principal issued and returned, loans issued, cohort '
                   'return, with the daily and weekly trends.',
        'replaces': '5 · Performance (tab 18)',
        'rows': [
            [T('**Performance** · totals live · trends from completed-day snapshots · loan dates and interest dates both use Period.', 24, 2)],
            [(217, 6, 3, {'title': 'Gross interest'}), (218, 6, 3, {'title': 'Principal issued'}),
             (219, 6, 3, {'title': 'Loans issued'}), (235, 6, 3, {'title': 'Loan-cohort return'})],
            [('perf.vs-previous', 24, 7, {'title': 'This period and the previous period', 'note': 'five measure rows incl. Net principal deployed (formerly card 234)'})],
            [(223, 12, 7, {'title': 'Principal issued and returned · daily'}),
             (222, 12, 7, {'title': 'Daily gross interest · 7-day average', 'vs': {'graph.show_goal': True, 'graph.goal_value': 10000, 'graph.goal_label': 'Daily interest goal 10,000'}})],
            [H('Lending volume')],
            [(220, 8, 6, {'title': 'Gross interest by loan type'}), (224, 8, 6, {'title': 'Loans issued per day'}),
             (225, 8, 6, {'title': 'Average loan size · per week'})],
            [H('Returns')],
            [(232, 12, 6, {'title': 'Daily capital yield'}), (233, 12, 6, {'title': 'Weekly loan-cohort return'})],
            [(230, 12, 6, {'title': 'Cumulative gross interest · 7-day avg'}),
             (226, 12, 6, {'title': 'Active loans and borrowers · end of day'})],
            [(227, 24, 8, {'title': 'Daily performance · snapshots'})],
            [T('Principal counts once per loan. Snapshot coverage and rolling-average rules: Data health tab.', 24, 1)],
        ],
        'dropped': [221, 228, 231, 234],
        'phone': 'Four numbers (six columns each, so they stay uncompacted), the comparison table, then the charts in pairs order.',
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
            [('borrowers.principal-top5', 8, 8, {'title': 'Principal outstanding · top 5 + others', 'params': ['population']}),
             ('borrowers.interest-top5', 8, 8, {'title': 'Interest · period · top 5 + others'}),
             (314, 8, 8, {'title': 'Lifetime return · top 8'})],
            [H('Concentration & ageing')],
            [stack(6, (110, 3, {'title': 'Top three concentration'}), (111, 3, {'title': 'Past-due amount'})),
             (115, 9, 6, {'title': 'Active principal by age'}), (117, 9, 6, {'title': 'Default loss over time'})],
            [(114, 12, 6, {'title': 'Active loan count by age'}), (116, 12, 6, {'title': 'Borrower risk · excl. largest exposure'})],
            [(289, 24, 11, {'title': 'Borrower comparison · names open Detail', 'columns': COLUMNS_289,
                            'note': 'category and health columns first; sorted by principal (saved order)'})],
            [H('Activity over time')],
            [(287, 12, 7, {'title': 'Interest over time · top 5 + others'}),
             (288, 12, 7, {'title': 'First and repeat loans · weekly'})],
            [T('Gross interest before expenses. Categories come from Borrower Health. Lifetime daily rate (question 313) and the risk monitor (118) stay available as saved questions.', 24, 1)],
        ],
        'dropped': [282, 283, 284, 311, 312, 313, 315, 48, 81, 112, 113, 118, 285, 286],
        'phone': 'Four numbers, three ranked bars, concentration numbers and charts, comparison table (scrolls), activity charts.',
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
            [(275, 24, 9, {'title': 'Borrowers by category · scores', 'description': 'Payment score, contribution and schedule per borrower, sorted by category.', 'columns': COLUMNS_275,
                           'note': 'column order: Category, Borrower, Score, Contribution, Schedule, then detail; sorted by category'})],
            [H('Rating detail')],
            [(267, 24, 10, {'title': 'Payment health · all borrowers'})],
            [(269, 24, 6, {'title': 'Unavailable ratings and default context', 'hide_empty': True})],
            [(268, 24, 10, {'title': 'Reliability components and weights', 'description': 'Active borrowers: score components and the effective weights.'})],
            [(271, 24, 8, {'title': 'Schedule assessment · active borrowers'})],
            [(272, 24, 8, {'title': 'Modified schedules · loan and next plan', 'hide_empty': True})],
            [T('Rating: recent punctuality 45% · older punctuality 15% · average delay 15% · current payment health 25%; threshold 80; contribution boundary 1×. Full method in the dictionary.', 24, 2)],
        ],
        'dropped': [259, 261, 263, 265],
        'phone': 'Header, numbers, matrix, category counts, tables. Metabase gives the matrix iframe a fixed 6-unit height on a phone, '
                 'so it is small there; the chart service page it embeds stays the full-size view (impossible to change from the dashboard).',
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
            [(291, 8, 3, {'title': 'Current principal ฿'}), (370, 8, 3, {'title': 'Outstanding ฿'}),
             (371, 8, 3, {'title': 'Interest earned ฿'})],
            [(372, 8, 3, {'title': 'After coverage ฿'}), (373, 8, 3, {'title': 'Return %'}), (374, 8, 3, {'title': 'Coverage date'})],
            [H('Closed loans · lifetime')],
            [(375, 8, 3, {'title': 'Original principal ฿'}), (376, 8, 3, {'title': 'Interest earned ฿'}),
             (377, 8, 3, {'title': 'Return on closed loans'})],
            [(369, 24, 5, {'title': 'Last seven charge dates', 'description': 'Red = overdue, orange = paid late, green = on time.'})],
            [H('Activity · selected period')],
            [(296, 6, 3, {'title': 'Interest received ฿'}), (297, 6, 3, {'title': 'Principal issued ฿'}),
             (298, 6, 3, {'title': 'Principal returned ฿'}), (299, 6, 3, {'title': 'Loans issued'})],
            [(301, 12, 7, {'title': 'Principal issued and returned'}), (302, 12, 7, {'title': 'Interest received over time'})],
            [(303, 24, 8, {'title': 'Active loans and recorded next plan'})],
            [(308, 24, 7, {'title': 'All current overdue obligations'})],
            [(305, 24, 8, {'title': 'Loan history · lifetime'})],
            [(316, 24, 4, {'title': 'Payment punctuality · selected due dates'})],
            [(304, 24, 7, {'title': 'Punctuality over time · due month'})],
            [H('Records · selected period')],
            [(307, 24, 8, {'title': 'Obligation evidence · selected due dates'})],
            [(317, 24, 8, {'title': 'Payments · selected payment dates'})],
            [(306, 24, 8, {'title': 'Repayment allocations · payment dates'})],
            [H('Additional lending scenario · hypothetical only')],
            [(309, 24, 5, {'title': 'Additional lending · hypothetical only'})],
            [T('All amounts are baht. Allocations are not unique receipts; corrections remain signed. Context and dates: Data health tab.', 24, 1)],
        ],
        'dropped': [300],
        'phone': 'Profile first, then every number card one per row (30 visuals; Metabase cannot pair them), charge lights, tables that scroll. Select a borrower first; all cards are empty until then.',
    },
    {
        'key': 'collection', 'name': 'Collection', 'filters': ['collection-borrower', 'collection-status'],
        'purpose': 'Today\'s collection board: progress, the four status lanes, the detail table and today\'s charges.',
        'replaces': '10 · Collection Monitor (tab 19)',
        'rows': [
            [T('**Collection · Bangkok today** · live · payments appear after sync. Filters apply to the detail table only.', 18, 2),
             (257, 6, 2, {'title': 'As of · Bangkok'})],
            [(237, 6, 3, {'title': 'Collected today'}), (238, 6, 3, {'title': 'Left to collect'}),
             ('collection.people', 6, 3, {'title': 'People paid today'}), (252, 6, 3, {'title': "Today's charges · paid %"})],
            [('today.collection-rate', 24, 2, {'title': 'Collected today · share of amount due'})],
            [('collection.board', 24, 6, {'title': 'Board · people and baht per lane'})],
            [('collection.lane-not-paid', 6, 9, {'title': '🔴 Not paid', 'note': 'Due ฿ · Left ฿, sorted by amount left'}),
             ('collection.lane-partial', 6, 9, {'title': '🟠 Partially paid', 'note': 'Received ฿ · Left ฿, sorted by amount left'}),
             ('collection.lane-overdue', 6, 9, {'title': '🟣 Overdue', 'note': 'Overdue ฿ · Left ฿, sorted by overdue amount'}),
             ('collection.lane-paid', 6, 9, {'title': '🟢 Fully paid', 'note': 'Received ฿ · Due ฿, sorted by received'})],
            [(248, 24, 10, {'title': 'Collection detail · filters apply here', 'columns': COLUMNS_248})],
            [(249, 24, 4, {'title': 'Charges dated today · not board balances', 'description': 'Charges dated today are a separate drill-down, not board balances.'})],
            [(64, 24, 6, {'title': 'Overdue charges · completed days', 'params': []})],
            [T('Received = receipts today. Left includes older dues. A payment today can still leave someone Overdue; people move lanes after refresh.', 24, 1)],
        ],
        'dropped': [250, 239, 242, 244, 240, 246, 251, 243, 245, 241, 247],
        'phone': 'Fourteen cards instead of eighteen: As of, four numbers, the meter, the board strip, the four lanes in the order '
                 'Not paid, Partially paid, Overdue, Fully paid, the detail table, charges today, the overdue trend. The lane '
                 'tables carry three visible columns so they fit a phone without a phone-specific column set.',
    },
    {
        'key': 'partners', 'name': 'Partners', 'filters': ['partner', 'statement-period', 'settlement-status'],
        'purpose': 'Each partner\'s capital, earnings, payouts, pending settlements and net available, the activity '
                   'in the period and the ledgers.',
        'replaces': '11 · Partners (tab 249)',
        'rows': [
            [T('**Partners** · current balances stay current when the period changes · baht · net available is an entitlement after reservations, not cash on hand.', 24, 2)],
            [(325, 6, 3, {'title': 'Net capital ฿'}), (326, 6, 3, {'title': 'Net earned to date ฿'}),
             (327, 6, 3, {'title': 'Completed payouts ฿'}), (329, 6, 3, {'title': 'Net available ฿'})],
            [('partners.statement', 16, 7, {'title': 'Partner positions · statement', 'note': 'pending settlements per partner sit here and in the table below'}),
             ('partners.capital-share-row', 8, 7, {'title': 'Capital share · full pool'})],
            [(340, 24, 6, {'title': 'Pending settlements · all dates', 'hide_empty': True})],
            [H('Activity · statement period')],
            [(333, 6, 3, {'title': 'Allocated interest ฿'}), (334, 6, 3, {'title': 'Allocated expenses ฿'}),
             (335, 6, 3, {'title': 'Net earned ฿'}), (336, 6, 3, {'title': 'Payouts in period ฿'})],
            [(337, 12, 8, {'title': 'Monthly net earned versus paid'}), (338, 12, 8, {'title': 'Capital contributions and withdrawals'})],
            [(339, 24, 8, {'title': 'Net contributed capital over time'})],
            [H('Ledgers · statement period')],
            [(341, 24, 8, {'title': 'Capital transaction ledger', 'hide_empty': True})],
            [(342, 24, 8, {'title': 'Settlement transaction ledger', 'hide_empty': True})],
            [T('Capital withdrawals and profit payouts are separate. Calculation and source checks: Data health tab.', 24, 1)],
        ],
        'dropped': [331, 332, 343, 328, 330],
        'phone': 'Four numbers (six columns each so 7-digit baht stay uncompacted), the statement table, share chart, then activity; empty ledgers are hidden.',
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
            [(348, 6, 3, {'title': 'Interest · month to date'}), (349, 6, 3, {'title': 'Remaining · scenario'}),
             (350, 6, 3, {'title': 'Month-end outlook'}), (351, 6, 3, {'title': 'Target gap'})],
            [(356, 16, 9, {'title': 'Cumulative interest · actual + projected'}),
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
        'phone': 'Assumptions, four numbers, cumulative chart first among charts, watchlist, plan numbers, inputs above the bridge; one card per row.',
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
            [(231, 24, 4, {'title': 'Rolling-average coverage'})],
            [H('Borrowers and Borrower Detail')], [(284, 12, 4, {'title': 'Period, population and source'}), (315, 12, 4, {'title': 'Overall charts · dates and availability'})],
            [(300, 24, 5, {'title': 'Activity dates and lifetime context'})],
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
# card's default); questions 202 and 222 keep their own mappings where they have any; the Collection lanes and
# board map nothing. A new question copied from an origin maps the origin's template tags under the new filter ids.

PHONE_MODEL = ('Metabase renders one column below about 760 px: every card full width, in grid order (row, then column), '
               'with a fixed height per display type (numbers and text about 4 units, tables, charts and iframes 6). '
               'There is no per-device layout, no side-by-side pair and no phone column set; the design therefore reduces '
               'card counts on the daily pages (Today, Collection) and keeps the desktop order as the phone order.')


def place(ref, w, h, opt, row, col, p_list, all_refs, tab):
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
        assert ref in NEW_QUESTIONS, ref
        p['new_question'] = ref
    for key in ('title', 'description', 'note', 'vs', 'columns'):
        if key in opt:
            p[key] = opt[key]
    if opt.get('hide_empty'):
        p['hide_empty'] = True
    p['params'] = opt.get('params', [f for f in tab['filters']] if not p.get('virtual') else [])
    p_list.append(p)
    all_refs.append(ref)


def validate(placements, tab_key):
    cells = {}
    for p in placements:
        assert 0 < p['size_x'] <= GRID and p['col'] + p['size_x'] <= GRID, (tab_key, p)
        for r in range(p['row'], p['row'] + p['size_y']):
            for c in range(p['col'], p['col'] + p['size_x']):
                assert (r, c) not in cells, f"overlap on {tab_key} at row {r} col {c}: {cells[(r, c)]} vs {p}"
                cells[(r, c)] = p.get('reuse_card_id') or p.get('new_question') or p.get('virtual') or 'iframe'


def md_cell(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')


def build():
    layout = {'dashboard': DASHBOARD, 'parameters': PARAMETERS, 'new_questions': NEW_QUESTIONS, 'phone_model': PHONE_MODEL, 'tabs': []}
    md = ['\n' + PHONE_MODEL + '\n', '\n### Filters\n', '| Id | Name | Type | Default | Replaces on dashboard 3 | Values |', '| --- | --- | --- | --- | --- | --- |']
    for p in PARAMETERS:
        vs = p.get('values_source')
        vs = ('card ' + str(vs['card_id'])) if isinstance(vs, dict) else ('copy static list' if vs == 'copy' else '')
        md.append(f"| `{p['id']}` | {p['name']} | {p['type']} | {p.get('default')} | {', '.join(p['replaces'])} | {vs} |")
    md += ['\n### New questions\n', '| Key | Name | Display | Origin | Basis | Filters | Definition | Reconciliation |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for k, q in NEW_QUESTIONS.items():
        md.append(f"| `{k}` | {q['name']} | {q['display']} | q{q['origin']} | {md_cell(q['basis'])} | {', '.join(q['params']) or 'none'} | {md_cell(q['definition'])} | {md_cell(q.get('reconcile', ''))} |")
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
                if isinstance(ref, list):  # vertical stack in one column
                    r = row
                    for sub in ref:
                        sopt = sub[2] if len(sub) > 2 else {}
                        place(sub[0], w, sub[1], sopt, r, col, placements, all_refs, tab)
                        r += sub[1]
                else:
                    place(ref, w, h, opt, row, col, placements, all_refs, tab)
                col += w
                height = max(height, h)
            row += height
        validate(placements, tab['key'])
        layout['tabs'].append({'key': tab['key'], 'name': tab['name'], 'position': ti, 'filters': tab['filters'],
                               'placements': placements, 'height_rows': row,
                               'dropped_from_dashboard_3': tab['dropped']})
        # Markdown
        md.append(f"\n### {ti + 1} · {tab['name']} (`{tab['key']}`)\n")
        md.append(f"Replaces: {tab['replaces']}. Filters: {', '.join('`' + f + '`' for f in tab['filters']) or 'none'}. "
                  f"Height {row} grid rows, {len(placements)} placements "
                  f"({sum(1 for p in placements if not p.get('virtual'))} visuals).\n")
        md.append(tab['purpose'] + '\n')
        md.append('| Row/col | Size | Source | Title on the page | Placement settings | Notes |\n| --- | --- | --- | --- | --- | --- |')
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
            settings = []
            if 'vs' in p:
                settings.append('vs ' + ', '.join(f"{k}={v}" for k, v in p['vs'].items() if k != 'series_settings'))
            if 'columns' in p:
                settings.append('columns ' + ' › '.join(p['columns']['order']) + ('; hide ' + ', '.join(p['columns']['hide']) if p['columns'].get('hide') else ''))
            if p.get('hide_empty'):
                settings.append('hide when empty')
            if 'params' in p and not p.get('virtual') and p['params'] != tab['filters']:
                settings.append('filters ' + (', '.join(p['params']) or 'none'))
            md.append(f"| {p['row']}/{p['col']} | {p['size_x']}×{p['size_y']} | {src} | {md_cell(title)} | {md_cell('; '.join(settings))} | {md_cell(p.get('note', ''))} |")
        md.append(f"\nDropped from dashboard 3 (or replaced by a new question): {', '.join('q' + str(d) for d in tab['dropped']) or 'none'} "
                  f"(the saved questions are kept; nothing is deleted).\n\nPhone: {tab['phone']}\n")
    reused = sorted({r for r in all_refs if isinstance(r, int)})
    new = sorted({r for r in all_refs if isinstance(r, str) and not r.startswith(('text:', 'heading:', 'iframe:'))})
    unused = sorted(set(NEW_QUESTIONS) - set(new))
    assert not unused, f'new questions defined but never placed: {unused}'
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
    text = re.sub(re.escape(start) + '.*?' + re.escape(end), lambda m: start + summary + generated + '\n' + end, text, flags=re.S)
    open(design, 'w', encoding='utf-8').write(text)
    print(json.dumps(layout['summary']))


if __name__ == '__main__':
    build()
