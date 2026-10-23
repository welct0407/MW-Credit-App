"""Build the Partner conversation schema digest from the maintained data dictionary.

Reads project/Documents/Data Dictionary/systems/postgresql/{relations,routines}/*.yaml (no database access)
and writes src/mw_integration_agent/assets/schema-digest.json: every relation in schemas public and agent_audit
with its kind, comment and columns (name, type, comment), and the allow-listed business functions as
{function: schema.name(args), result, kind, volatility, purpose, use_when, comment (at most 200 characters)}.
Owner (R085): expose all business related functions and keep the other write functions away; every routine is
classified (ALLOWED, a trigger, EXCLUDED_PREFIXES or EXCLUDED_NAMES) and an unclassified one fails the build.

Stdlib only: the dictionary files use a small, fixed YAML subset (the dictionary Dumper writes every
string double-quoted or as a block literal), parsed by `load` below. Run from any directory:

    python integration-agent/scripts/build-schema-digest.py          # write the asset
    python integration-agent/scripts/build-schema-digest.py --check  # exit 1 when the asset is stale
"""
import argparse
import fnmatch
import json
import re
import sys
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
REPOSITORY = AGENT.parent
DICTIONARY = REPOSITORY / 'project' / 'Documents' / 'Data Dictionary' / 'systems' / 'postgresql'
OUTPUT = AGENT / 'src' / 'mw_integration_agent' / 'assets' / 'schema-digest.json'
KINDS = {'r': 'table', 'v': 'view', 'm': 'materialized view', 'p': 'partitioned table', 'f': 'foreign table'}
ROUTINE_KINDS = {'f': 'function', 'p': 'procedure', 'a': 'aggregate', 'w': 'window'}
SCHEMAS = ('public', 'agent_audit')
TRIGGER_RESULTS = ('trigger', 'event_trigger')
COMMENT_LIMIT = 200
# R090: the in-app chat journal (V104) is closed to every SQL role of the agent and of the chat service; it stays out of the digest.
EXCLUDED_RELATION_PREFIXES = ('pwa_chat_',)


class YamlSubsetError(ValueError):
    pass


ESCAPES = {'0': '\0', 'a': '\a', 'b': '\b', 't': '\t', '\t': '\t', 'n': '\n', 'v': '\v', 'f': '\f',
           'r': '\r', 'e': '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', 'N': '\x85', '_': '\xa0',
           'L': ' ', 'P': ' '}
HEX = {'x': 2, 'u': 4, 'U': 8}


def _quoted(lines, row, column):
    """A double-quoted scalar starting at lines[row][column] == '"'. Returns (value, row, column after)."""
    out, protected = [], 0
    line, i = lines[row], column + 1
    while True:
        if i >= len(line):
            # Unescaped line break: fold (trailing unescaped blanks dropped; empty lines become newlines).
            while len(out) > protected and out[-1] in ' \t':
                out.pop()
            row += 1
            if row >= len(lines):
                raise YamlSubsetError('unterminated double-quoted scalar')
            empty = 0
            while not lines[row].strip():
                empty += 1
                row += 1
                if row >= len(lines):
                    raise YamlSubsetError('unterminated double-quoted scalar')
            out.extend('\n' * empty if empty else ' ')
            line = lines[row]
            i = len(line) - len(line.lstrip(' \t'))
            continue
        char = line[i]
        if char == '"':
            return ''.join(out), row, i + 1
        if char != '\\':
            out.append(char)
            i += 1
            continue
        if i + 1 >= len(line):
            # Escaped line break: join without a space, leading blanks of the next line dropped.
            row += 1
            if row >= len(lines):
                raise YamlSubsetError('unterminated double-quoted scalar')
            line = lines[row]
            i = len(line) - len(line.lstrip(' \t'))
            continue
        code = line[i + 1]
        if code in HEX:
            digits = line[i + 2:i + 2 + HEX[code]]
            if len(digits) != HEX[code] or not re.fullmatch(r'[0-9A-Fa-f]+', digits):
                raise YamlSubsetError('invalid escape')
            out.append(chr(int(digits, 16)))
            i += 2 + HEX[code]
        elif code in ESCAPES:
            out.append(ESCAPES[code])
            i += 2
        else:
            raise YamlSubsetError('invalid escape')
        protected = len(out)


def _plain(text):
    if text in ('null', '~', ''):
        return None
    if text in ('true', 'false'):
        return text == 'true'
    if text == '{}':
        return {}
    if text == '[]':
        return []
    if re.fullmatch(r'[-+]?[0-9]+', text):
        return int(text)
    if re.fullmatch(r'[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?', text):
        return float(text)
    raise YamlSubsetError('unsupported plain scalar: ' + text[:40])


