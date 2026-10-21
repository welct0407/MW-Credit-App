"""Schema discovery and generic API primitives chosen by the conversation model (Codex, Claude or Gemini).

Identity: the start-of-turn authorization (execute) is kept as turn_config and serves every read; writes
(api_action, database_transaction, the delete/database aliases) and finish re-authorize, and the write and
DML modules keep their own checkpoints. Reads of one model round can run concurrently (call_many): journal
and audit writes stay on the calling thread, in call order; only the pure fetches run in the pool.
"""
from concurrent.futures import ThreadPoolExecutor, wait
import json
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .conversation_api import NativeConversationClient
from .config import ConfigurationError
from .receipt_rules import BANGKOK

from .conversation_schema import load_schema, table_schema, writable, PROTECTED_TABLES

HIDDEN = {'_RowNumber'}
# Read tools: answered from the start-of-turn authorization; a round made only of these may run concurrently.
READ_TOOLS = frozenset(('data_catalogue', 'read_records', 'sum_field', 'verify_operation', 'database_catalogue',
                        'database_read', 'sql_query', 'loan_payoff'))
# Reads whose fetch touches no conversation journal and no reviewer gate run in the pool; the other reads of an
# all-read round (verify_operation, database_*, the database aliases) run on the calling thread after it.
POOLED_READS = frozenset(('data_catalogue', 'read_records', 'sum_field', 'sql_query', 'loan_payoff'))
ALIAS_APPS = ('database', 'appsheet_delete')
TOOL_WORKERS = 4  # concurrent reads per round; each has its own database or HTTP connection


def spec(name, description, properties):
    return {'type': 'function', 'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties,
                            'required': list(properties), 'additionalProperties': False}}


STR = {'type': 'string'}
STRINGS = {'type': 'array', 'items': STR}
TOOLS = [
    spec('data_catalogue', 'List native oltp/olap resources using empty app/table, or inspect reviewed fields, types, relationships, defaults and semantic actions. Pending capabilities are unavailable; never invent a formula or raw write.',
         {'app': STR, 'table': STR}),
    spec('read_records', 'Fresh native read-only records. Page limit MUST be 1..100. Use exact keys, literal field text, or filter containing JSON typed AST: eq/ne/lt/lte/gt/gte/contains/in with op,field,value; isNull with op,field; and/or with op,args; not with op,arg. Numeric values are decimal strings. Empty filter means no predicate. No AppSheet expressions or SQL. All matches must fit 1000 rows; otherwise narrow search. Ref fields link exact keys.',
         {'app': STR, 'table': STR, 'keys': STRINGS,
          'match_field': STR, 'match_text': STR, 'filter': STR, 'columns': STRINGS,
          'offset': {'type': 'integer', 'minimum': 0}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100}}),
    spec('sum_field', 'Exact decimal sum of current-turn observed rows only; result explicitly reports partial pages. Never extrapolate a partial sum.',
         {'observation': STR, 'field': STR, 'group_by': STR}),
    spec('api_action', 'Execute a native semantic Add or Edit selected by you. Choose app/table/field values from data_catalogue and current records. row_json is a JSON object of supplied column values WITHOUT the key; row_id identifies an Edit or is empty for Add (host generates key). operation_key is stable and unique per logical step. observation must show the edited fields or complete duplicate search for Add. expected_final_json is a JSON object of additional final checks and intentional server transitions; supplied values otherwise must match readback. Use __ACTOR__ for actor fields. Reviewed native defaults apply to omitted Add fields; unsupported defaults fail closed. Up to 10 sequential row calls; verify effects after every call. Never repeat UNKNOWN. Approved Delete uses app=appsheet_delete with action=Edit carrier, row_json containing only owning_app, and empty expected_final_json. No configuration, identities or computed-field writes.',
         {'app': STR, 'table': STR, 'action': {'type':'string','enum':['Add','Edit']},
          'row_id': STR, 'row_json': STR, 'expected_final_json': STR,
          'operation_key': STR, 'observation': STR, 'instruction_quote': STR}),
    spec('verify_operation', 'Read-only recheck of a current-turn operation with its immutable planned final state. Does not resubmit a write. Use for asynchronous completion or uncertain response.',
         {'operation': STR}),
    spec('database_catalogue', 'Reviewer only. Empty table lists allowed resources. Otherwise inspect live database columns, defaults, constraints, triggers and writable fields before planning DML. No SQL input.', {'table': STR}),
    spec('database_read', 'Reviewer only. Fresh database rows using a nonempty JSON object of equality filters. All columns returned, maximum 100 matching rows; narrow filter if exceeded. Use exact Row ID for an absent INSERT key. No SQL expressions.', {'table': STR, 'where_json': STR}),
    spec('database_transaction', 'Reviewer only. One atomic transaction per turn; 1..10 INSERT/UPDATE exact-key steps. Database DELETE is retired; approved deletions use the native API Delete. steps_json is an array of objects with action,table,row_id,values,expected_after,observation. values/expected_after are scalar objects without Row ID. All submitted fields are checked unless overridden by expected_after for a documented trigger transition. Actor values must be __ACTOR__. Observe existing complete rows or absent INSERT key first. Requires current instruction quote and audit reason. No DDL/SQL/functions/settings. Reason starts api_gap: or atomic: with concrete capability/transaction evidence. Native command side effects and defaults do not run on this separate bounded SQL route. Never mix with API writes or replay UNKNOWN.', {'steps_json': STR, 'instruction_quote': STR, 'reason': STR}),
    spec('finish', 'Finish once. VERIFIED requires current-turn evidence; use CLARIFY or REFUSE when unavailable. Never claim an uncertain edit succeeded. Reply in the specified partner language. No more tools after finish.',
         {'status': {'type': 'string', 'enum': ['VERIFIED', 'CLARIFY', 'REFUSE']},
          'message': STR, 'observations': STRINGS}),
]

