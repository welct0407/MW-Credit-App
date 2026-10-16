"""Reviewer-selected, parameterized row DML; no model SQL or business scripts.

All steps and assertions run in one serializable transaction. An intent is
durable before dispatch; a lost commit acknowledgement is never retried.
"""
import hashlib
import json
from contextlib import contextmanager

from .config import DML_ROLES, ConfigurationError, aware_cutoff, environment, load_secret
from .conversation_reviewer import require_reviewer
from .conversation_schema import ACTOR_FIELDS, PROTECTED_FIELDS, writable
from .state import is_postgres
from . import audit

# Resource boundary, not a list of supported business operations. Trigger-owned
# allocations and derived values cannot be edited directly by the model.
TABLES = ('Borrowers', 'Loans', 'Charges', 'Repayments', 'Payments',
          'Business Expenses', 'Settlements', 'Cash Ledger', 'Cash Pool Contributions')


def journal(bridge):
    db = bridge.store.db
    from .state import is_postgres
    if is_postgres(db):
        return db
    db.execute('''CREATE TABLE IF NOT EXISTS conversation_dml (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, actor TEXT NOT NULL,
      request TEXT NOT NULL, state TEXT NOT NULL, result TEXT)''')
    db.execute('CREATE TABLE IF NOT EXISTS conversation_dml_inserts (fingerprint TEXT PRIMARY KEY, operation TEXT NOT NULL)')
    db.commit()
    return db


def unknown(bridge):
    return journal(bridge).execute("SELECT 1 FROM conversation_dml WHERE state='UNKNOWN'").fetchone() is not None


def authorize(bridge):
    config = bridge.authorize()
    if config.get('reviewer_dml_enabled') is not True:
        raise ConfigurationError('REVIEWER_DML_DISABLED')
    try:
        cutoff=aware_cutoff(config,'reviewer_dml_cutoff')
        if any(float(config[k]) < cutoff.timestamp() for k in
               ('_conversation_event_timestamp','_conversation_captured_at')):
            raise ValueError()
    except (KeyError,ValueError,TypeError):
        raise ConfigurationError('DML_REQUEST_PREDATES_ACTIVATION') from None
    return config, require_reviewer(config, bridge.partner_id)


@contextmanager
def connect(config, write=False):
    import psycopg
    from psycopg.rows import dict_row
    # Fixed loopback endpoint, the environment's business database and its dedicated
    # reviewer role with a separate password credential (the V33 audit functions pin
    # session_user, so this role stays on the password listener). Never accept a DSN,
    # SQL expression, connection option or role name from inbound content.
    try:
        role = DML_ROLES[environment(config)]
    except ConfigurationError:
        raise ConfigurationError('UNAPPROVED_DML_DATABASE') from None
    if (config.get('database_host') not in ('127.0.0.1', '::1')
            or config.get('database_port') != 5432
            or config.get('database_dml_user') != role):
        raise ConfigurationError('UNAPPROVED_DML_DATABASE')
    with psycopg.connect(host=config['database_host'], port=5432,
            dbname=config['database_name'], user=role,
            password=load_secret(config, 'database_dml_password_file'),
            connect_timeout=10, autocommit=True, application_name='mw-reviewer-dml',
            options='-c default_transaction_read_only=on', row_factory=dict_row) as conn:
        conn.execute('BEGIN ISOLATION LEVEL SERIALIZABLE ' + ('READ WRITE' if write else 'READ ONLY'))
        conn.execute("SET LOCAL statement_timeout = '15s'")
        conn.execute("SET LOCAL lock_timeout = '3s'")
        conn.execute("SET LOCAL idle_in_transaction_session_timeout = '30s'")
        conn.execute("SET LOCAL search_path = pg_catalog, public")
        conn.execute("SET LOCAL timezone = 'Asia/Bangkok'")
        yield conn
        # The caller alone commits writes after durable intent, readback and
        # final authorization. Reads are always rolled back.
        conn.rollback()


def identifier(value):
    from psycopg import sql
    return sql.Identifier(value)


