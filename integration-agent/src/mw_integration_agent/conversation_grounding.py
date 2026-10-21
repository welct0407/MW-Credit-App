"""Numeric grounding of a partner reply (R088): every amount in finish.message must come from this turn.

Pure module: no I/O, no clock other than the elapsed-time measurement. ConversationTools.dispatch calls
check() in the finish branch, after the length gate and before authorize(), for every provider; CLARIFY and
REFUSE finishes are not checked (they may quote a figure from the earlier conversation in a question).

A candidate is a money amount or a rate in any written form: ฿12,345, -฿1,500, 9,999฿, THB 9,999, 12,345 บาท,
9,999 บ., baht, a k/K/M/พัน/หมื่น/แสน/ล้าน multiplier (฿9k, 1.2 ล้านบาท), space-grouped thousands (9 999 baht),
with /day, /วัน or ต่อวัน for a rate; or a percent (598.3%, ร้อยละ 16.2). Money is found first, so a date, year
or ID exemption never swallows an amount (฿20 Oct fee, ฿ 2569). In the rest of the text dates (with a day
number), times, years, list numbering, long IDs and plain counts are blanked and never checked; the as-of line
keeps its other words, so an amount in it is checked. A candidate is grounded when, by absolute value, it is
  1. in G: a number observed this turn (any observation value, numeric strings and short strings
     included, metadata keys skipped) or written in the partner's own message;
  2. a ± b with a in G' (the first PAIR_CAP observed amounts) and b an observed amount;
  3. a derived total: per list of rows and numeric column, the column total, its prefix totals (in either
     row order, so suffix totals too) and its totals grouped by each key column; the sum of every
     loan_payoff amount; the sum of a sum_field totals;
  4. a subset sum of a column of at most SUBSET_MAX values;
  5. in a formula line (one with × or =): a × n for a in G' and n a count of 1..PRODUCT_MAX written in
     the same line, or the line's grounded rate × its day count;
  6. a ± d with a in G' and d a derived total (rule 3).
Counts (int values, count-named columns) and numbers under POOL_MIN are observed but never an addend or a
factor; subset sums (rule 4) ground only directly. A rate never grounds itself.
A percent is grounded when it is in G (ratio columns are also added × 100) or equals round(100·a/b, 1)
with b among the PERCENT_DIVISORS largest pool values. Money matches exactly or by whole-baht rounding
(a written decimal matches to two places); percents match to one decimal.
Transcript (seeded) amounts are never grounding: only the current turn's observations and request count.

Limits, by design. ฿0 is always accepted. Signs are not checked: amounts compare by absolute value, so a
figure shown with the wrong sign passes. Rule 2 is broad: on a turn with many round observed amounts, a
round slip (a ×10 or a wrong but summable total) can equal some a ± b and pass. The check stops invented
non-round amounts (such as an assumed first-day charge), not every round slip on a wide turn.
"""
import bisect
import math
import re
import time
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from .config import ConfigurationError

MODES = ('enforce', 'audit', 'off')
MAX_ATTEMPTS = 3
G_CAP = 20000
PAIR_CAP = 400
SUBSET_MAX = 12
PRODUCT_MAX = 400
PERCENT_DIVISORS = 60
SHORT_STRING = 40
META_KEYS = frozenset(('as_of', 'observation', 'row_count', 'rows_count', 'offset', 'limit', 'total_matched',
                       'complete', 'source', 'columns', 'planHash', 'sourceVersion', 'businessDate', 'chargeDate'))
RATIO_COLUMN = re.compile(r'ratio|rate|percent|pct|roi|share|yield', re.I)
# Counts (charges, loans, days, rows) are observed values but never addends or factors of an amount.
COUNT_COLUMN = re.compile(r'count|^n$|_n$|(^|[ _])(charges|loans|days|rows|repayments|payments|items)$|^active', re.I)
POOL_MIN = 10  # smaller numbers (stray digits of short strings) never join a sum or a product

THAI_DIGITS = str.maketrans('๐๑๒๓๔๕๖๗๘๙−', '0123456789-')
NUMBER = r'\d[\d,]*(?:\.\d+)?'
EN_MONTH = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?'
TH_MONTH = (r'(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|'
            r'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)')