# Model-provider registry (Claude and Gemini conversations); Codex threads keep TOOLS unchanged. Both tools fail
# closed with SQL_READ_DISABLED unless conversation_sql_read_enabled, so the declared set never changes.
CLAUDE_TOOLS = TOOLS + [
    spec('sql_query', 'Read-only SQL over the MW Credit business database (PostgreSQL 18, schema public, '
         'Asia/Bangkok, read-only transaction). Exactly one SELECT or WITH statement; no semicolon, comments, '
         'dollar quoting, E strings, row locks, writes or side-effect functions; at most 8000 characters; 20 s limit. Quote mixed-case '
         'identifiers exactly ("Loans"."Row ID"). Returns at most 500 rows with distinct column names; aggregate in '
         'SQL instead of paging through rows; at most 256 KB per result. Use the schema digest in the system prompt.', {'sql': STR}),
    spec('loan_payoff', "Cross-check of today's payoff (Bangkok) for one open Daily Interest loan from the system's own "
         'loan close calculation, by exact loan Row ID; report the charge-balance payoff of the business rules. '
         'Returns eligible=false with the reason for any other loan.',
         {'loan_id': STR}),
]
CLAUDE_FINISH_LIMIT = 1000  # code points (Echo CONV-UX-08); Codex keeps its own 12,000 bound
# The same registry and finish gate serve every model provider (Claude, Gemini); the CLAUDE_ names stay.
ASSISTANT_TOOLS, ASSISTANT_FINISH_LIMIT = CLAUDE_TOOLS, CLAUDE_FINISH_LIMIT


def literal(value):
    if not isinstance(value, str) or len(value) > 200 or any(c in value for c in ('"', '\\', '\n', '\r', '\x00')):
        raise ConfigurationError('UNSUPPORTED_SEARCH_LITERAL')
    return json.dumps(value, ensure_ascii=False)