def metadata(conn, table):
    if table not in TABLES:
        raise ConfigurationError('DML_TABLE_NOT_ALLOWED')
    rows = conn.execute('''SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS required, a.attgenerated AS generated,
      pg_get_expr(d.adbin,d.adrelid) AS default
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname=%s AND c.relkind='r'
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum''', (table,)).fetchall()
    if not rows or 'Row ID' not in {r['name'] for r in rows}:
        raise ConfigurationError('DML_SCHEMA_MISMATCH')
    return {r['name']: r for r in rows}


def writable_fields(bridge, table, columns):
    fields = set()
    for app in bridge.schema()['apps'].values():
        definition = app['tables'].get(table)
        if definition:
            fields.update(f for f in columns if writable(table, definition, f, 'Edit'))
    return fields - PROTECTED_FIELDS - {'Row ID', 'Created At', 'Processed At', 'Updated At'}


def catalogue(bridge, table):
    config, _ = authorize(bridge)
    if not table:
        return {'tables': list(TABLES), 'actions': ['INSERT', 'UPDATE'],
                'limits': 'API first. SQL fallback reason must start api_gap: or atomic:. One atomic transaction per turn, at most 10 exact-key rows. Database DELETE is retired; approved deletions use the native API Delete. No DDL, SQL expressions, settings, functions or trigger bypass. Existing database guards remain authoritative.'}
    with connect(config) as conn:
        columns = metadata(conn, table)
        constraints = conn.execute('''SELECT conname AS name, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint WHERE conrelid=to_regclass(format('public.%%I',%s::text))''', (table,)).fetchall()
        triggers = conn.execute('''SELECT tgname AS name, pg_get_triggerdef(t.oid) AS definition,
          pg_get_functiondef(t.tgfoid) AS function
          FROM pg_trigger t WHERE tgrelid=to_regclass(format('public.%%I',%s::text)) AND NOT tgisinternal''', (table,)).fetchall()
    return {'table': table, 'key': 'Row ID', 'columns': columns,
            'writable_fields': sorted(writable_fields(bridge, table, columns)),
            'actor_fields': sorted(ACTOR_FIELDS & columns.keys()),
            'constraints': constraints, 'triggers': triggers}


def scalar_map(value):
    if not isinstance(value, dict) or len(value)>100 or any(
        not isinstance(k,str) or not k or not isinstance(v,(str,int,float,bool,type(None)))
        for k,v in value.items()):
        raise ConfigurationError('DML_SCALAR_OBJECT_REQUIRED')
    # Reject nonfinite numbers and unbounded payloads before driver adaptation.
    try:
        if len(json.dumps(value,allow_nan=False))>24000:
            raise ValueError()
    except (ValueError,TypeError):
        raise ConfigurationError('DML_BOUNDED_VALUES_REQUIRED') from None
    return value


def select(conn, table, columns, where, lock=False):
    from psycopg import sql
    scalar_map(where)
    if not where or any(k not in columns for k in where):
        raise ConfigurationError('DML_BOUNDED_FILTER_REQUIRED')
    predicate = sql.SQL(' AND ').join(sql.SQL('{} IS NOT DISTINCT FROM CAST(%s AS {} )').format(identifier(k),sql.SQL(columns[k]['type'])) for k in where)
    query = sql.SQL('SELECT row_to_json(r)::text AS row FROM (SELECT * FROM public.{} WHERE {} LIMIT 101{}) r').format(
        identifier(table), predicate, sql.SQL(' FOR UPDATE' if lock else ''))
    from decimal import Decimal
    rows = [json.loads(r['row'], parse_float=lambda value: str(Decimal(value))) for r in conn.execute(query, list(where.values())).fetchall()]
    if len(rows)>100:
        raise ConfigurationError('DML_READ_BOUND_NARROW_FILTER')
    return rows


def read(bridge, table, where):
    config, _ = authorize(bridge)
    with connect(config) as conn:
        columns = metadata(conn,table)
        rows = select(conn,table,columns,where)
    return bridge.observe({'database':True,'table':table,'where':where,'rows':rows,'complete':True})