EXEMPT = [re.compile(p, re.I) for p in (
    r'(?<![\d,.])\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?',  # ISO date/time
    r'(?<![\d,.])\d{1,2}[-/ ]' + EN_MONTH + r'(?![a-z])(?:[-/ ,]+\d{2,4})?',             # 21-Oct-2026, 16-Sep
    r'(?<![A-Za-z])' + EN_MONTH + r' \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?(?![\d,.])',     # Oct 21, 2026
    r'(?<![\d,.])\d{1,2}\s?[-/ ]?\s?' + TH_MONTH + r'(?:\s?[-/ ]?\s?\d{2,4})?',          # 21-ต.ค.-2569
    r'(?<![\d,.])\d{1,2}/\d{1,2}(?:/\d{2,4})?(?![\d,.])',                                # 21/10, 21/10/2026
    r'(?<![\d,.])\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:น\.|am|pm))?',                         # 14:05
    r'(?<![\d,.])\d{1,2}\.\d{2}\s?น\.',                                                  # 14.05 น.
    r'(?<![\d,.])(?:199\d|20\d\d|2100|25[3-9]\d|26[0-3]\d|264[0-3])(?![\d,.%])',          # years
    r'^\s*\d{1,3}[.)]\s',                                                               # list numbering
    r'(?<![\d,.])\d{7,}(?![\d,.])',                                                     # IDs without separators
    r'(?<![\d,.])\d[\d,]*\s*(?:characters?|chars?|ตัวอักษร|lines?|บรรทัด)\b',               # character counts
)]
# Money is matched before the exemptions run, on the whole line, so they only ever see non-money text.
AMOUNT = r'\d{1,3}(?:[, \u00a0\u202f]\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?'  # 9,999 / 9 999 / 9999.50
MULTIPLIER = r'(?:\s?(?P<mult>[kK](?![A-Za-z])|(?-i:M)(?![A-Za-z])|พัน|หมื่น|แสน|ล้าน))?'
MULTIPLIERS = {'k': 1000, 'K': 1000, 'M': 1000000, 'พัน': 1000, 'หมื่น': 10000, 'แสน': 100000, 'ล้าน': 1000000}
RATE = r'(?P<rate>\s*(?:/\s*(?:day|d|วัน)\b|ต่อวัน|per day|a day))?'
MONEY = re.compile(r'(?P<neg>-\s?)?(?<![\d,.])(?:฿|(?<![\d,.] )thb)\s?(?P<num>' + AMOUNT + r')' + MULTIPLIER + RATE, re.I)
BAHT = re.compile(r'(?P<neg>-\s?)?(?<![\d,.])(?P<num>' + AMOUNT + r')' + MULTIPLIER +
                  r'(?:฿|\s*(?:บาท|บ\.|baht|thb))' + RATE, re.I)  # a trailing ฿ is attached: 9,999฿
PERCENT = re.compile(r'(?<![\d,.])(?P<num>' + NUMBER + r')\s*%|ร้อยละ\s*(?P<num2>' + NUMBER + r')', re.I)
DAYS = re.compile(r'[×x*]\s*(?P<n>\d{1,3})\s*(?:days?|d\b|วัน)', re.I)
FACTOR = re.compile(r'(?<![\d,.฿])\d{1,3}(?![\d,.%])', re.I)
FORMULA = re.compile(r'[×=]|\d\s*[x*]\s*\d', re.I)
NUMERIC_STRING = re.compile(r'^\s*\(?\s*(?P<neg>-)?\s*[฿$]?\s*(?P<neg2>-)?\s*(?P<num>' + NUMBER +
                            r')\s*(?:thb|บาท|baht)?\s*\)?\s*$', re.I)
ANY_NUMBER = re.compile(r'(?<![\w.])' + NUMBER)


class GroundingExceeded(ConfigurationError):
    """FINISH_UNGROUNDED_EXCEEDED: the MAX_ATTEMPTS-th rejection. The session re-raises it, so the turn fails with
    the durable failure reply; the bridge refuses any later finish of the turn with it too (Codex). The turn
    record keeps only the code (CODE); the message, for a model that still sees it, says it was the final try."""
    CODE = 'FINISH_UNGROUNDED_EXCEEDED'

    def __init__(self, amounts=()):
        listed = f'{", ".join(amounts)} are not in this turn\'s observations. ' if amounts else ''
        super().__init__(f'{self.CODE}: {listed}That was the final attempt ({MAX_ATTEMPTS} of {MAX_ATTEMPTS}); '
                         'this turn ends without your reply. Do not call finish again.')


