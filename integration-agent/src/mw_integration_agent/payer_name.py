"""Payer (slip sender) name normalization, comparison and payer lines (R095, revision 2).

Parity module of services/receipts/payer-name.mjs; both are driven by tests/fixtures/payer-name-cases.json.
`payer_key` is a comparison key only; `display` is the stored and shown form (as printed, masks kept).
A borrower's "Communication Name" holds up to 5 payer lines (line 1 the borrower, then people who pay for them);
`?` in a line is exactly one unknown letter. `compare` returns match, near (one look-alike OCR letter in a given name
of 4+ letters), mismatch or unknown; `learn` decides how a slip name changes the lines; `hint_key` normalizes a
forwarder's nickname message.
"""
import re
import unicodedata

__all__ = ['display', 'payer_key', 'script', 'letters', 'readable', 'compare', 'LOOKALIKES', 'lines', 'joined',
           'best', 'learn', 'valid_lines', 'hint_key', 'MAX_LINES', 'MAX_LINES_BYTES']

MAX_BYTES = 200
MAX_LINES = 5
MAX_LINES_BYTES = 1000
# Thai OCR look-alike letter pairs for `near` (symmetric); pinned in the fixture.
LOOKALIKES = (('ภ', 'ก'), ('ณ', 'น'), ('ล', 'ส'), ('ด', 'ต'), ('บ', 'ป'), ('ช', 'ซ'), ('ข', 'ฃ'), ('ฎ', 'ฏ'), ('ถ', 'ภ'),
              ('ผ', 'พ'), ('ฝ', 'ฟ'), ('ค', 'ศ'), ('ท', 'ห'), ('อ', 'ฮ'))
PAIRS = {frozenset(p) for p in LOOKALIKES}
INVISIBLE = re.compile('[\u200b-\u200d\u2060\ufeff]')
CONTROL = re.compile('[\u0000-\u001f\u007f-\u009f]')
SPACE = re.compile(r'\s+')
# One leading title, longest first. Thai titles may touch the name; English ones need a dot or a space.
TITLE = re.compile(r'^(?:(?:นางสาว|นาง|นาย|คุณ|เด็กหญิง|เด็กชาย|นส)\.?\s*|(?:น\.ส|ด\.ช|ด\.ญ)\.?\s*|(?:mrs|mr|ms|miss)(?:\.\s*|\s+))')
MASK_X = re.compile('x{2,}')
MASK_RUN = re.compile('[*\u2022\u25cf\u00d7]+')
THAI = re.compile('[\u0e00-\u0e7f]')
ANY, RUN = '<any>', '<run>'


def display(text):
    """The name as printed (title, case and masks kept): NFC, no control or zero-width characters,
    whitespace collapsed; '' when empty or longer than 200 UTF-8 bytes."""
    if not isinstance(text, str):
        return ''
    value = unicodedata.normalize('NFC', text)
    value = INVISIBLE.sub('', value)
    value = SPACE.sub(' ', CONTROL.sub(' ', value)).strip()
    try:
        size = len(value.encode('utf-8'))
    except UnicodeEncodeError:
        return ''
    return value if size <= MAX_BYTES else ''


def payer_key(text):
    value = display(text).lower()
    value = unicodedata.normalize('NFC', value)
    rest = TITLE.sub('', value, count=1)
    if rest.strip():
        value = rest
    value = value.replace('.', '').replace(',', '')
    value = MASK_RUN.sub('*', MASK_X.sub('*', value))
    tokens = SPACE.sub(' ', value).strip().split(' ')
    # A final surname of one or two letters without a mask is an abbreviation (banks print "ช." for "ช***").
    if len(tokens) >= 2 and '*' not in tokens[-1] and 1 <= letters(tokens[-1]) <= 2:
        tokens[-1] += '*'
    return ' '.join(tokens)


def script(key):
    return 'thai' if THAI.search(key) else 'latin'


def letters(key):
    return sum(1 for ch in key if ch.isalpha())


def readable(text):
    """At least three unmasked letters after normalization."""
    return letters(payer_key(text)) >= 3


def _glob(token):
    # A mask stands for one or more characters: ANY (one character) then RUN (zero or more). Both markers are
    # longer than one character, so they never equal a printed character.
    # `?` is exactly one unknown letter.
    return [part for ch in token for part in ((ANY, RUN) if ch == '*' else (ANY,) if ch == '?' else (ch,))]