def filter_expression(value):
    if not isinstance(value,str) or len(value.encode())>16384 or '\x00' in value:
        raise ConfigurationError('INVALID_FIND_FILTER')
    try:
        node=json.loads(value,parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError,TypeError):
        raise ConfigurationError('NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY') from None
    if node is not None and not isinstance(node,dict):
        raise ConfigurationError('NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY')
    return node


class ConversationTools:
    def __init__(self, authorize, store, message_id, instruction, client=NativeConversationClient, partner_id=None, schema_reader=load_schema,
                 tools=TOOLS, finish_limit=None):
        self.authorize, self.store, self.message_id = authorize, store, message_id
        self.tools, self.finish_limit = tools, finish_limit
        self.instruction, self.client = instruction, client
        self.partner_id, self.schema_reader = partner_id, schema_reader
        self.observations, self.fields, self.cache = {}, {}, {}
        self.result = None
        self.possible_write = False
        self.write_verified = False
        self.turn_config = None  # set by execute() from its start-of-turn authorize()
        self.grounding_rejections, self.grounding_exceeded = 0, False

    def observe(self, value):
        ident = 'observation-' + str(len(self.observations) + 1)
        self.observations[ident] = value
        return {'observation': ident, 'as_of': datetime.now(BANGKOK).isoformat(), **value}

    def config(self):
        """The start-of-turn authorization; a bridge used without execute() authorizes once, lazily."""
        if self.turn_config is None:
            self.turn_config = self.authorize()
        return self.turn_config

    @staticmethod
    def fresh(name, args):
        """Writes and the delete/database aliases re-check identity before their reservation; reads use the
        turn's check; finish re-checks once, inside its dispatch, right before it is accepted."""
        if name == 'finish':
            return False
        return name not in READ_TOOLS or (isinstance(args, dict) and args.get('app') in ALIAS_APPS)

    @staticmethod
    def pooled(name, args):
        return name in POOLED_READS and isinstance(args, dict) and args.get('app') not in ALIAS_APPS

    def audit_plan(self, name, args, call_id):
        from .audit import digest
        return {'name': name, 'call_id': call_id, 'message_id': self.message_id,
                'argument_keys': sorted(args) if isinstance(args, dict) else [], 'arguments_sha256': digest(args)}

    def call(self, name, args, call_id):
        from .audit import activity
        config = getattr(self.store.db,'config',{})
        with activity(config,'conversation_tool',plan=self.audit_plan(name,args,call_id)):
            return self._call(name,args,call_id)

    def _call(self, name, args, call_id):
        self.reserve(name, args, call_id)
        value = self.dispatch(name, args)
        self.record(call_id, value)
        return value

    def reserve(self, name, args, call_id):
        """Identity (fresh or turn), validation and the once-only tool_calls row; before any effect."""
        if self.fresh(name, args):
            self.authorize()
        else:
            self.config()
        if self.result is not None:
            raise ConfigurationError('TURN_ALREADY_FINISHED')
        definition = next((t for t in self.tools if t['name'] == name), None)
        if not definition or not isinstance(args, dict) or set(args) != set(definition['inputSchema']['properties']):
            raise ConfigurationError('UNSUPPORTED_TOOL_OR_ARGUMENTS')
        if not isinstance(call_id, str) or not call_id:
            raise ConfigurationError('TOOL_CALL_ID_REQUIRED')
        with self.store.db:
            inserted = self.store.db.execute('INSERT OR IGNORE INTO tool_calls VALUES (?,?,?,?,NULL)',
                (self.message_id, call_id, name, json.dumps(args, ensure_ascii=False))).rowcount
        if not inserted:
            raise ConfigurationError('TOOL_ALREADY_ATTEMPTED_NO_REPLAY')

    def record(self, call_id, value):
        with self.store.db:
            self.store.db.execute('UPDATE tool_calls SET result=? WHERE message_id=? AND call_id=?',
                (json.dumps(value, ensure_ascii=False), self.message_id, call_id))

    def timed_fetch(self, name, args, config):
        started = time.monotonic()
        try:
            return self.fetch(name, args, config), None, round((time.monotonic() - started) * 1000)
        except Exception as exc:
            return None, exc, round((time.monotonic() - started) * 1000)

    def call_many(self, calls, deadline=None):
        """One model round of read calls [(name, args, call_id)] -> ([value or exception], [ms]) in call order.

        On the calling thread, in call order: audit requested, identity/validation/tool_calls reservation.
        In a pool of at most TOOL_WORKERS: the pure fetches (each opens its own connection). Joined until the
        deadline; a call still running then is TOOL_TIMEOUT (its thread ends by itself within the statement
        timeout). Back on the calling thread, in call order: the other reads, observe() (so observation ids
        follow the calls), the tool_calls result and audit completed/failed. One call's error stays its own.
        """
        from .audit import finished, started
        audit_config = getattr(self.store.db, 'config', {})
        count = len(calls)
        outcomes, ms, ops, ready = [None] * count, [0] * count, [None] * count, [False] * count
        for index, (name, args, call_id) in enumerate(calls):
            ops[index] = started(audit_config, 'conversation_tool', self.audit_plan(name, args, call_id))
            try:
                self.reserve(name, args, call_id)
                ready[index] = True
            except Exception as exc:
                outcomes[index] = exc
        config = self.config()
        futures = {}
        pooled = [i for i in range(count) if ready[i] and self.pooled(calls[i][0], calls[i][1])]
        if pooled:
            executor = ThreadPoolExecutor(max_workers=min(TOOL_WORKERS, len(pooled)), thread_name_prefix='conversation-read')
            try:
                for index in pooled:
                    futures[index] = executor.submit(self.timed_fetch, calls[index][0], calls[index][1], config)
                wait(list(futures.values()), timeout=None if deadline is None else max(0.0, deadline - time.monotonic()))
            finally:
                executor.shutdown(wait=False, cancel_futures=True)
        for index, (name, args, call_id) in enumerate(calls):
            if ready[index]:
                started_at = time.monotonic()
                try:
                    if index in futures:
                        if not futures[index].done() or futures[index].cancelled():
                            raise ConfigurationError('TOOL_TIMEOUT')
                        value, error, ms[index] = futures[index].result()
                        if error is not None:
                            raise error
                        value = self.wrap(name, value)
                    else:
                        value = self.dispatch(name, args)
                        ms[index] = round((time.monotonic() - started_at) * 1000)
                    self.record(call_id, value)
                    outcomes[index] = value
                except Exception as exc:
                    outcomes[index] = exc
            finished(audit_config, ops[index], outcomes[index] if isinstance(outcomes[index], Exception) else None)
        return outcomes, ms

    def ground(self, message, status):
        """R088 numeric grounding of finish.message against this turn's observations and the partner's message.

        enforce (default): an amount that no observation supports rejects the finish (attempt N of 3); the third
        rejection raises GroundingExceeded and the turn fails. audit: the same check, logged only. off: skipped.
        CLARIFY and REFUSE are not checked (a question may quote an earlier figure); the pass event says so.
        """
        from .conversation_grounding import MAX_ATTEMPTS, GroundingExceeded, check, rejection
        if self.grounding_exceeded:
            raise GroundingExceeded()
        mode = self.config().get('conversation_grounding', 'enforce')
        if mode == 'off':
            return
        if status in ('CLARIFY', 'REFUSE'):
            self.audit_event('grounding_passed', {'mode': mode, 'skipped': 'status', 'status': status})
            return
        result = check(message, self.observations, self.instruction)
        common = {'mode': mode, 'candidates': result.candidates, 'observation_count': len(self.observations),
                  'grounding_values': result.grounding_values, 'grounding_truncated': result.truncated,
                  'elapsed_ms': result.elapsed_ms}
        if result.ok:
            self.audit_event('grounding_passed', {**common, 'rules': result.rules})
            return
        attempt = self.grounding_rejections + 1
        self.audit_event('ungrounded_amounts', {**common, 'attempt': attempt, 'amounts': result.ungrounded,
                                                'classes': result.classes})
        if mode != 'enforce':
            return
        self.grounding_rejections = attempt
        if attempt >= MAX_ATTEMPTS:
            self.grounding_exceeded = True
            raise GroundingExceeded(result.ungrounded)
        raise ConfigurationError(rejection(result, attempt))

    def audit_event(self, kind, payload):
        """One event on the current conversation_tool operation (the finish call); nothing when audit is off."""
        from .audit import PARENT, event
        from .state import enabled, transaction
        config = getattr(self.store.db, 'config', {})
        operation = PARENT.get()
        if operation is None or not enabled(config):
            return
        with transaction(config) as conn:
            event(conn, operation, kind, payload)

    def schema(self):
        return self.schema_reader(self.config())

    def catalogue(self, app, table, config=None):
        definition = table_schema(self.schema_reader(config or self.config()), app, table)
        return sorted(set(definition['columns']) - HIDDEN)

    def wrap(self, name, value):
        """The calling-thread half of a pooled read: data_catalogue answers as is, the others are observations."""
        return value if name == 'data_catalogue' else self.observe(value)

    def fetch(self, name, a, config):
        """The pure part of a pooled read (no observe, no journal, no audit): safe on a worker thread."""
        if name == 'data_catalogue':
            schema = self.schema_reader(config)
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
                    'guidance': 'Use reviewed native capabilities and Ref keys. Canonical business commands and database triggers enforce their rules. Inspect related effects and pending capabilities before claiming completion. Bounded reviewer SQL is reserved for documented gaps or atomic transactions; no raw API patch authority.'}
        if name == 'read_records':
            table = a['table']
            app = a['app']
            definition = table_schema(self.schema_reader(config),app,table)
            key = definition['key']
            fields = self.catalogue(app,table,config)
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
            predicate = None
            if a['filter']:
                predicate = filter_expression(a['filter'])
            elif keys:
                predicate = {'op':'in','field':key,'value':keys}
            elif a['match_field']:
                field = a['match_field']
                if field not in fields or any(c in field for c in '[]"'):
                    raise ConfigurationError('UNKNOWN_SEARCH_FIELD')
                predicate = {'op':'contains','field':field,'value':a['match_text']}
            elif a['match_text']:
                raise ConfigurationError('SEARCH_FIELD_REQUIRED')
            projected=list(dict.fromkeys([key]+columns))
            cache_key = (app, table, json.dumps(predicate,sort_keys=True), tuple(projected))
            if cache_key not in self.cache:
                rows = self.client(config,app).query(table, projected, predicate, 1001)
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
            return {'app': app, 'table': table, 'total_matched': len(rows), 'offset': offset,
                'rows': [{k: r.get(k) for k in dict.fromkeys([key] + columns + (['_nativeVersion'] if '_nativeVersion' in r else []))} for r in rows[offset:offset + limit]],
                'complete': offset == 0 and len(rows) <= limit}
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
            return {'totals': {k: str(v) for k, v in totals.items()}, 'source': a['observation'],
                    'rows_count': len(source['rows']), 'complete': source['complete']}
        if name == 'sql_query':
            from .conversation_sql import query
            return query(config, a['sql'])
        if name == 'loan_payoff':
            from .conversation_sql import payoff
            return payoff(config, a['loan_id'])
        raise ConfigurationError('TOOL_NOT_PERMITTED')

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
        if self.pooled(name, a):
            return self.wrap(name, self.fetch(name, a, self.config()))
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
            if self.finish_limit is not None and len(a['message']) > self.finish_limit:
                raise ConfigurationError(f'FINISH_MESSAGE_TOO_LONG: {len(a["message"])} characters; the limit is '
                                         f'{self.finish_limit}. Shorten the message and call finish again.')
            self.ground(a['message'], a['status'])
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