@dataclass
class Result:
    ok: bool
    candidates: int
    ungrounded: list = field(default_factory=list)
    classes: list = field(default_factory=list)
    grounding_values: int = 0
    truncated: bool = False
    elapsed_ms: float = 0.0
    rules: dict = field(default_factory=dict)


def number(text):
    try:
        value = Decimal(text.replace(',', ''))
    except InvalidOperation:
        return None
    return value if value.is_finite() else None


def whole(value):
    return int(abs(value).to_integral_value(ROUND_HALF_UP))


def cents(value):
    return int((abs(value) * 100).to_integral_value(ROUND_HALF_UP))


def tenths(value):
    return int((abs(value) * 10).to_integral_value(ROUND_HALF_UP))


def satang(value):
    """A Decimal amount as a signed int number of hundredths, rounded half up."""
    return int((value * 100).to_integral_value(ROUND_HALF_UP))


def is_key(name):
    name = str(name)
    return (name.startswith('Ref ') or name.endswith(('_id', 'Row ID', 'Id', 'ID')) or name in ('id', 'key'))


def blank(line, pattern):
    return pattern.sub(lambda m: ' ' * len(m.group(0)), line)


def money(line):
    """[(position, shown, Decimal value, class)] of the money and rate amounts in one normalised line, and the
    line with them blanked."""
    items = []
    for pattern in (MONEY, BAHT):
        for m in pattern.finditer(line):
            value = number(m.group('num').replace(' ', '').replace('\u00a0', '').replace('\u202f', ''))
            if value is None:
                continue
            if m.group('mult'):
                value *= MULTIPLIERS[m.group('mult')]
            items.append((m.start(), m.group(0).strip(), value, 'rate' if m.group('rate') else 'money'))
        line = blank(line, pattern)
    return items, line


def scrub(line):
    """The non-money remainder of a normalised line with dates, times, years, numbering and IDs blanked."""
    for pattern in EXEMPT:
        line = blank(line, pattern)
    return line


def candidates(text):
    """[(shown text, Decimal value, class, line index, formula line, day counts, rates, counts in line)]."""
    found = []
    for index, line in enumerate(text.translate(THAI_DIGITS).splitlines()):
        items, rest = money(line)
        rest = scrub(rest)
        formula = bool(FORMULA.search(line))
        days = [int(m.group('n')) for m in DAYS.finditer(rest)]
        factors = sorted({n for n in (int(m.group(0)) for m in FACTOR.finditer(rest)) if 1 <= n <= PRODUCT_MAX})
        for m in PERCENT.finditer(rest):
            value = number(m.group('num') or m.group('num2'))
            if value is not None:
                items.append((m.start(), m.group(0).strip(), value, 'percent'))
        items = [item[1:] for item in sorted(items, key=lambda item: item[0])]  # reading order
        rates = [v for _, v, c in items if c == 'rate']
        found.extend((shown, value, cls, index, formula, days, rates, factors) for shown, value, cls in items)
    return found


