"""Build the Partner conversation schema digest from the maintained data dictionary.

Reads project/Documents/Data Dictionary/systems/postgresql/relations/*.yaml (no database access),
keeps the relations whose ACL grants mw_integration_agent SELECT with all their columns (owner decision,
21 October 2026: the SQL tool does not narrow read access), and writes src/mw_integration_agent/assets/schema-digest.json with each
relation's kind, comment and columns (name, type, comment), plus the loan payoff function signature.

Stdlib only: the dictionary files use a small, fixed YAML subset (the dictionary Dumper writes every
string double-quoted or as a block literal), parsed by `load` below. Run from any directory:

    python integration-agent/scripts/build-schema-digest.py          # write the asset
    python integration-agent/scripts/build-schema-digest.py --check  # exit 1 when the asset is stale
"""
import argparse
import json
import re
import sys
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1]
REPOSITORY = AGENT.parent
DICTIONARY = REPOSITORY / 'project' / 'Documents' / 'Data Dictionary' / 'systems' / 'postgresql'
OUTPUT = AGENT / 'src' / 'mw_integration_agent' / 'assets' / 'schema-digest.json'
ROLE = 'mw_integration_agent'
KINDS = {'r': 'table', 'v': 'view', 'm': 'materialized view', 'p': 'partitioned table', 'f': 'foreign table'}
PAYOFF = 'public.loan_close_calculation_v83(p_loan text, p_day date)'


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


def grants_select(acl):
    for item in re.findall(r'(?:"(?:[^"\\]|\\.)*"|[^,{}"])*=[A-Za-z*]*/(?:"(?:[^"\\]|\\.)*"|[^,{}"])*', acl or ''):
        grantee, privileges = item.split('=', 1)[0], item.split('=', 1)[1].split('/')[0]
        if grantee.strip('"') == ROLE and 'r' in privileges:
            return True
    return False


def qualified(schema, name):
    quote = (lambda x: x if re.fullmatch(r'[a-z_][a-z0-9_]*', x) else '"' + x.replace('"', '""') + '"')
    return quote(schema) + '.' + quote(name)


def relation_entry(document):
    content = document['content']
    definition = content['definition']
    if not grants_select(definition.get('acl')):
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


def payoff_signature():
    for path in sorted((DICTIONARY / 'routines').glob('public-loan-close-calculation-v83-*.yaml')):
        document = load(path.read_text(encoding='utf-8'))
        if document['identity']['name'] == PAYOFF:
            definition = document['content']['definition']
            return {'function': 'public.loan_close_calculation_v83', 'arguments': definition['arguments'],
                    'result': definition['result'],
                    'call': "SELECT public.loan_close_calculation_v83(loan_id, (now() AT TIME ZONE 'Asia/Bangkok')::date)",
                    'use': 'Read-only payoff for an open, auto-enabled Daily Interest loan; raises for an ineligible loan. '
                           'Use the loan_payoff tool rather than calling it in sql_query.'}
    raise YamlSubsetError('payoff function missing from the dictionary')


def build():
    relations = []
    for path in sorted((DICTIONARY / 'relations').glob('*.yaml')):
        entry = relation_entry(load(path.read_text(encoding='utf-8')))
        if entry:
            relations.append(entry)
    relations.sort(key=lambda r: r['relation'])
    return {'format': 1,
            'source': 'project/Documents/Data Dictionary/systems/postgresql (relations readable by mw_integration_agent)',
            'notes': 'PostgreSQL 18, search_path pg_catalog, public; quote mixed-case identifiers exactly as written '
                     '("Loans"."Row ID"). Business dates are Asia/Bangkok.',
            'relations': relations,
            'functions': [payoff_signature()]}


def render(value):
    """Compact JSON with one relation per line (small for the prompt, readable in a diff)."""
    compact = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    head = {k: v for k, v in value.items() if k not in ('relations', 'functions')}
    lines = [compact(head)[:-1] + ',"functions":' + compact(value['functions']) + ',"relations":[']
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
                      'bytes': len(text.encode())}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