def _indent(line):
    return len(line) - len(line.lstrip(' '))


def _skip(lines, row):
    while row < len(lines) and not lines[row].strip():
        row += 1
    return row


def _literal(lines, row, header, parent):
    """Block literal after `|` header on the previous line; parent is the owning node's indentation."""
    match = re.fullmatch(r'\|([1-9]?)([-+]?)|\|([-+])([1-9])', header)
    if not match:
        raise YamlSubsetError('unsupported block scalar header')
    digit = match.group(1) or match.group(4)
    chomp = match.group(2) or match.group(3) or ''
    body = []
    if digit:
        indent = parent + int(digit)
    else:
        first = _skip(lines, row)
        indent = _indent(lines[first]) if first < len(lines) else parent + 1
    while row < len(lines) and (not lines[row].strip() or _indent(lines[row]) >= indent):
        body.append(lines[row][indent:] if lines[row].strip() else '')
        row += 1
    text = '\n'.join(body)
    if chomp == '-':
        text = text.rstrip('\n')
    elif chomp == '+':
        text += '\n'
    else:
        text = text.rstrip('\n') + '\n' if text.strip('\n') else ''
    # Trailing empty lines belong to the block only under keep chomping; give them back otherwise.
    return text, row


def _value(lines, row, rest, column, owner):
    """The value that follows a key or '- ' (rest is the remaining text of the line)."""
    stripped = rest.strip()
    if stripped.startswith('"'):
        offset = len(rest) - len(rest.lstrip(' '))
        value, end_row, end = _quoted(lines, row, column + offset)
        if lines[end_row][end:].strip():
            raise YamlSubsetError('text after quoted scalar')
        return value, end_row + 1
    if stripped.startswith('|'):
        return _literal(lines, row + 1, stripped, owner)
    if stripped:
        return _plain(stripped), row + 1
    nxt = _skip(lines, row + 1)
    if nxt >= len(lines):
        return None, nxt
    child = _indent(lines[nxt])
    if child > owner or (child == owner and lines[nxt].lstrip().startswith('- ')):
        return _block(lines, nxt, child)
    return None, row + 1


def _block(lines, row, indent):
    row = _skip(lines, row)
    if lines[row][indent:].startswith('- ') or lines[row][indent:] == '-':
        items = []
        while row < len(lines) and _indent(lines[row]) == indent and lines[row][indent:indent + 1] == '-':
            text = lines[row][indent + 1:]
            if text.lstrip().startswith('"') and re.match(r'\s*"(?:[^"\\]|\\.)*"\s*:(?:\s|$)', text):
                # A mapping inside a sequence item: its keys sit at indent + 2.
                pad = indent + 1 + (len(text) - len(text.lstrip(' ')))
                synthetic = lines[:row] + [' ' * pad + text.lstrip(' ')] + lines[row + 1:]
                value, row = _mapping(synthetic, row, pad)
            else:
                value, row = _value(lines, row, text, indent + 1, indent)
            items.append(value)
            row = _skip(lines, row)
        return items, row
    return _mapping(lines, row, indent)


def _mapping(lines, row, indent):
    result = {}
    while row < len(lines):
        row = _skip(lines, row)
        if row >= len(lines) or _indent(lines[row]) < indent:
            break
        if _indent(lines[row]) > indent or not lines[row][indent:].startswith('"'):
            if lines[row][indent:].startswith('- '):
                break
            raise YamlSubsetError(f'unexpected line {row + 1}')
        key, key_row, end = _quoted(lines, row, indent)
        if key_row != row or lines[row][end:end + 1] != ':':
            raise YamlSubsetError(f'expected key on line {row + 1}')
        if key in result:
            raise YamlSubsetError('duplicate key ' + key)
        result[key], row = _value(lines, row, lines[row][end + 1:], end + 1, indent)
    return result, row


def load(text):
    """Parse the dictionary YAML subset into Python values."""
    lines = text.split('\n')
    row = _skip(lines, 0)
    if row >= len(lines):
        return None
    value, row = _block(lines, row, 0)
    if _skip(lines, row) < len(lines):
        raise YamlSubsetError(f'unparsed content at line {row + 1}')
    return value


def qualified(schema, name):
    quote = (lambda x: x if re.fullmatch(r'[a-z_][a-z0-9_]*', x) else '"' + x.replace('"', '""') + '"')
    return quote(schema) + '.' + quote(name)


