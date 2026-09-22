"""Schema discovery and generic API primitives chosen by Codex."""
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .appsheet import AppSheet
from .config import ConfigurationError
from .receipt_rules import BANGKOK

from .conversation_schema import load_schema, table_schema, writable, PROTECTED_TABLES

HIDDEN = {'_RowNumber'}


def spec(name, description, properties):
    return {'type': 'function', 'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties,
                            'required': list(properties), 'additionalProperties': False}}


STR = {'type': 'string'}
STRINGS = {'type': 'array', 'items': STR}
TOOLS = [
    spec('data_catalogue', 'List apps/tables using empty app/table, or discover inspected fields, keys, types, references, initial values and validation rules. Use before API calls. No business-operation scripts.',
         {'app': STR, 'table': STR}),
    spec('read_records', 'Fresh Find-only records. Page limit MUST be 1..100. Use exact keys, field text, or an AppSheet boolean filter expression (empty for unused choices). Host wraps the filter in bounded Top(Filter(table,...),1001). All matching rows must fit 1000 rows; narrow search otherwise. Select columns and page current-turn snapshot. Ref fields link exact keys.',
         {'app': STR, 'table': STR, 'keys': STRINGS,
          'match_field': STR, 'match_text': STR, 'filter': STR, 'columns': STRINGS,
          'offset': {'type': 'integer', 'minimum': 0}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100}}),
    spec('sum_field', 'Exact decimal sum of current-turn observed rows only; result explicitly reports partial pages. Never extrapolate a partial sum.',
         {'observation': STR, 'field': STR, 'group_by': STR}),
    spec('api_action', 'Execute an AppSheet Add or Edit selected by you. Choose app/table/field values from data_catalogue and current records. row_json is a JSON object of supplied column values WITHOUT the key; row_id identifies an Edit or is empty for Add (host generates key). operation_key is stable and unique per logical step. observation must show the edited fields or complete duplicate search for Add. expected_final_json is a JSON object of additional final checks and intentional server transitions; supplied values otherwise must match readback. Use __ACTOR__ for actor fields. API initial values apply to omitted Add fields. Up to 10 sequential row calls; verify effects after every call. Never repeat UNKNOWN. Approved Delete uses app=appsheet_delete with action=Edit carrier, row_json containing only owning_app, and empty expected_final_json. No configuration, identities or computed-field writes.',
         {'app': STR, 'table': STR, 'action': {'type':'string','enum':['Add','Edit']},
          'row_id': STR, 'row_json': STR, 'expected_final_json': STR,
          'operation_key': STR, 'observation': STR, 'instruction_quote': STR}),
    spec('verify_operation', 'Read-only recheck of a current-turn operation with its immutable planned final state. Does not resubmit a write. Use for asynchronous completion or uncertain response.',
         {'operation': STR}),
    spec('database_catalogue', 'Reviewer only. Empty table lists allowed resources. Otherwise inspect live database columns, defaults, constraints, triggers and writable fields before planning DML. No SQL input.', {'table': STR}),
    spec('database_read', 'Reviewer only. Fresh database rows using a nonempty JSON object of equality filters. All columns returned, maximum 100 matching rows; narrow filter if exceeded. Use exact Row ID for an absent INSERT key. No SQL expressions.', {'table': STR, 'where_json': STR}),
    spec('database_transaction', 'Reviewer only. One atomic transaction per turn; 1..10 INSERT/UPDATE/DELETE exact-key steps. DELETE has empty values/expected_after; include every child key as a DELETE step, child before parent. steps_json is an array of objects with action,table,row_id,values,expected_after,observation. values/expected_after are scalar objects without Row ID. All submitted fields are checked unless overridden by expected_after for a documented trigger transition. Actor values must be __ACTOR__. Observe existing complete rows or absent INSERT key first. Requires current instruction quote and audit reason. No DDL/SQL/functions/settings. Reason starts api_gap: or atomic: with concrete capability/transaction evidence. AppSheet bots and initial values do not run. Never mix with API writes or replay UNKNOWN.', {'steps_json': STR, 'instruction_quote': STR, 'reason': STR}),
    spec('finish', 'Finish once. VERIFIED requires current-turn evidence; use CLARIFY or REFUSE when unavailable. Never claim an uncertain edit succeeded. Reply in the specified partner language. No more tools after finish.',
         {'status': {'type': 'string', 'enum': ['VERIFIED', 'CLARIFY', 'REFUSE']},
          'message': STR, 'observations': STRINGS}),
]


def literal(value):
    if not isinstance(value, str) or len(value) > 200 or any(c in value for c in ('"', '\\', '\n', '\r', '\x00')):
        raise ConfigurationError('UNSUPPORTED_SEARCH_LITERAL')
    return json.dumps(value, ensure_ascii=False)


