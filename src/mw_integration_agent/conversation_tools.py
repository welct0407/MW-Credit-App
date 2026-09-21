"""General bounded data tools and inspected operational edit mappings."""
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .appsheet import AppSheet
from .config import ConfigurationError
from .receipt_rules import BANGKOK

TABLES = ('Borrowers', 'Loans', 'Charges', 'Repayments', 'Payments')
EDITABLE = ('Borrower Name', 'Description', 'Address', 'City', 'Working Location', 'Borrower Note')
HIDDEN = {'Payment Request Token', 'Payment Request Cash Account', 'Charge Generation Request', '_RowNumber'}


def spec(name, description, properties):
    return {'type': 'function', 'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties,
                            'required': list(properties), 'additionalProperties': False}}


STR = {'type': 'string'}
STRINGS = {'type': 'array', 'items': STR}
TOOLS = [
    spec('data_catalogue', 'Discover current field names for one operational table, and supported edits. No schema modification.',
         {'table': {'type': 'string', 'enum': list(TABLES)}}),
    spec('read_records', 'Fresh Find-only records. Filter by exact keys or field text. All matching rows must fit the 1000-row bound; otherwise narrow the search. Select columns and page the current-turn snapshot. Ref fields link exact keys.',
         {'table': {'type': 'string', 'enum': list(TABLES)}, 'keys': STRINGS,
          'match_field': STR, 'match_text': STR, 'columns': STRINGS,
          'offset': {'type': 'integer', 'minimum': 0}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100}}),
    spec('sum_field', 'Exact decimal sum of current-turn observed rows only; result explicitly reports partial pages. Never extrapolate a partial sum.',
         {'observation': STR, 'field': STR, 'group_by': STR}),
    spec('edit_record', 'Edit one observed Borrowers record using the supported descriptive fields only. Requires the partner explicitly requesting this change in the current message, the exact quote, current observation, and expected existing values. One edit per incoming message. Host checks both apps before and after. No financial, identity, opt-in or administrative edits.',
         {'observation': STR, 'row_id': STR, 'instruction_quote': STR,
          'changes': {'type': 'array', 'items': {'type': 'object', 'properties': {
              'field': {'type': 'string', 'enum': list(EDITABLE)}, 'expected': STR, 'value': STR},
              'required': ['field', 'expected', 'value'], 'additionalProperties': False}}}),
    spec('finish', 'Finish once. VERIFIED requires current-turn evidence; use CLARIFY or REFUSE when unavailable. Never claim an uncertain edit succeeded. Reply in the specified partner language. No more tools after finish.',
         {'status': {'type': 'string', 'enum': ['VERIFIED', 'CLARIFY', 'REFUSE']},
          'message': STR, 'observations': STRINGS}),
]


def literal(value):
    if not isinstance(value, str) or len(value) > 200 or any(c in value for c in ('"', '\\', '\n', '\r', '\x00')):
        raise ConfigurationError('UNSUPPORTED_SEARCH_LITERAL')
    return json.dumps(value, ensure_ascii=False)