def relation_entry(document):
    content = document['content']
    definition = content['definition']
    if definition['schema'] not in SCHEMAS:
        return None
    if definition['schema'] == 'public' and definition['name'].startswith(EXCLUDED_RELATION_PREFIXES):
        return None
    columns = sorted((content.get('columns') or {}).values(), key=lambda c: c['ordinal'])
    entry = {'relation': qualified(definition['schema'], definition['name']),
             'kind': KINDS.get(definition['kind'], definition['kind'])}
    if definition.get('comment'):
        entry['comment'] = definition['comment']
    # Null comments are omitted: the digest goes into every model request.
    entry['columns'] = [{'name': c['name'], 'type': c['data_type'], **({'comment': c['comment']} if c.get('comment') else {})}
                        for c in columns]
    return entry


# Owner (R085): "expose all business related functions, and keep other write functions away". Archie's
# classification of every dictionary routine: exactly these are listed, each with what it is for and when to
# call it; everything else is a trigger, an excluded prefix or an excluded name below, and the build fails
# on a routine that is none of these.
ALLOWED = {
    'public.loan_close_calculation_v83(p_loan text, p_day date)': (
        "The system's Loan Close calculation for an open, auto-enabled Daily Interest loan on p_day (amount, allocations, "
        'mutation, planHash); raises P0001 for any other loan.',
        'Cross-checking the charge-balance payoff (business rules section 6) through the loan_payoff tool; call '
        'directly only for a date other than today.'),
    'public.loan_close_calculation_v83(p_loan text, p_day date, p_exclude_payment text)': (
        'The same payoff computed as if closing payment p_exclude_payment did not exist (correction preview).',
        '"What would the payoff have been without payment X".'),
    'public.first_day_components_v83(l "Loans")': (
        'First-day charge split (principal share; interest incl. transfer fee) for a Loans row; empty if none.',
        'Explaining the net-off at disbursement: SELECT * FROM "Loans" l, public.first_day_components_v83(l).'),
    'public.original_daily_interest_rate(p "Loans", historical boolean)': (
        'Whole-percent daily rate frozen at creation (historical=true reconstructs it from the note or first '
        'charge); NULL without evidence.',
        'Explaining why the daily amount changed after a principal payment.'),
    'public.vc_daily_interest(p "Loans")': (
        'Current daily interest earned by an open auto-charged loan (Daily: the daily amount; Installment: '
        'interest share per day; else 0).',
        '"Interest per day" for a loan or a borrower total.'),
    'public.daily_interest_basis(p_arrangement text)': (
        'Parses [daily, principal] from a loan\'s "Loan Arrangement" note.',
        'Only for an old loan\'s original basis.'),
    'public.daily_interest_basis_note(p_basis numeric[])': (
        'Renders a basis as the standard note.', 'Rarely; formatting only.'),
    'public.vc_charge_values(p "Charges")': (
        'A charge\'s paid and remaining principal/interest, repayment count, status and last paid date, computed '
        'from repayments.',
        'Cross-checking trigger balances; usually the Charges columns suffice.'),
    'public.vc_borrower_values(p_id text)': (
        'One borrower row: interest received, principal lent, loan count, outstanding principal, interest on open '
        'loans, daily interest, has closed/open loans.',
        'A one-call borrower summary when olap_borrowers_analytics is more than needed.'),
    'public.payment_charge_balances(p_id text)': (
        'The charges a Payments row is eligible to pay under its allocation method, with remaining '
        'principal/interest.',
        '"Why did payment X pay these charges" or previewing a Processing payment.'),
    'public.selected_charge_ids(value text)': (
        'Decodes a "Selected Charge IDs" list.', 'Joining Selected Charges payments to charges.'),
    'public.payment_inputs(p "Payments")': (
        'A payment\'s financial inputs as an array.', 'Comparing a payment before/after a correction.'),
    'public.pwa_effective_payment_plan_v2(p_id text)': (
        'The per-charge plan the app posted for payment p_id; NULL when none.',
        '"How was this app payment split across charges".'),
    'public.pwa_plan_effects_v83(lines jsonb)': (
        'Normalises plan lines.', 'Only with pwa_effective_payment_plan_v2.'),
    'public.forecast_schedule_v1(l jsonb, charges jsonb, t date, e date)': (
        'Simulates a loan\'s due dates and amounts from t to e (at most 93 days), recorded vs projected, with '
        'issues.',
        'Prefer oltp_upcoming_charge_events_v1 or reporting_forecast_events_v1, which call it; use directly only '
        'for a non-today window.'),
    'public.forecast_scenario_v1(ui numeric, up numeric, oi numeric, op numeric, ci numeric, cp numeric, rr numeric, scenario text)': (
        'Planning/Schedule/Stress projection of remaining interest and principal from the '
        'reporting_forecast_loans_v1 columns ui, up, oi, op and collection percentages.',
        '"What if only N% is collected".'),
    'public.pwa_assessment_refresh_window_v2(start_day date, end_day date, as_of date)': (
        'Clamps an assessment window to valid dates.', 'Rarely.'),
    'public.reporting_borrower_period_v1(p_start date, p_end date, p_population text)': (
        'Per-borrower facts for a Bangkok date range (principal issued/returned, interest received, loans issued, '
        'first vs repeat, shares, ranks); p_population defaults to \'All with loan history\'.',
        'Period rankings, e.g. "who paid most interest in September".'),
    'public.reporting_cash_period(p_from date, p_to date, p_scope text)': (
        'Cash-account period totals; p_scope is a "Cash Accounts"."Row ID" or \'__ALL__\'.',
        '"Cash in/out for account X this month".'),
    'public.reporting_cash_period_entries(p_from date, p_to date, p_scope text)': (
        'The transactions behind reporting_cash_period, with running balances.', 'Listing cash movements.'),
    'public.partner_net_profit(p_partner text)': (
        'A Partner\'s net profit to date (interest share minus expense share).',
        '"How much has Tommy/Lisa earned"; pair with reporting_partner_position_v1.'),
    'public.partner_pool_share_at_date(p_date date, p_role text)': (
        'A Partner role\'s (A/B) capital share of the pool on a date; raises if the pool is not positive.',
        'Explaining an expense or profit split on a date.'),
    'public.fifo_current_month_settled(prior_net numeric, month_net numeric, completed numeric)': (
        'How much of this month\'s net profit counts as settled under FIFO.', 'Partner settlement questions only.'),
    'public.olap_reporting_date()': (
        'Today in Bangkok as the reporting date.', 'Every "as of today" filter.'),
    'public.analytics_history_start()': (
        'The earliest business date in the data.', '"Since when do we have records".'),
    'public.default_cash_account(p_holder text)': (
        'A cash holder\'s active default account id.', 'Which account receives by default.'),
    'public.receiving_cash_account(p_borrower text)': (
        'The account a borrower should pay into.', '"Where should borrower X transfer".'),
    'public.pwa_cash_opening_basis_v2(p_holder text)': (
        'A holder\'s current balance and per-account balances.',
        'Current cash held by Tommy/Lisa (or "Cash Account Balances").'),
}
# Command, notification, job, refresh and audit machinery; the allow-list above overrides a prefix.
EXCLUDED_PREFIXES = ('public.pwa_', 'public.vc_refresh_', 'public.r051_', 'agent_audit.', 'assessment_lab.')
# Writers outside those prefixes (fnmatch on the bare function name), each with its reason.
EXCLUDED_NAMES = {
    'apply_loan_close_calculation_v83': 'posts the loan close',
    'apply_principal_daily_interest': 'rewrites a Loans row during a principal payment',
    'close_payment_loans': 'closes loans after a payment',
    'create_first_day_charge': 'inserts the first-day charge',
    'create_referral_rebate': 'inserts the referral rebate expense',
    'first_day_receipt': 'posts the first-day net-off receipt',
    'generate_due_charges': 'inserts due charges',
    'generate_loan_charge': 'inserts a loan charge',
    'initialize_cash_accounts': 'creates cash accounts and openings',
    'move_payment_interest': 'moves a payment allocation',
    'payment_crud_*_core_v83': 'payment correction core (writes allocations and repayments)',
    'post_loan_default': 'posts a default loss',
    'post_payment*': 'posts payments',
    'recalculate_business_expenses_from_date': 'rewrites expense allocations',
    'refresh_daily_analytics': 'rewrites the Daily Analytics snapshot',
    'refresh_daily_analytics_scoped': 'rewrites the Daily Analytics snapshot',
    'request_business_history': 'queues a history refresh',
    'sync_cash_ledger': 'writes the cash ledger',
    'undo_loan_default': 'reverses a default',
    'cash_account_holder': 'locks with FOR SHARE, which the read-only transaction rejects',
    'attach_payment_receipt_evidence': 'writes receipt evidence onto a payment',
}
VOLATILITY = {'i': 'IMMUTABLE', 's': 'STABLE', 'v': 'VOLATILE'}