def parse_plan(raw):
    if not isinstance(raw,str) or len(raw)>60000:
        raise ConfigurationError('DML_PLAN_TOO_LARGE')
    def pairs(items):
        d = {}
        for k,v in items:
            if k in d: raise ValueError()
            d[k]=v
        return d
    try:
        plan=json.loads(raw,object_pairs_hook=pairs,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError,TypeError):
        raise ConfigurationError('DML_INVALID_JSON') from None
    if not isinstance(plan,list) or not 1<=len(plan)<=10:
        raise ConfigurationError('DML_ONE_TO_TEN_ROWS_REQUIRED')
    seen=set()
    for step in plan:
        if not isinstance(step,dict) or set(step)!={'action','table','row_id','values','expected_after','observation'}:
            raise ConfigurationError('DML_STEP_FIELDS_INVALID')
        if step['action']=='DELETE':
            # Retired 16 October 2026: the role holds no DELETE on the source tables; refused before any connection.
            raise ConfigurationError('REVIEWER_DELETE_RETIRED')
        if step['action'] not in ('INSERT','UPDATE') or step['table'] not in TABLES:
            raise ConfigurationError('DML_ACTION_OR_TABLE_DENIED')
        if not isinstance(step['row_id'],str) or not step['row_id'] or len(step['row_id'])>200:
            raise ConfigurationError('DML_EXACT_KEY_REQUIRED')
        key=(step['table'],step['row_id'])
        if key in seen: raise ConfigurationError('DML_DUPLICATE_TARGET')
        seen.add(key)
        scalar_map(step['values']); scalar_map(step['expected_after'])
        if not step['values'] or 'Row ID' in step['values'] or 'Row ID' in step['expected_after']:
            raise ConfigurationError('DML_KEY_IMMUTABLE')
    return plan


