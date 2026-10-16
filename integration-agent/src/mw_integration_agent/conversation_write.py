"""Native semantic commands, durable intents and read-only reconciliation.

Codex supplies the table, fields, values and planned final state. This module
contains no loan, payment, expense or other business-operation implementation.
"""
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from .config import ConfigurationError
from .conversation_reviewer import require_reviewer
from .conversation_schema import ACTOR_FIELDS, PROTECTED_TABLES, table_schema, writable
from .state import is_postgres
from . import audit


def object_json(value):
    if not isinstance(value, str) or len(value) > 16000:
        raise ConfigurationError('BOUNDED_JSON_OBJECT_REQUIRED')
    def pairs(items):
        result = {}
        for key, v in items:
            if key in result:
                raise ValueError('duplicate')
            result[key] = v
        return result
    try:
        result = json.loads(value, object_pairs_hook=pairs,
                            parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if not isinstance(result, dict) or any(not isinstance(k,str) or not isinstance(v,(str,int,float,bool,type(None))) for k,v in result.items()):
            raise ValueError('scalar fields required')
        return result
    except (ValueError, TypeError):
        raise ConfigurationError('INVALID_ROW_JSON') from None


def actor_email(config, partner_id):
    from .cash_statement import read_query
    if not isinstance(partner_id, str) or not partner_id:
        raise ConfigurationError('AUTHENTICATED_PARTNER_REQUIRED')
    pid = "'" + partner_id.replace("'", "''") + "'"
    actors = read_query(config, 'SELECT coalesce(json_agg("Login Email"),\'[]\'::json) '
                        'FROM public."Partners" WHERE "Row ID"=' + pid + ';')
    if len(actors) != 1 or not isinstance(actors[0], str) or '@' not in actors[0]:
        raise ConfigurationError('PARTNER_LOGIN_UNMAPPED')
    return actors[0]


def dispatch_action(config, app, table, action, row, actor):
    if config.get('conversation_writes_enabled') is not True:
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    if action=='Delete' and (not config.get('native_delete_enabled') or config.get('state_backend')!='postgres'):
        raise ConfigurationError('NATIVE_DELETE_DISABLED')
    if app not in ('oltp','olap') or action not in ('Add','Edit','Delete') or set(row)!={'nativeRequest'}:
        raise ConfigurationError('NATIVE_CANONICAL_REQUEST_REQUIRED')
    from .conversation_api import call
    return call(config,'commands',row['nativeRequest'])


def same(value, expected, column):
    kind = column.get('Type')
    if value is None or expected is None:
        return ('' if value is None else value) == ('' if expected is None else expected)
    if kind in ('Date','DateTime'):
        def date(x):
            for fmt in ('%m/%d/%Y','%Y-%m-%d','%m/%d/%Y %H:%M:%S','%Y-%m-%dT%H:%M:%S'):
                try:
                    return datetime.strptime(str(x),fmt)
                except ValueError:
                    pass
            return str(x)
        return date(value) == date(expected)
    if kind in ('Price','Decimal','Number','Percent'):
        try:
            def number(x):
                raw = str(x).replace(',','').replace('฿','').strip()
                n = Decimal(raw.rstrip('%'))
                if not n.is_finite():
                    raise InvalidOperation()
                return n / 100 if raw.endswith('%') else n
            return number(value) == number(expected)
        except InvalidOperation:
            return False
    if kind == 'Yes/No':
        def boolean(x):
            return {'true':True,'yes':True,'y':True,'false':False,'no':False,'n':False}.get(str(x).lower(), x)
        return boolean(value) == boolean(expected)
    return str(value) == str(expected)


def read_one(bridge, app, table, key, ident):
    definition=table_schema(bridge.schema(),app,table)
    columns=[name for name,column in definition['columns'].items()
             if column.get('nativeStatus') in ('physical','semantic-action','provider')]
    if key not in columns:
        columns.insert(0,key)
    rows = bridge.client(bridge.authorize(),app).query(table, columns,
        {'op':'eq','field':key,'value':ident}, 2)
    if len(rows) > 1 or any(str(r.get(key)) != ident for r in rows):
        raise ConfigurationError('RECORD_IDENTITY_MISMATCH')
    return rows


def journal(bridge):
    from .state import is_postgres
    if is_postgres(bridge.store.db):
        return bridge.store.db
    bridge.store.db.execute('''CREATE TABLE IF NOT EXISTS conversation_operations (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      app TEXT NOT NULL, table_name TEXT NOT NULL, row_id TEXT NOT NULL,
      action TEXT NOT NULL, request TEXT NOT NULL, verification TEXT NOT NULL,
      state TEXT NOT NULL, result TEXT, UNIQUE(message_id,fingerprint))''')
    bridge.store.db.commit()
    return bridge.store.db


def verify_operation(bridge, operation):
    db = journal(bridge)
    op = db.execute('SELECT * FROM conversation_operations WHERE id=? AND message_id=?',
                    (operation,bridge.message_id)).fetchone()
    if not op:
        raise ConfigurationError('CURRENT_OPERATION_REQUIRED')
    intent=json.loads(op['request'])
    native=intent.get('transport')=='native-v1'
    recorded_effect=None
    if native:
        from .conversation_api import call
        status,outcome=call(bridge.authorize(),'status',request_id=intent['nativeRequest']['command']['requestId'])
        if status!=200 or outcome.get('kind')!='recorded':
            raise ConfigurationError('NATIVE_OUTCOME_UNRESOLVED_NO_REPLAY operation='+operation)
        original=outcome.get('originalOutcome',{})
        if original.get('status')=='rejected':
            result={'operation':operation,'app':op['app'],'table':op['table_name'],'row_id':op['row_id'],
                    'state':'REJECTED','write_verified':True,'applied':False,'code':original.get('code'),'rows':[], 'complete':True}
            with db:
                db.execute('UPDATE conversation_operations SET state=?,result=? WHERE id=?',
                           ('REJECTED',json.dumps(result),operation))
            bridge.write_verified=not db.execute("SELECT 1 FROM conversation_operations WHERE message_id=? AND state='UNKNOWN'",(bridge.message_id,)).fetchone()
            return result
        if original.get('status')!='applied':
            raise ConfigurationError('NATIVE_OUTCOME_UNRESOLVED_NO_REPLAY operation='+operation)
        recorded_effect=original.get('result')
        command=intent['nativeRequest']['command']
        if not isinstance(recorded_effect,dict) or recorded_effect.get('operation')!=command['operation'] or recorded_effect.get('targetId')!=command['targetId']:
            raise ConfigurationError('NATIVE_RECORDED_EFFECT_MISMATCH')
    schema = table_schema(bridge.schema(),op['app'],op['table_name'])
    actual = read_one(bridge,op['app'],op['table_name'],schema['key'],op['row_id'])
    expected = json.loads(op['verification'])
    if native:
        semantic_tokens={'loan.generate-charge':{'Charge Generation Request'},'assessment.refresh':{'SQL Refresh Token'},
                         'loan.close':{'Payment Request Token','Payment Request Cash Account'}}
        expected={k:v for k,v in expected.items() if k not in semantic_tokens.get(command['operation'],set())}
        if command['operation']=='loan.close':expected['Loan Status']='ปิดยอดแล้ว'
        if command['operation']=='payment.create' and op['table_name'] in ('Borrowers','Charges'):
            expected={k:v for k,v in expected.items() if k not in {'Payment Request Token','Payment Request Cash Account'}}
    verified = (not actual) if op['action']=='Delete' else (len(actual)==1 and all(k in actual[0] and same(actual[0][k],v,schema['columns'][k]) for k,v in expected.items()))
    effect_rows=None
    if native and command['operation'] in ('payment.create','loan.close'):
        payment_id=recorded_effect.get('paymentId')
        if not isinstance(payment_id,str):raise ConfigurationError('NATIVE_PAYMENT_EFFECT_ID_REQUIRED')
        effect_rows=read_one(bridge,'oltp','Payments','Row ID',payment_id)
        verified=verified and len(effect_rows)==1 and effect_rows[0].get('Status')=='Posted'
        if command['operation']=='payment.create' and len(effect_rows)==1:
            payment_schema=table_schema(bridge.schema(),'oltp','Payments')
            effect_fields={'Ref Borrower':'borrowerId','Amount Received':'amountReceived','Payment Date':'paymentDate',
                           'Created At':'createdAt','Bank Reference':'bankReference'}
            verified=verified and all(same(effect_rows[0].get(field),command['inputs'][key],payment_schema['columns'][field]) for field,key in effect_fields.items())
    result = {'operation':operation,'app':op['app'],'table':op['table_name'],'row_id':op['row_id'],
              'state':'VERIFIED' if verified else 'UNKNOWN','write_verified':verified,
              'rows':actual,'expected_final':expected,'complete':True}
    if native:result['recorded_native_effect']=recorded_effect
    if effect_rows is not None:result['payment_effect_rows']=effect_rows
    with db:
        db.execute('UPDATE conversation_operations SET state=?,result=? WHERE id=?',
                   (result['state'],json.dumps(result,ensure_ascii=False),operation))
        if is_postgres(db):
            audit.event(db.conn,audit.stable('reviewer_api:'+operation),'verified' if verified else 'unknown',
                result,'native_api' if native else 'legacy_native_readback','VERIFIED' if verified else 'UNKNOWN')
    bridge.write_verified = not db.execute("SELECT 1 FROM conversation_operations WHERE message_id=? AND state='UNKNOWN'",(bridge.message_id,)).fetchone()
    bridge.cache.clear()
    return result


def api_action(bridge, args, writer=dispatch_action, actor_reader=actor_email):
    config = bridge.authorize()
    if config.get('conversation_writes_enabled') is not True:
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    require_reviewer(config, bridge.partner_id)
    from .conversation_dml import unknown, journal as dml_journal
    if unknown(bridge):
        raise ConfigurationError('PRIOR_OPERATION_UNCERTAIN_RECONCILE_FIRST')
    if dml_journal(bridge).execute('SELECT 1 FROM conversation_dml WHERE message_id=?',(bridge.message_id,)).fetchone():
        raise ConfigurationError('DO_NOT_MIX_API_AND_DML')
    app, table, action = args['app'], args['table'], args['action']
    definition = table_schema(bridge.schema(),app,table)
    modes = {'Add':{'ALL_CHANGES','ADDS_ONLY','ADDS_AND_UPDATES'},'Edit':{'ALL_CHANGES','UPDATES_ONLY','ADDS_AND_UPDATES'},'Delete':{'ALL_CHANGES'}}
    if action not in modes or definition['permission'] not in modes[action] or table in PROTECTED_TABLES:
        raise ConfigurationError('TABLE_OR_ACTION_NOT_WRITABLE')
    quote = args['instruction_quote']
    if not isinstance(quote,str) or not quote.strip() or quote not in bridge.instruction:
        raise ConfigurationError('CURRENT_PARTNER_INSTRUCTION_REQUIRED')
    step = args['operation_key']
    if not isinstance(step,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',step):
        raise ConfigurationError('STABLE_OPERATION_KEY_REQUIRED')
    row, expected = object_json(args['row_json']), object_json(args['expected_final_json'])
    key = definition['key']
    ident = args['row_id']
    if not isinstance(ident,str) or (not row and action!='Delete') or key in row:
        raise ConfigurationError('SUPPLY_FIELDS_WITHOUT_KEY')
    if action=='Delete':
        if not is_postgres(bridge.store.db) or not config.get('native_delete_enabled'):
            raise ConfigurationError('NATIVE_DELETE_DISABLED')
        if not ident or row or expected:
            raise ConfigurationError('DELETE_EXACT_KEY_EMPTY_VALUES_REQUIRED')
        # Native semantic commands enforce their own dependency/child guards.
        # The separate reviewer DML route retains its exact deletion manifest.
    if action == 'Add' and ident:
        raise ConfigurationError('ADD_KEY_IS_HOST_GENERATED')
    if any(k not in definition['columns'] for k in expected):
        raise ConfigurationError('UNKNOWN_VERIFICATION_FIELD')
    actor = actor_reader(config,bridge.partner_id)
    for field in row:
        if field in ACTOR_FIELDS:
            if action == 'Edit' and field == 'Created By':
                raise ConfigurationError('CREATION_ACTOR_IMMUTABLE')
            if field not in definition['columns'] or row[field] != '__ACTOR__':
                raise ConfigurationError('ACTOR_MUST_BE_AUTHENTICATED_PARTNER')
            row[field] = actor
        elif not writable(table,definition,field,action):
            raise ConfigurationError('PROTECTED_OR_COMPUTED_FIELD')
    if action == 'Add' and 'Created By' in definition['columns']:
        row['Created By'] = actor
    for field in ACTOR_FIELDS & expected.keys():
        if expected[field] != '__ACTOR__':
            raise ConfigurationError('ACTOR_MUST_BE_AUTHENTICATED_PARTNER')
        expected[field] = actor
    # Expected overrides represent intentional server transitions (e.g. Processing
    # to Posted). All submitted fields otherwise require matching readback.
    expected = {**row,**expected}
    source = bridge.observations.get(args['observation'])
    if not source or source.get('app') != app or source.get('table') != table or 'rows' not in source:
        raise ConfigurationError('CURRENT_TABLE_OBSERVATION_REQUIRED')
    if action in ('Edit','Delete'):
        observed = [r for r in source['rows'] if str(r.get(key)) == ident]
        if len(observed) != 1 or any(f not in observed[0] for f in row):
            raise ConfigurationError('OBSERVE_EXISTING_FIELDS_BEFORE_EDIT')
        fresh = read_one(bridge,app,table,key,ident)
        if len(fresh)!=1 or any(f not in fresh[0] or (fresh[0][f]!=v if f in ('_nativeVersion','_nativeCommand') else not same(fresh[0][f],v,definition['columns'][f])) for f,v in observed[0].items()):
            raise ConfigurationError('RECORD_CHANGED_BEFORE_EDIT')
    elif not source.get('complete'):
        raise ConfigurationError('COMPLETE_DUPLICATE_SEARCH_REQUIRED_BEFORE_ADD')
    db = journal(bridge)
    if db.execute("SELECT 1 FROM conversation_operations WHERE state='UNKNOWN'").fetchone():
        raise ConfigurationError('PRIOR_OPERATION_UNCERTAIN_RECONCILE_FIRST')
    if db.execute('SELECT count(*) FROM conversation_operations WHERE message_id=?',(bridge.message_id,)).fetchone()[0] >= 10:
        raise ConfigurationError('TURN_WRITE_LIMIT_REACHED')
    operation = hashlib.sha256((bridge.message_id+':'+step).encode()).hexdigest()
    fingerprint = hashlib.sha256(json.dumps([app,table,action,ident,row],sort_keys=True).encode()).hexdigest()
    if 'Payment Request Token' in row:
        fingerprint=hashlib.sha256(json.dumps([app,table,'Payment Request Token',ident,row['Payment Request Token']],sort_keys=True).encode()).hexdigest()
        if db.execute('SELECT 1 FROM conversation_operations WHERE fingerprint=?',(fingerprint,)).fetchone():
            raise ConfigurationError('PAYMENT_TOKEN_ALREADY_ATTEMPTED_NO_REPLAY')
        # V23's historical key remains a read-only duplicate boundary after
        # retiring source-token mutation. Never reinterpret a past quick action.
        legacy_key='r008:'+hashlib.md5((table+'|'+str(len(ident))+':'+ident+'|'+str(row['Payment Request Token'])).encode()).hexdigest()
        if bridge.client(config,'oltp').query('Payments',['Row ID'],{'op':'eq','field':'Row ID','value':legacy_key},2):
            raise ConfigurationError('LEGACY_PAYMENT_TOKEN_ALREADY_ATTEMPTED_NO_REPLAY')
    if action=='Add' and db.execute('SELECT 1 FROM conversation_operations WHERE fingerprint=?',(fingerprint,)).fetchone():
        raise ConfigurationError('IDENTICAL_ADD_ALREADY_ATTEMPTED_RECONCILE_FIRST')
    if action=='Add':
        from .conversation_api import request_id
        ident = request_id(config['conversation_api_environment'],bridge.message_id,step)
        if read_one(bridge,app,table,key,ident):
            raise ConfigurationError('ADD_KEY_ALREADY_EXISTS')
    from .conversation_commands import build_operation, FIELDS
    defaults={}
    if action=='Add':
        from .conversation_defaults import resolve_creation_defaults
        wanted=set(FIELDS.get(table,('',{}))[1].values())
        defaults=resolve_creation_defaults(config,app,table,definition,row,ident,wanted,client_factory=bridge.client)
    elif table in ('Borrowers','Charges') and 'Payment Request Token' in row:
        from .conversation_defaults import resolve_creation_defaults
        payment_definition=table_schema(bridge.schema(),'oltp','Payments')
        account=row.get('Payment Request Cash Account',fresh[0].get('Payment Request Cash Account'))
        defaults=resolve_creation_defaults(config,'oltp','Payments',payment_definition,
            {'Ref Received By Cash Account':account},ident,{'Created At','Ref Received By Cash Holder'},client_factory=bridge.client)
    native=build_operation(config,bridge.message_id,step,table,action,ident,row,definition,
                           fresh[0] if action!='Add' else None,defaults)
    request={'version':1,'actorPartnerId':bridge.partner_id,**native}
    bridge.authorize()
    with db:
        inserted = db.execute('INSERT OR IGNORE INTO conversation_operations VALUES (?,?,?,?,?,?,?,?,?,?,NULL)',
            (operation,bridge.message_id,fingerprint,app,table,ident,action,json.dumps({'transport':'native-v1','nativeRequest':request,'sourceRow':{key:ident,**row}},ensure_ascii=False),json.dumps(expected),'UNKNOWN')).rowcount
        if inserted and is_postgres(db):
            op=audit.begin(db.conn,config,'reviewer_api',operation,{'Add':'INSERT','Edit':'UPDATE','Delete':'DELETE'}[action],
                {'app':app,'table':table,'action':action,'row_id':ident,'values':row,'before':source['rows'],
                 'expected':expected,'instruction_quote':quote,'coverage':'observed_not_atomic'},
                {'kind':'reviewer','id':bridge.partner_id,'login':actor,'authorization':{'current_ai_reviewer':True}},bridge.message_id)
            audit.event(db.conn,op,'route_selected',{'capability':'reviewed_native_command','route':'native_api'},'native_api','AUTHORIZED')
            audit.event(db.conn,op,'dispatch_started',route='native_api',state='DISPATCHING')
    if not inserted:
        raise ConfigurationError('OPERATION_ALREADY_ATTEMPTED_NO_REPLAY')
    bridge.possible_write, bridge.write_verified = True,False
    try:
        fresh_config = bridge.authorize()
        require_reviewer(fresh_config, bridge.partner_id)
        response=writer(fresh_config,app,table,action,{'nativeRequest':request},actor)
        if response is not None and response[0] not in (200,422):
            raise ConfigurationError('NATIVE_COMMAND_NOT_ACKNOWLEDGED')
    except Exception:
        raise ConfigurationError('API_OUTCOME_UNCERTAIN_NO_REPLAY operation='+operation) from None
    return verify_operation(bridge,operation)


def api_delete_scope(config, table, row_id):
    """An API call cannot enforce a dependent deletion manifest atomically.

    Permit the API when there are no FK children and no business DELETE trigger;
    otherwise explain the atomicity gap, allowing the reviewer SQL route.
    """
    from .conversation_dml import connect, TABLES, identifier
    from psycopg import sql
    if table not in TABLES:
        raise ConfigurationError('DELETE_RESOURCE_DENIED')
    with connect(config) as conn:
        if conn.execute('''SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(format('public.%%I',%s::text))
            AND NOT tgisinternal AND (tgtype & 8)<>0 AND tgname<>'mw_agent_capture' LIMIT 1''',(table,)).fetchone():
            raise ConfigurationError('API_DELETE_ATOMICITY_GAP_USE_SQL_AND_INSPECT_TRIGGERS')
        refs=conn.execute('''SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,cardinality(k.conkey) AS width,k.confdeltype AS delete_action
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1]
            WHERE k.contype='f' AND k.confrelid=to_regclass(format('public.%%I',%s::text))''',(table,)).fetchall()
        for ref in refs:
            if ref['width']!=1 or ref['schema']!='public' or ref['delete_action'] not in ('a','r'):
                raise ConfigurationError('API_DELETE_DEPENDENCY_REQUIRES_SQL')
            query=sql.SQL('SELECT 1 FROM {}.{} WHERE {}=%s LIMIT 1').format(identifier(ref['schema']),identifier(ref['table']),identifier(ref['column']))
            if conn.execute(query,(row_id,)).fetchone():
                raise ConfigurationError('API_DELETE_HAS_CHILDREN_REQUIRE_APPROVED_SQL_PLAN')