class ConversationTools:
    def __init__(self, authorize, store, message_id, instruction, client=AppSheet):
        self.authorize, self.store, self.message_id = authorize, store, message_id
        self.instruction, self.client = instruction, client
        self.observations, self.fields, self.cache = {}, {}, {}
        self.result = None
        self.possible_write = False
        self.write_verified = False

    def observe(self, value):
        ident = 'observation-' + str(len(self.observations) + 1)
        self.observations[ident] = value
        return {'observation': ident, 'as_of': datetime.now(BANGKOK).isoformat(), **value}

    def call(self, name, args, call_id):
        self.authorize()
        if self.result is not None:
            raise ConfigurationError('TURN_ALREADY_FINISHED')
        definition = next((t for t in TOOLS if t['name'] == name), None)
        if not definition or not isinstance(args, dict) or set(args) != set(definition['inputSchema']['properties']):
            raise ConfigurationError('UNSUPPORTED_TOOL_OR_ARGUMENTS')
        if not isinstance(call_id, str) or not call_id:
            raise ConfigurationError('TOOL_CALL_ID_REQUIRED')
        with self.store.db:
            inserted = self.store.db.execute('INSERT OR IGNORE INTO tool_calls VALUES (?,?,?,?,NULL)',
                (self.message_id, call_id, name, json.dumps(args, ensure_ascii=False))).rowcount
        if not inserted:
            raise ConfigurationError('TOOL_ALREADY_ATTEMPTED_NO_REPLAY')
        value = self.dispatch(name, args)
        with self.store.db:
            self.store.db.execute('UPDATE tool_calls SET result=? WHERE message_id=? AND call_id=?',
                (json.dumps(value, ensure_ascii=False), self.message_id, call_id))
        return value

    def catalogue(self, table):
        if table not in TABLES:
            raise ConfigurationError('TABLE_NOT_PERMITTED')
        if table not in self.fields:
            rows = self.client(self.authorize()).find(table, f'Top(Filter("{table}", true), 1)')
            self.fields[table] = sorted({k for r in rows for k in r} - HIDDEN)
        return self.fields[table]

    def dispatch(self, name, a):
        if name == 'data_catalogue':
            return {'table': a['table'], 'fields': self.catalogue(a['table']),
                    'editable': list(EDITABLE) if a['table'] == 'Borrowers' else [],
                    'guidance': 'Principal, amount due, remaining charges and paid totals are distinct. Refresh every turn. Other writes are not implemented; never claim execution.'}
        if name == 'read_records':
            table = a['table']
            fields = self.catalogue(table)
            keys, columns, offset, limit = a['keys'], a['columns'], a['offset'], a['limit']
            if (not isinstance(keys, list) or len(keys) > 25 or any(not isinstance(k, str) or not k for k in keys)
                    or len(set(keys)) != len(keys) or not isinstance(columns, list) or not columns
                    or any(not isinstance(k, str) or k not in fields for k in columns)
                    or type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100
                    or not isinstance(a['match_field'], str) or not isinstance(a['match_text'], str)):
                raise ConfigurationError('INVALID_RECORD_QUERY')
            if keys and (a['match_field'] or a['match_text']):
                raise ConfigurationError('USE_KEYS_OR_SEARCH')
            predicate = 'true'
            if keys:
                predicate = 'OR(' + ','.join('[Row ID] = ' + literal(k) for k in keys) + ')'
            elif a['match_field']:
                field = a['match_field']
                if field not in fields or any(c in field for c in '[]"'):
                    raise ConfigurationError('UNKNOWN_SEARCH_FIELD')
                predicate = f'CONTAINS(LOWER([{field}]), {literal(a["match_text"].lower())})'
            elif a['match_text']:
                raise ConfigurationError('SEARCH_FIELD_REQUIRED')
            cache_key = (table, predicate)
            if cache_key not in self.cache:
                rows = self.client(self.authorize()).find(table, f'Top(Filter("{table}", {predicate}), 1001)')
                ids = [r.get('Row ID') for r in rows]
                if len(rows) >= 1001:
                    raise ConfigurationError('READ_BOUND_REACHED_NARROW_SEARCH')
                if any(not isinstance(k, str) or not k for k in ids) or len(set(ids)) != len(ids):
                    raise ConfigurationError('RECORD_IDENTITY_MISMATCH')
                if keys and set(ids) != set(keys):
                    raise ConfigurationError('REQUESTED_RECORD_MISSING')
                self.cache[cache_key] = sorted(rows, key=lambda r: r['Row ID'])
            rows = self.cache[cache_key]
            return self.observe({'table': table, 'total_matched': len(rows), 'offset': offset,
                'rows': [{k: r.get(k) for k in dict.fromkeys(['Row ID'] + columns)} for r in rows[offset:offset + limit]],
                'complete': offset == 0 and len(rows) <= limit})
        if name == 'sum_field':
            source = self.observations.get(a['observation'])
            if not source or 'rows' not in source:
                raise ConfigurationError('CURRENT_OBSERVATION_REQUIRED')
            totals = {}
            for row in source['rows']:
                if a['field'] not in row or (a['group_by'] and a['group_by'] not in row):
                    raise ConfigurationError('UNOBSERVED_FIELD')
                try:
                    value = Decimal(str(row[a['field']]).replace(',', '').replace('฿', '').strip())
                    if not value.is_finite():
                        raise InvalidOperation()
                except InvalidOperation:
                    raise ConfigurationError('NON_NUMERIC_VALUE') from None
                group = str(row[a['group_by']]) if a['group_by'] else 'total'
                totals[group] = totals.get(group, Decimal(0)) + value
            return self.observe({'totals': {k: str(v) for k, v in totals.items()}, 'source': a['observation'],
                                 'rows_count': len(source['rows']), 'complete': source['complete']})
        if name == 'edit_record':
            from .conversation_write import edit_record
            return self.observe(edit_record(self, a))
        if name == 'finish':
            if (a['status'] not in ('VERIFIED', 'CLARIFY', 'REFUSE') or not isinstance(a['message'], str)
                    or not a['message'].strip() or len(a['message']) > 12000 or not isinstance(a['observations'], list)
                    or any(not isinstance(x, str) or x not in self.observations for x in a['observations'])):
                raise ConfigurationError('INVALID_COMPLETION')
            if a['status'] == 'VERIFIED' and not a['observations']:
                raise ConfigurationError('CURRENT_EVIDENCE_REQUIRED')
            if self.possible_write and not self.write_verified:
                raise ConfigurationError('WRITE_UNCERTAIN_INSPECT_BEFORE_COMPLETION')
            if self.possible_write and not any(self.observations[x].get('edit_verified') for x in a['observations']):
                raise ConfigurationError('WRITE_READBACK_EVIDENCE_REQUIRED')
            self.authorize()
            self.result = a
            return {'accepted': True}
        raise ConfigurationError('TOOL_NOT_PERMITTED')