def _compatible(a, b):
    """True when some name fits both tokens (each mask is one or more characters); without masks, equality."""
    p, q = _glob(a), _glob(b)
    seen = set()

    def fits(i, j):
        if (i, j) in seen:
            return False
        seen.add((i, j))
        if i == len(p) and j == len(q):
            return True
        if i < len(p) and p[i] == RUN and (fits(i + 1, j) or (j < len(q) and fits(i, j + 1))):
            return True
        if j < len(q) and q[j] == RUN and (fits(i, j + 1) or (i < len(p) and fits(i + 1, j))):
            return True
        return (i < len(p) and j < len(q) and RUN not in (p[i], q[j])
                and (p[i] == q[j] or ANY in (p[i], q[j])) and fits(i + 1, j + 1))

    return fits(0, 0)


def _near(a, b):
    """Given names of 4+ letters, same length, no mask, one differing position holding a look-alike pair."""
    if '*' in a or '*' in b or len(a) != len(b) or letters(a.replace('?', '')) < 4 or letters(b.replace('?', '')) < 4:
        return False
    diff = [(x, y) for x, y in zip(a, b) if x != y and '?' not in (x, y)]
    return len(diff) == 1 and frozenset(diff[0]) in PAIRS


def compare(stored, slip):
    """'match', 'near', 'mismatch' or 'unknown' (either side empty or under 3 letters, different scripts, or a missing
    surname)."""
    a, b = payer_key(stored), payer_key(slip)
    if letters(a) < 3 or letters(b) < 3 or script(a) != script(b):
        return 'unknown'
    left, right = a.split(' '), b.split(' ')
    if len(left) != len(right):
        # A missing surname (one complete, unmasked given name of 3+ letters equal to the other's) is not evidence either
        # way: 'unknown', so it never resolves a borrower (C4/C5) and only proceeds where the borrower is already known.
        short, other = (left, right) if len(left) < len(right) else (right, left)
        complete = len(short) == 1 and '*' not in short[0] and letters(short[0]) >= 3
        return 'unknown' if complete and short[0] == other[0] else 'mismatch'
    if all(_compatible(x, y) for x, y in zip(left, right)):
        return 'match'
    if all(_compatible(x, y) for x, y in zip(left[1:], right[1:])) and _near(left[0], right[0]):
        return 'near'
    return 'mismatch'


def lines(text):
    """The payer lines of a stored "Communication Name" (display form, empty lines dropped)."""
    if not isinstance(text, str):
        return []
    return [line for line in (display(part) for part in text.split('\n')) if line]


def joined(values):
    return '\n'.join(values)


def best(values, slip):
    """The best comparison of a slip name with any line: match, near, or None."""
    results = {compare(line, slip) for line in values}
    return 'match' if 'match' in results else 'near' if 'near' in results else None


def learn(values, slip):
    """The new lines after a posted slip, or None when nothing changes. Line order is kept (line 1 is the owner's)."""
    name = display(slip)
    if not name or not readable(name):
        return None
    result = list(values)
    for index, line in enumerate(result):
        if compare(line, name) == 'match':
            if letters(payer_key(name)) > letters(payer_key(line)):
                result[index] = name
                break
            return None
    else:
        if any(compare(line, name) == 'near' for line in result) or len(result) >= MAX_LINES:
            return None
        result.append(name)
    return result if valid_lines(result) else None


def valid_lines(values):
    """1 to 5 lines, each a display-form name of 1 to 200 bytes, at most 1000 bytes joined."""
    return (isinstance(values, list) and 1 <= len(values) <= MAX_LINES and all(isinstance(v, str) and v and display(v) == v for v in values)
            and len(joined(values).encode('utf-8')) <= MAX_LINES_BYTES)


NICK_PREFIX = re.compile(r"^(?:พี่\s*|p'\s*|pi\s+)")


def hint_key(text):
    """A nickname message or borrower name for the forwarder hint: NFC, lower case, whitespace collapsed, one leading
    พี่ / p' / "pi " and an Instagram @ dropped."""
    if not isinstance(text, str):
        return ''
    value = SPACE.sub(' ', unicodedata.normalize('NFC', text).lower()).strip()
    value = NICK_PREFIX.sub('', value, count=1).strip()
    return value.removeprefix('@')