class Grounding:
    """The grounding set of one turn: observed values G, derived totals D, subset sums S.

    Internally every amount is an int number of satang (hundredths), absolute value: sums are exact and cheap.
    """

    def __init__(self, observations, instruction=''):
        self.order, self.values, self.derived, self.subsets, self.counts = [], set(), [], set(), set()
        self.memo = {}
        self.percents, self.truncated = set(), False
        for value in self.request_numbers(instruction or ''):
            self.add(value)
        loan_payoffs = []
        for observation in (observations or {}).values():
            self.walk(observation, None)
            if isinstance(observation, dict):
                calculation = observation.get('calculation')
                if isinstance(calculation, dict) and (amount := self.parse(calculation.get('amount'))) is not None:
                    loan_payoffs.append(amount)
                totals = observation.get('totals')
                if isinstance(totals, dict):
                    parsed = [self.parse(v) for v in totals.values()]
                    self.derive(sum(v for v in parsed if v is not None))
        if loan_payoffs:
            self.derive(sum(loan_payoffs))
        minimum = POOL_MIN * 100
        # G': the first PAIR_CAP observed amounts (no counts, nothing under POOL_MIN); a in a ± b and in a × n.
        self.pool = [v for v in dict.fromkeys(self.order) if v >= minimum and v not in self.counts][:PAIR_CAP]
        derived = set(self.derived)
        self.sources = {'observed': self.values, 'total': derived, 'subset': self.subsets, 'pool': set(self.pool),
                        'sum': {v for v in self.values if v >= minimum and v not in self.counts},
                        'chain': {v for v in derived if v >= minimum}}
        self.cache = {}
        self.percent_pool = sorted(v / 100 for v in set(self.pool) | derived)
        self.divisors = [v / 100 for v in sorted(self.pool, reverse=True)[:PERCENT_DIVISORS] if v]

    def keys(self, source, side):
        """Whole-baht (side 0) or satang (side 1) keys of one source set, built on first use."""
        if (source, side) not in self.cache:
            values = self.sources[source]
            keys = set(values) if side else {(v + 50) // 100 for v in values}
            self.cache[(source, side)] = sorted(keys) if source == 'pool' else keys
        return self.cache[(source, side)]

    def percent_keys(self):
        if 'percents' not in self.cache:
            self.cache['percents'] = self.percents | {(v + 5) // 10 for v in self.values}
        return self.cache['percents']

    @property
    def size(self):
        return len(self.values) + len(self.derived) + len(self.subsets)

    @staticmethod
    def request_numbers(text):
        """Amounts (multipliers applied) and plain numbers of a text, dates, times and years excluded."""
        values = []
        for line in text.translate(THAI_DIGITS).splitlines():
            items, rest = money(line)
            values += [satang(value) for _, _, value, _ in items]
            values += [satang(v) for v in (number(m.group(0)) for m in ANY_NUMBER.finditer(scrub(rest))) if v is not None]
        return values

    def parse(self, value):
        if isinstance(value, str):
            if value not in self.memo:
                self.memo[value] = self.parse_value(value)
            return self.memo[value]
        return self.parse_value(value)

    def strings(self, value):
        """Numbers inside a short non-numeric string ("300 THB", "cycle 3 days"); dates and times excluded."""
        if len(value) > SHORT_STRING or not any(c.isdigit() for c in value.translate(THAI_DIGITS)):
            return ()
        memo = ('strings', value)
        if memo not in self.memo:
            self.memo[memo] = self.request_numbers(value)
        return self.memo[memo]

    @staticmethod
    def parse_decimal(value):
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, (int, Decimal)):
            return Decimal(value)
        if isinstance(value, float):
            return Decimal(repr(value)) if math.isfinite(value) else None
        m = NUMERIC_STRING.match(value) if isinstance(value, str) else None
        return number(m.group('num')) if m else None

    @staticmethod
    def parse_value(value):
        """Signed satang of a number or numeric string, else None."""
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, int):
            return value * 100
        if isinstance(value, Decimal):
            return satang(value) if value.is_finite() else None
        if isinstance(value, float):
            return satang(Decimal(repr(value))) if math.isfinite(value) else None
        if isinstance(value, str):
            m = NUMERIC_STRING.match(value)
            if m:
                parsed = number(m.group('num'))
                if parsed is not None:
                    return -satang(parsed) if (m.group('neg') or m.group('neg2')) else satang(parsed)
        return None

    def full(self):
        if self.size >= G_CAP:
            self.truncated = True
            return True
        return False

    def add(self, value):
        if value is None or self.full():
            return
        value = abs(value)
        if value not in self.values:
            self.values.add(value)
            self.order.append(value)

    def derive(self, value):
        if value is None or self.full():
            return
        self.derived.append(abs(value))

    def walk(self, value, key):
        if isinstance(value, dict):
            for k, v in value.items():
                if k in META_KEYS:
                    continue
                self.walk(v, k)
            return
        if isinstance(value, (list, tuple)):
            if value and all(isinstance(r, dict) for r in value):
                self.rows(value)  # scalars of the rows are added there; nested values are walked
                for row in value:
                    for k, v in row.items():
                        if isinstance(v, (dict, list, tuple)) and k not in META_KEYS:
                            self.walk(v, k)
                return
            for item in value:
                self.walk(item, key)
            return
        self.scalar(value, key)

    def scalar(self, value, key, count=None, ratio=None):
        parsed = self.parse(value)
        if parsed is not None:
            self.add(parsed)
            if count if count is not None else (key is not None and COUNT_COLUMN.search(str(key))):
                self.counts.add(abs(parsed))
            elif isinstance(value, int):
                self.counts.add(abs(parsed))
            if ratio if ratio is not None else (key is not None and RATIO_COLUMN.search(str(key))):
                exact = self.parse_decimal(value)  # unrounded: 0.162 is 16.2%
                if exact is not None:
                    self.percents.add(tenths(exact * 100))
            return parsed
        if isinstance(value, str) and not (key is not None and is_key(key)):
            for text in self.strings(value):
                self.add(text)
        return None

    def rows(self, rows):
        """Rule 3 (column, prefix and grouped totals) and rule 4 (subset sums) for one list of rows."""
        columns, kinds = {}, {}
        for row in rows:
            for k, v in row.items():
                if k in META_KEYS or isinstance(v, (dict, list, tuple)):
                    continue
                if k not in kinds:
                    kinds[k] = (is_key(k), bool(COUNT_COLUMN.search(str(k))), bool(RATIO_COLUMN.search(str(k))))
                key, count, ratio = kinds[k]
                parsed = self.scalar(v, k, count, ratio)
                if parsed is not None and not (key or count or isinstance(v, int)):
                    columns.setdefault(k, []).append((row, parsed))
        keys = [k for k in (rows[0] if rows else {}) if is_key(k)]
        for entries in columns.values():
            values = [v for _, v in entries]
            for ordered in (values, values[::-1]):  # prefix totals in either row order; the last is the total
                running = 0
                for v in ordered[:-1] if ordered is not values else ordered:
                    running += v
                    self.derive(running)
            for key in keys:
                groups = {}
                for row, v in entries:
                    groups[row.get(key)] = groups.get(row.get(key), 0) + v
                if 1 < len(groups) < len(entries):
                    for total in groups.values():
                        self.derive(total)
            if 2 < len(values) <= SUBSET_MAX:
                sums = {0}
                for v in values:
                    sums |= {s + v for s in sums}
                for s in sums:
                    if len(self.subsets) >= G_CAP:
                        self.truncated = True
                        break
                    self.subsets.add(abs(s))

    def money(self, value, formula, days, rates, cls='money', factors=()):
        """The rule that grounds a money or rate candidate, or None."""
        if value == 0:
            return 'zero'
        side = 1 if value != value.to_integral_value() else 0  # a written decimal matches to two places
        key = cents(value) if side else whole(value)
        for rule in ('observed', 'total', 'subset'):      # rules 1, 3, 4
            if key in self.keys(rule, side):
                return rule
        for rule in ('sum', 'chain'):                    # rules 2 and 6: x = a + b or x = a - b
            members = self.keys(rule, side)
            for a in self.keys('pool', side):
                if key - a in members or a - key in members:
                    return rule
        if formula:                                        # rule 5
            for rate in (rates if cls != 'rate' else ()):  # a grounded rate × the line's day count
                if any(abs(rate) * n == value for n in days) and self.money(rate, False, (), (), 'rate'):
                    return 'product'
            for a in self.keys('pool', side):              # n is a count written in the same line
                if a and key % a == 0 and key // a in factors:
                    return 'product'
        return None

    def percent(self, value):
        target = tenths(value)
        if target in self.percent_keys():
            return 'observed'
        low, high = (float(value) - 0.05) / 100, (float(value) + 0.05) / 100
        for b in self.divisors:
            start = bisect.bisect_left(self.percent_pool, low * b)
            for a in self.percent_pool[start:]:
                if a > high * b:
                    break
                if tenths(Decimal(repr(100 * a / b))) == target:
                    return 'ratio'
        return None


def check(message, observations, instruction=''):
    """Result for one finish.message against this turn's observations and the partner's message."""
    started = time.perf_counter()
    found = candidates(message)
    grounding = Grounding(observations, instruction)
    ungrounded, classes, rules = [], [], {}
    for shown, value, cls, _, formula, days, rates, factors in found:
        rule = (grounding.percent(value) if cls == 'percent'
                else grounding.money(value, formula, days, rates, cls, factors))
        if rule:
            rules[rule] = rules.get(rule, 0) + 1
        elif shown not in ungrounded:
            ungrounded.append(shown)
            classes.append(cls)
    return Result(not ungrounded, len(found), ungrounded, classes, grounding.size, grounding.truncated,
                  round((time.perf_counter() - started) * 1000, 2), rules)


def rejection(result, attempt):
    return (f'UNGROUNDED_AMOUNTS: {", ".join(result.ungrounded)} are not in this turn\'s observations. Remove '
            f'them, or re-check the data with a tool and quote the observed figure. Attempt {attempt} of {MAX_ATTEMPTS}.')