def transaction(bridge, args):
    from psycopg import sql, Error as PgError
    config, actor = authorize(bridge)
    quote, reason = args['instruction_quote'], args['reason']
    if not isinstance(quote,str) or not quote.strip() or quote not in bridge.instruction:
        raise ConfigurationError('CURRENT_REVIEWER_INSTRUCTION_REQUIRED')
    if not isinstance(reason,str) or not 5<=len(reason.strip())<=1000:
        raise ConfigurationError('DML_AUDIT_REASON_REQUIRED')
    plan=parse_plan(args['steps_json'])
    central = is_postgres(bridge.store.db)
    if central:
        require_fallback(bridge, plan, reason)
    from .conversation_write import journal as api_journal
    if api_journal(bridge).execute("SELECT 1 FROM conversation_operations WHERE state='UNKNOWN'").fetchone() or unknown(bridge):
        raise ConfigurationError('PRIOR_OPERATION_UNCERTAIN_RECONCILE_FIRST')
    if api_journal(bridge).execute('SELECT 1 FROM conversation_operations WHERE message_id=?',(bridge.message_id,)).fetchone():
        raise ConfigurationError('DO_NOT_MIX_API_AND_DML')
    db=journal(bridge)
    operation=hashlib.sha256(('dml:'+bridge.message_id).encode()).hexdigest()
    if db.execute('SELECT 1 FROM conversation_dml WHERE id=?',(operation,)).fetchone():
        raise ConfigurationError('DML_ALREADY_ATTEMPTED_NO_REPLAY')
    # The full current observation is retained in the intent, not merely in the
    # transient model cache, so both sides of a correction survive a restart.
    sources=[]
    for step in plan:
        source=bridge.observations.get(step['observation'])
        if not source or not source.get('database') or source.get('table')!=step['table']:
            raise ConfigurationError('CURRENT_DATABASE_OBSERVATION_REQUIRED')
        if step['action']=='INSERT':
            if source.get('where')!={'Row ID':step['row_id']} or source['rows']:
                raise ConfigurationError('DML_OBSERVE_ABSENT_INSERT_KEY')
        elif len([r for r in source['rows'] if r['Row ID']==step['row_id']])!=1:
            raise ConfigurationError('DML_OBSERVE_UPDATE_ROW')
        sources.append(source)
    fingerprints=[hashlib.sha256(json.dumps([step['table'],step['values']],sort_keys=True).encode()).hexdigest()
                  for step in plan if step['action']=='INSERT']
    if len(fingerprints)!=len(set(fingerprints)) or any(db.execute(
            'SELECT 1 FROM conversation_dml_inserts WHERE fingerprint=?',(fp,)).fetchone() for fp in fingerprints):
        raise ConfigurationError('IDENTICAL_DML_INSERT_ALREADY_ATTEMPTED_RECONCILE_FIRST')
    with db:
        db.executemany('INSERT INTO conversation_dml_inserts VALUES (?,?)',[(fp,operation) for fp in fingerprints])
        db.execute('INSERT INTO conversation_dml VALUES (?,?,?,?,?,NULL)',
            (operation,bridge.message_id,actor,json.dumps({'reason':reason,'quote':quote,'plan':plan,'before':sources}), 'UNKNOWN'))
        if central:
            central_op = audit.begin(db.conn,config,'reviewer_dml',operation,'PROCESS',
                {'reason':reason,'quote':quote,'plan':plan,'before':sources},
                {'kind':'reviewer','id':bridge.partner_id,'login':actor,
                 'authorization':{'current_ai_reviewer':True}},bridge.message_id)
            audit.event(db.conn,central_op,'route_selected',{'reason':reason,'route':'postgres'},'postgres','AUTHORIZED')
            audit.event(db.conn,central_op,'dispatch_started',route='postgres',state='DISPATCHING')
    bridge.possible_write, bridge.write_verified=True,False
    committing=False
    try:
        with connect(config,write=True) as conn:
            if central:
                conn.execute('SELECT agent_audit.begin_operation(%s,%s,%s,%s,%s,%s::jsonb,%s)',
                    (central_op,bridge.partner_id,actor,audit.digest({'reason':reason,'quote':quote,'plan':plan,'before':sources}),
                     reason,audit.canonical([{'action':s['action'],'table':s['table'],'row_id':s['row_id']} for s in plan]),
                     config.get('code_version','unknown')))
            actual=[]
            for step,source in zip(plan,sources):
                columns=metadata(conn,step['table'])
                fields=writable_fields(bridge,step['table'],columns)
                values=dict(step['values'])
                for field,value in list(values.items()):
                    if field in ACTOR_FIELDS and field in columns:
                        if value!='__ACTOR__' or (field=='Created By' and step['action']=='UPDATE'):
                            raise ConfigurationError('DML_ACTOR_IMMUTABLE')
                        values[field]=actor
                    elif field not in fields or columns[field]['generated']:
                        raise ConfigurationError('DML_PROTECTED_OR_COMPUTED_FIELD')
                expected={**values,**step['expected_after']}
                for field in ACTOR_FIELDS & expected.keys():
                    if field in step['expected_after'] and expected[field]!='__ACTOR__':
                        raise ConfigurationError('DML_ACTOR_IMMUTABLE')
                    expected[field]=actor
                if any(k not in columns for k in expected):
                    raise ConfigurationError('DML_UNKNOWN_CHECK_FIELD')
                before=select(conn,step['table'],columns,{'Row ID':step['row_id']},lock=True)
                if step['action'] in ('UPDATE','DELETE'):
                    observed=[r for r in source['rows'] if r['Row ID']==step['row_id']]
                    if before!=observed:
                        raise ConfigurationError('DML_ROW_CHANGED_SINCE_OBSERVATION')
                    if step['action']=='DELETE':
                        query=sql.SQL('DELETE FROM public.{} WHERE "Row ID"=%s').format(identifier(step['table']))
                        params=[step['row_id']]
                    else:
                        query=sql.SQL('UPDATE public.{} SET {} WHERE "Row ID"=%s').format(identifier(step['table']),
                            sql.SQL(',').join(sql.SQL('{}=%s').format(identifier(k)) for k in values))
                        params=[*values.values(),step['row_id']]
                else:
                    if before: raise ConfigurationError('DML_INSERT_KEY_EXISTS')
                    if 'Created By' in columns:
                        values['Created By']=actor; expected['Created By']=actor
                    values={'Row ID':step['row_id'],**values}
                    query=sql.SQL('INSERT INTO public.{} ({}) VALUES ({})').format(identifier(step['table']),
                        sql.SQL(',').join(map(identifier,values)),sql.SQL(',').join(sql.Placeholder() for _ in values))
                    params=list(values.values())
                if conn.execute(query,params).rowcount!=1:
                    raise ConfigurationError('DML_EXACTLY_ONE_ROW_REQUIRED')
                actual.append((step,columns,expected))
            # Check final states after ALL steps, including deferred constraints.
            conn.execute('SET CONSTRAINTS ALL IMMEDIATE')
            if central:
                changes=conn.execute('''SELECT table_name,action,row_key,
                    octet_length(coalesce(before_row::text,''))+octet_length(coalesce(after_row::text,'')) AS bytes
                    FROM agent_audit.row_changes WHERE operation_id=%s''',(central_op,)).fetchall()
                deleted={(r['table_name'],r['row_key']['Row ID']) for r in changes if r['action']=='DELETE'}
                approved={(s['table'],s['row_id']) for s in plan if s['action']=='DELETE'}
                if deleted!=approved:
                    raise ConfigurationError('UNAPPROVED_CASCADE_ROLLBACK')
                if len(changes)>1000 or sum(r['bytes'] for r in changes)>10*1024*1024:
                    raise ConfigurationError('DML_AUDIT_EFFECT_LIMIT')
            final=[]
            for step,columns,expected in actual:
                rows=select(conn,step['table'],columns,{'Row ID':step['row_id'],**expected})
                if (step['action']=='DELETE' and rows) or (step['action']!='DELETE' and len(rows)!=1):
                    raise ConfigurationError('DML_FINAL_STATE_MISMATCH')
                final.append({'table':step['table'],'rows':rows})
            if authorize(bridge)[1]!=actor:
                raise ConfigurationError('DML_REVIEWER_CHANGED')
            committing=True
            conn.commit()
        result={'operation':operation,'state':'VERIFIED','write_verified':True,'atomic':True,'records':final}
        with db:
            db.execute('UPDATE conversation_dml SET state=?,result=? WHERE id=?',('VERIFIED',json.dumps(result),operation))
            if central:
                audit.event(db.conn,central_op,'verified',{'operation':operation,'records':final},'postgres','VERIFIED',key='worker-verified')
        bridge.write_verified=True
        bridge.cache.clear()
        return bridge.observe(result)
    except Exception as exc:
        if committing:
            raise ConfigurationError('DML_COMMIT_UNCERTAIN_NO_REPLAY operation='+operation) from None
        # No COMMIT was dispatched; disconnect/rollback cannot persist these
        # transactional table mutations. Never retry a serialization failure.
        code=str(exc) if isinstance(exc,ConfigurationError) else ('SQLSTATE_'+str(exc.sqlstate) if isinstance(exc,PgError) else type(exc).__name__)
        with db:
            db.execute('UPDATE conversation_dml SET state=?,result=? WHERE id=?',('ROLLED_BACK',json.dumps({'reason':code}),operation))
            if central:
                audit.event(db.conn,central_op,'rolled_back',{'reason':code},'postgres','ROLLED_BACK')
        bridge.possible_write=False
        bridge.write_verified=False
        raise ConfigurationError('DML_ROLLED_BACK '+code) from None


def require_fallback(bridge, plan, reason):
    """Require capability evidence; rejection/timeouts do not authorize bypass."""
    if reason.startswith('atomic:') and len(reason.removeprefix('atomic:').strip())>=10:
        return
    if not reason.startswith('api_gap:'):
        raise ConfigurationError('API_FIRST_FALLBACK_REASON_REQUIRED')
    modes={'INSERT':{'ALL_CHANGES','ADDS_ONLY','ADDS_AND_UPDATES'},
           'UPDATE':{'ALL_CHANGES','UPDATES_ONLY','ADDS_AND_UPDATES'},'DELETE':{'ALL_CHANGES'}}
    for step in plan:
        supported=False
        for app in bridge.schema()['apps'].values():
            definition=app['tables'].get(step['table'])
            action='Add' if step['action']=='INSERT' else 'Edit'
            if definition and definition['permission'] in modes[step['action']] and all(
                f in ACTOR_FIELDS or writable(step['table'],definition,f,action) for f in step['values']):
                supported=True
        if not supported:
            return
    raise ConfigurationError('APPSHEET_SUPPORTS_PLAN_USE_API_FIRST')