class UnclassifiedRoutine(ValueError):
    pass


def classify(name, result):
    """'trigger', 'allowed' or 'excluded' for a routine signature; None when it is unclassified."""
    if result in TRIGGER_RESULTS:
        return 'trigger'
    if name in ALLOWED:
        return 'allowed'
    bare = name.split('(', 1)[0]
    if bare.startswith(EXCLUDED_PREFIXES):
        return 'excluded'
    if any(fnmatch.fnmatchcase(bare.split('.', 1)[1], pattern) for pattern in EXCLUDED_NAMES):
        return 'excluded'
    return None


def routine_facts(document):
    """(signature, result, kind, volatility, comment) of one dictionary routine.

    A few entries carry only the CREATE statement as text; their name comes from the identity and their result
    and volatility from the statement.
    """
    name = document['identity']['name']
    definition = document['content']['definition']
    if isinstance(definition, str):
        returns = re.search(r'\bRETURNS\s+(.+?)\n', definition)
        result = returns.group(1).strip() if returns else None
        kind = 'procedure' if re.match(r'\s*CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\b', definition, re.I) else 'function'
        volatility = next((v for v in ('IMMUTABLE', 'STABLE') if re.search(r'\b' + v + r'\b', definition)), 'VOLATILE')
        return name, result, kind, volatility, None
    return (name, definition.get('result'), ROUTINE_KINDS.get(definition.get('kind'), 'function'),
            VOLATILITY.get(definition.get('volatility'), 'VOLATILE'), definition.get('comment'))


