"""Generic AppSheet Add/Edit transport, durable intents and readback.

Codex supplies the table, fields, values and planned final state. This module
contains no loan, payment, expense or other business-operation implementation.
"""
import hashlib
import json
import re
import urllib.parse
import urllib.request
from decimal import Decimal, InvalidOperation
from datetime import datetime
from .config import ConfigurationError, load_secret
from .conversation_schema import ACTOR_FIELDS, PROTECTED_TABLES, table_schema, writable


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
    id_key, secret_key = ('appsheet_app_id','appsheet_key_file') if app == 'oltp' else ('appsheet_olap_app_id','appsheet_olap_key_file')
    expected = {'oltp':'93844270-6aa5-420b-a960-bcdf08abd357','olap':'e74dd368-654f-44d7-bccf-83cf361d1cdb'}
    if app not in expected or config.get(id_key) != expected[app] or action not in ('Add','Edit'):
        raise ConfigurationError('UNAPPROVED_API_TARGET_OR_ACTION')
    request = urllib.request.Request(
        'https://www.appsheet.com/api/v2/apps/' + config[id_key] + '/tables/' + urllib.parse.quote(table, safe='') + '/Action',
        data=json.dumps({'Action': action, 'Properties': {'Locale':'en-US','Timezone':'Asia/Bangkok',
                         'RunAsUserEmail':actor}, 'Rows':[row]}, allow_nan=False).encode(),
        headers={'Content-Type':'application/json','ApplicationAccessKey':load_secret(config,secret_key)}, method='POST')
    # No network retry, including HTTP errors: automations may already have run.
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read(1048576)


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
    from .conversation_tools import literal
    rows = bridge.client(bridge.authorize(),app).find(table, f'Top(Filter({literal(table)}, [{key}] = {literal(ident)}), 2)')
    if len(rows) > 1 or any(str(r.get(key)) != ident for r in rows):
        raise ConfigurationError('RECORD_IDENTITY_MISMATCH')
    return rows


def journal(bridge):
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
    schema = table_schema(bridge.schema(),op['app'],op['table_name'])
    actual = read_one(bridge,op['app'],op['table_name'],schema['key'],op['row_id'])
    expected = json.loads(op['verification'])
    verified = len(actual)==1 and all(k in actual[0] and same(actual[0][k],v,schema['columns'][k]) for k,v in expected.items())
    result = {'operation':operation,'app':op['app'],'table':op['table_name'],'row_id':op['row_id'],
              'state':'VERIFIED' if verified else 'UNKNOWN','write_verified':verified,
              'rows':actual,'expected_final':expected,'complete':True}
    with db:
        db.execute('UPDATE conversation_operations SET state=?,result=? WHERE id=?',
                   (result['state'],json.dumps(result,ensure_ascii=False),operation))
    bridge.write_verified = not db.execute("SELECT 1 FROM conversation_operations WHERE message_id=? AND state='UNKNOWN'",(bridge.message_id,)).fetchone()
    bridge.cache.clear()
    return result


def api_action(bridge, args, writer=dispatch_action, actor_reader=actor_email):
    config = bridge.authorize()
    if config.get('conversation_writes_enabled') is not True:
        raise ConfigurationError('CONVERSATION_WRITES_DISABLED')
    app, table, action = args['app'], args['table'], args['action']
    definition = table_schema(bridge.schema(),app,table)
    modes = {'Add':{'ALL_CHANGES','ADDS_ONLY','ADDS_AND_UPDATES'},'Edit':{'ALL_CHANGES','UPDATES_ONLY','ADDS_AND_UPDATES'}}
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
    if not isinstance(ident,str) or not row or key in row:
        raise ConfigurationError('SUPPLY_FIELDS_WITHOUT_KEY')
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
    if action == 'Edit':
        observed = [r for r in source['rows'] if str(r.get(key)) == ident]
        if len(observed) != 1 or any(f not in observed[0] for f in row):
            raise ConfigurationError('OBSERVE_EXISTING_FIELDS_BEFORE_EDIT')
        fresh = read_one(bridge,app,table,key,ident)
        if len(fresh)!=1 or any(f not in fresh[0] or not same(fresh[0][f],v,definition['columns'][f]) for f,v in observed[0].items()):
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
    if action=='Add' and db.execute('SELECT 1 FROM conversation_operations WHERE fingerprint=?',(fingerprint,)).fetchone():
        raise ConfigurationError('IDENTICAL_ADD_ALREADY_ATTEMPTED_RECONCILE_FIRST')
    if action=='Add':
        ident = operation[:32]
        if read_one(bridge,app,table,key,ident):
            raise ConfigurationError('ADD_KEY_ALREADY_EXISTS')
    bridge.authorize()
    with db:
        inserted = db.execute('INSERT OR IGNORE INTO conversation_operations VALUES (?,?,?,?,?,?,?,?,?,?,NULL)',
            (operation,bridge.message_id,fingerprint,app,table,ident,action,json.dumps({key:ident,**row}),json.dumps(expected),'UNKNOWN')).rowcount
    if not inserted:
        raise ConfigurationError('OPERATION_ALREADY_ATTEMPTED_NO_REPLAY')
    bridge.possible_write, bridge.write_verified = True,False
    try:
        writer(bridge.authorize(),app,table,action,{key:ident,**row},actor)
    except Exception:
        raise ConfigurationError('API_OUTCOME_UNCERTAIN_NO_REPLAY operation='+operation) from None
    return verify_operation(bridge,operation)