def filter_expression(value):
    if not isinstance(value,str) or len(value)>3000 or '\x00' in value:
        raise ConfigurationError('INVALID_FIND_FILTER')
    # The model chooses the expression, but cannot escape the host's Top/Filter.
    depth, quoted = 0,False
    for char in value:
        if char == '"': quoted = not quoted
        elif not quoted and char == '(' : depth += 1
        elif not quoted and char == ')' : depth -= 1
        if depth < 0: raise ConfigurationError('UNBALANCED_FIND_FILTER')
    if depth or quoted: raise ConfigurationError('UNBALANCED_FIND_FILTER')
    return value


class ConversationTools:
    def __init__(self, authorize, store, message_id, instruction, client=AppSheet, partner_id=None, schema_reader=load_schema):
        self.authorize, self.store, self.message_id = authorize, store, message_id
        self.instruction, self.client = instruction, client
        self.partner_id, self.schema_reader = partner_id, schema_reader
        self.observations, self.fields, self.cache = {}, {}, {}
        self.result = None
        self.possible_write = False
        self.write_verified = False

    def observe(self, value):
        ident = 'observation-' + str(len(self.observations) + 1)
        self.observations[ident] = value
        return {'observation': ident, 'as_of': datetime.now(BANGKOK).isoformat(), **value}

    def call(self, name, args, call_id):
        from .audit import activity, digest
        config = getattr(self.store.db,'config',{})
        with activity(config,'conversation_tool',plan={'name':name,'call_id':call_id,'message_id':self.message_id,
                    'argument_keys':sorted(args) if isinstance(args,dict) else [],'arguments_sha256':digest(args)}):
            return self._call(name,args,call_id)

    def _call(self, name, args, call_id):
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

    def schema(self):
        return self.schema_reader(self.authorize())

    def catalogue(self, app, table):
        definition = table_schema(self.schema(), app, table)
        return sorted(set(definition['columns']) - HIDDEN)

    def dispatch(self, name, a):
        if a.get('app') == 'appsheet_delete':
            from .conversation_write import api_action, object_json
            carrier = object_json(a['row_json'])
            if (name!='api_action' or a['action']!='Edit' or set(carrier)!={'owning_app'}
                    or carrier['owning_app'] not in ('oltp','olap') or object_json(a['expected_final_json'])):
                raise ConfigurationError('API_DELETE_ALIAS_INVALID')
            return self.observe(api_action(self,{**a,'app':carrier['owning_app'],'action':'Delete','row_json':'{}'}))
        # App Server 0.155.1 persists tool schemas at thread/start and has no
        # dynamicTools override on thread/resume. Keep the established read /
        # write tool names as typed compatibility routes; do not replace threads
        # or edit their saved history to add the reviewer capability.
        if a.get('app') == 'database':
            from . import conversation_dml as dml
            if name == 'data_catalogue':
                return dml.catalogue(self, a['table'])
            if name == 'read_records':
                if (len(a['keys'])!=1 or a['match_field'] or a['match_text'] or a['filter']
                        or a['offset']!=0 or a['limit']!=1):
                    raise ConfigurationError('DATABASE_ALIAS_REQUIRES_ONE_EXACT_KEY')
                return dml.read(self,a['table'],{'Row ID':a['keys'][0]})
            if name == 'api_action':
                from .conversation_write import object_json
                reason=object_json(a['expected_final_json'])
                if (a['table']!='transaction' or a['action']!='Edit' or a['row_id']
                        or a['operation_key']!='transaction' or a['observation'] or set(reason)!={'reason'}):
                    raise ConfigurationError('DATABASE_TRANSACTION_ALIAS_INVALID')
                return dml.transaction(self,{'steps_json':a['row_json'],
                    'instruction_quote':a['instruction_quote'],'reason':reason['reason']})
            raise ConfigurationError('DATABASE_ALIAS_UNSUPPORTED')
        if name == 'data_catalogue':
            schema = self.schema()
            if not a['table']:
                return {'apps': {app: {'version': value['version'], 'tables': list(value['tables'])}
                                 for app,value in schema['apps'].items() if not a['app'] or app==a['app']}}
            table = table_schema(schema, a['app'], a['table'])
            return {'app':a['app'], 'table': a['table'], 'key':table['key'],
                    'permission':table['permission'], 'condition':table.get('condition',''),
                    'columns': {k: v for k,v in table['columns'].items() if k not in HIDDEN},
                    'writable_fields': {action:[k for k in table['columns'] if writable(a['table'],table,k,action)]
                                        for action in ('Add','Edit')},
                    'protected_table': a['table'] in PROTECTED_TABLES,
                    'guidance': 'Use current app rules and Ref keys. AppSheet enforces its live validation. Existing automation and database triggers execute normally. Inspect related effects before claiming workflow completion. Reviewer-approved exact-key Delete is available with dependency checks; atomic/cascading effects require the SQL fallback.'}
        if name == 'read_records':
            table = a['table']
            app = a['app']
            definition = table_schema(self.schema(),app,table)
            key = definition['key']
            fields = self.catalogue(app,table)
            keys, columns, offset, limit = a['keys'], a['columns'], a['offset'], a['limit']
            if type(limit) is not int or not 1 <= limit <= 100:
                raise ConfigurationError('PAGE_LIMIT_MUST_BE_INTEGER_1_TO_100')
            if (not isinstance(keys, list) or len(keys) > 25 or any(not isinstance(k, str) or not k for k in keys)
                    or len(set(keys)) != len(keys) or not isinstance(columns, list) or not columns
                    or any(not isinstance(k, str) or k not in fields for k in columns)
                    or type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100
                    or not isinstance(a['match_field'], str) or not isinstance(a['match_text'], str)):
                raise ConfigurationError('INVALID_RECORD_QUERY')
            if keys and (a['match_field'] or a['match_text']):
                raise ConfigurationError('USE_KEYS_OR_SEARCH')
            if a['filter'] and (keys or a['match_field'] or a['match_text']):
                raise ConfigurationError('USE_FILTER_OR_KEYS_OR_SEARCH')
            predicate = 'true'
            if a['filter']:
                predicate = filter_expression(a['filter'])
            elif keys:
                predicate = 'OR(' + ','.join(f'[{key}] = ' + literal(k) for k in keys) + ')'
            elif a['match_field']:
                field = a['match_field']
                if field not in fields or any(c in field for c in '[]"'):
                    raise ConfigurationError('UNKNOWN_SEARCH_FIELD')
                predicate = f'CONTAINS(LOWER([{field}]), {literal(a["match_text"].lower())})'
            elif a['match_text']:
                raise ConfigurationError('SEARCH_FIELD_REQUIRED')
            cache_key = (app, table, predicate)
            if cache_key not in self.cache:
                rows = self.client(self.authorize(),app).find(table, f'Top(Filter({literal(table)}, {predicate}), 1001)')
                ids = [r.get(key) for r in rows]
                if len(rows) >= 1001:
                    raise ConfigurationError('READ_BOUND_REACHED_NARROW_SEARCH')
                if any(not isinstance(k, str) or not k for k in ids) or len(set(ids)) != len(ids):
                    raise ConfigurationError('RECORD_IDENTITY_MISMATCH')
                if keys and set(ids) != set(keys):
                    raise ConfigurationError('REQUESTED_RECORD_MISSING')
                self.cache[cache_key] = sorted(rows, key=lambda r: r[key])
            rows = self.cache[cache_key]
            if any(k not in row for row in rows for k in columns):
                raise ConfigurationError('APP_SCHEMA_CHANGED_OR_FIELD_UNAVAILABLE')
            return self.observe({'app': app, 'table': table, 'total_matched': len(rows), 'offset': offset,
                'rows': [{k: r.get(k) for k in dict.fromkeys([key] + columns)} for r in rows[offset:offset + limit]],
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
        if name == 'api_action':
            from .conversation_write import api_action
            return self.observe(api_action(self, a))
        if name == 'verify_operation':
            from .conversation_write import verify_operation
            return self.observe(verify_operation(self, a['operation']))
        if name in ('database_catalogue', 'database_read', 'database_transaction'):
            from . import conversation_dml as dml
            if name == 'database_catalogue': return dml.catalogue(self, a['table'])
            if name == 'database_read':
                from .conversation_write import object_json
                return dml.read(self, a['table'], object_json(a['where_json']))
            return dml.transaction(self, a)
        if name == 'finish':
            if (a['status'] not in ('VERIFIED', 'CLARIFY', 'REFUSE') or not isinstance(a['message'], str)
                    or not a['message'].strip() or len(a['message']) > 12000 or not isinstance(a['observations'], list)
                    or any(not isinstance(x, str) or x not in self.observations for x in a['observations'])):
                raise ConfigurationError('INVALID_COMPLETION')
            if a['status'] == 'VERIFIED' and not a['observations']:
                raise ConfigurationError('CURRENT_EVIDENCE_REQUIRED')
            if self.possible_write and not self.write_verified:
                raise ConfigurationError('WRITE_UNCERTAIN_INSPECT_BEFORE_COMPLETION')
            if self.possible_write and not any(self.observations[x].get('write_verified') for x in a['observations']):
                raise ConfigurationError('WRITE_READBACK_EVIDENCE_REQUIRED')
            self.authorize()
            self.result = a
            return {'accepted': True}
        raise ConfigurationError('TOOL_NOT_PERMITTED')