def routine_entry(document):
    """The digest entry of an allow-listed routine, None for a trigger or excluded one; fails when unclassified."""
    name, result, kind, volatility, comment = routine_facts(document)
    category = classify(name, result)
    if category is None:
        raise UnclassifiedRoutine('routine is neither allow-listed, a trigger nor excluded: ' + name)
    if category != 'allowed':
        return None
    purpose, use_when = ALLOWED[name]
    entry = {'function': name, 'result': result, 'kind': kind, 'volatility': volatility,
             'purpose': purpose, 'use_when': use_when}
    if comment:
        entry['comment'] = comment[:COMMENT_LIMIT]
    return entry


def build():
    relations, functions = [], []
    for path in sorted((DICTIONARY / 'relations').glob('*.yaml')):
        entry = relation_entry(load(path.read_text(encoding='utf-8')))
        if entry:
            relations.append(entry)
    for path in sorted((DICTIONARY / 'routines').glob('*.yaml')):
        entry = routine_entry(load(path.read_text(encoding='utf-8')))
        if entry:
            functions.append(entry)
    missing = set(ALLOWED) - {f['function'] for f in functions}
    if missing:
        raise UnclassifiedRoutine('allow-listed routine missing from the dictionary: ' + ', '.join(sorted(missing)))
    relations.sort(key=lambda r: r['relation'])
    functions.sort(key=lambda f: f['function'])
    return {'format': 1,
            'source': 'project/Documents/Data Dictionary/systems/postgresql (relations in public and agent_audit; '
                      'the allow-listed business functions)',
            'notes': 'PostgreSQL 18, search_path pg_catalog, public; quote mixed-case identifiers exactly as written '
                     '("Loans"."Row ID"). Business dates are Asia/Bangkok. Call only the functions listed here; '
                     'anything that modifies data fails in the read-only transaction.',
            'relations': relations,
            'functions': functions}


def render(value):
    """Compact JSON with one function and one relation per line (small for the prompt, readable in a diff)."""
    compact = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    head = {k: v for k, v in value.items() if k not in ('relations', 'functions')}
    lines = [compact(head)[:-1] + ',"functions":[']
    lines += [compact(f) + (',' if i < len(value['functions']) - 1 else '') for i, f in enumerate(value['functions'])]
    lines += ['],"relations":[']
    lines += [compact(r) + (',' if i < len(value['relations']) - 1 else '') for i, r in enumerate(value['relations'])]
    return '\n'.join(lines) + '\n]}\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--check', action='store_true', help='exit 1 when the asset differs from a fresh build')
    args = parser.parse_args(argv)
    text = render(build())
    if args.check:
        current = OUTPUT.read_text(encoding='utf-8') if OUTPUT.exists() else ''
        if current != text:
            print('schema digest is stale: run integration-agent/scripts/build-schema-digest.py', file=sys.stderr)
            return 1
        return 0
    OUTPUT.write_text(text, encoding='utf-8')
    value = json.loads(text)
    print(json.dumps({'relations': len(value['relations']), 'columns': sum(len(r['columns']) for r in value['relations']),
                      'functions': len(value['functions']), 'bytes': len(text.encode())}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
