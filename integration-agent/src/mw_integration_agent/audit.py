"""Append-only host audit. Atomic journal events; durable external-call intent."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime, UTC
from decimal import Decimal
from functools import wraps
import hashlib
import json
import uuid

from .config import ConfigurationError

NAMESPACE = uuid.UUID('4855e4f3-5a53-5a2e-9bb0-202609220001')
PARENT = ContextVar('agent_audit_parent', default=None)
POLICY = 'agent-postgresql-20260922-v1'


def canonical(value):
    def encode(x):
        if isinstance(x, Decimal): return str(x)
        if isinstance(x, (date, uuid.UUID)): return str(x)
        if isinstance(x, (bytes, bytearray, memoryview)):
            return {'bytes':len(x),'sha256':hashlib.sha256(x).hexdigest()}
        raise TypeError(type(x).__name__)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',',':'), allow_nan=False, default=encode)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def stable(key):
    return uuid.uuid5(NAMESPACE, key)


def begin(conn, config, service, key, action='PROCESS', plan=None, actor=None, message_id=None, operation=None):
    plan = plan or {}
    op = operation or stable(service+':'+key)
    actor = actor or {'kind':'system','id':'mw-agent'}
    values = (op,service,key,PARENT.get(),config.get('audit_environment','production'),action,
        actor.get('kind','system'),actor.get('id'),actor.get('login'),message_id,
        canonical(actor.get('authorization',{})),canonical(plan),digest(plan),
        config.get('code_version','unknown'),POLICY,config['state_generation'])
    inserted = conn.execute('''INSERT INTO audit.operations(operation_id,service_name,idempotency_key,parent_operation_id,
        environment,action,actor_kind,actor_id,actor_login,message_id,"authorization",plan,plan_sha256,code_version,policy_version,process_generation)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s) ON CONFLICT DO NOTHING''', values).rowcount
    if not inserted:
        old = conn.execute('SELECT operation_id,plan_sha256,actor_kind,actor_id,actor_login,message_id,action FROM audit.operations WHERE service_name=%s AND idempotency_key=%s', (service,key)).fetchone()
        if not old or tuple(old) != (op,digest(plan),actor.get('kind','system'),actor.get('id'),actor.get('login'),message_id,action):
            raise ConfigurationError('AUDIT_IDEMPOTENCY_CONTENT_MISMATCH')
    else:
        conn.execute("INSERT INTO runtime.operation_state(operation_id,state) VALUES (%s,'PLANNED')", (op,))
    return op


def event(conn, operation, kind, payload=None, route='internal', state=None, key=None, target=None):
    payload = payload or {}
    target = target or {}
    row = conn.execute('SELECT next_event_seq,state FROM runtime.operation_state WHERE operation_id=%s FOR UPDATE', (operation,)).fetchone()
    if not row:
        raise ConfigurationError('AUDIT_OPERATION_MISSING')
    event_id = stable(str(operation)+':'+key) if key else uuid.uuid4()
    old = conn.execute('SELECT operation_id,event_kind,route,payload_sha256 FROM audit.events WHERE event_id=%s', (event_id,)).fetchone()
    if old:
        if tuple(old) != (operation,kind,route,digest(payload)):
            raise ConfigurationError('AUDIT_EVENT_CONTENT_MISMATCH')
        return event_id
    if state and row[1] in ('COMPLETED','DENIED','CANCELLED','ROLLED_BACK') and state != row[1]:
        raise ConfigurationError('AUDIT_TERMINAL_TRANSITION')
    conn.execute('''INSERT INTO audit.events(event_id,operation_id,operation_seq,event_kind,route,occurred_at,
        target_database,target_schema,target_table,record_keys,payload,payload_sha256)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s)''',
        (event_id,operation,row[0],kind,route,datetime.now(UTC),target.get('database'),target.get('schema'),
         target.get('table'),canonical(target.get('keys',[])),canonical(payload),digest(payload)))
    conn.execute('''UPDATE runtime.operation_state SET next_event_seq=next_event_seq+1,last_event_id=%s,
        state=coalesce(%s,state),updated_at=clock_timestamp() WHERE operation_id=%s''', (event_id,state,operation))
    return event_id


def state_change(conn, config, journal, query, params, count):
    # No signed URLs, receipt bytes, secrets or unrestricted row copies in events.
    plan = {'journal':journal,'statement':query,'parameter_digest':digest(list(params))}
    op = begin(conn,config,'journal',str(uuid.uuid4()),plan=plan)
    event(conn,op,'runtime_changed',{'row_count':count},state='COMPLETED')


@contextmanager
def activity(config, service, action='PROCESS', route='internal', plan=None, key=None, effect=False):
    from .state import enabled, transaction
    if not enabled(config):
        yield None
        return
    with transaction(config) as conn:
        op = begin(conn,config,service,key or str(uuid.uuid4()),action,plan)
        event(conn,op,'dispatch_started' if effect else 'requested',state='DISPATCHING' if effect else 'AUTHORIZED')
    token = PARENT.set(op)
    try:
        yield op
    except BaseException as exc:
        from .graph_email import EmailRejected
        from .receipt_api import NotSent
        # Definite non-dispatch ends the operation FAILED, never UNKNOWN.
        uncertain=effect and not isinstance(exc,(EmailRejected,NotSent))
        try:
            with transaction(config) as conn:
                event(conn,op,'unknown' if uncertain else 'failed',{'exception_type':type(exc).__name__},route,
                      'UNKNOWN' if uncertain else 'FAILED')
        except Exception:
            # Preserve original failure; durable dispatch remains unresolved.
            pass
        raise
    else:
        with transaction(config) as conn:
            event(conn,op,'provider_accepted' if effect else 'completed',route=route,
                  state='COMMITTED' if effect else 'COMPLETED')
    finally:
        PARENT.reset(token)


def audited(service, route='internal', action='PROCESS', effect=False):
    """For entry points whose first argument is config or an object with config."""
    def decorate(fn):
        @wraps(fn)
        def wrapped(first, *args, **kwargs):
            config = first if isinstance(first,dict) else first.config
            with activity(config,service,action,route,effect=effect) as op:
                result=fn(first,*args,**kwargs)
                if op:
                    from .state import transaction
                    with transaction(config) as conn:
                        event(conn,op,'result_observed',{'result_sha256':digest(result),
                            'result_count':len(result) if isinstance(result,(list,dict)) else None},route)
                return result
        return wrapped
    return decorate


@contextmanager
def job(config, service):
    """Single active job per service without holding a database connection.

    Only a provably dead process on THIS host can be retired automatically.
    Retiring a job never releases its uncertain business effects.
    """
    import os
    import socket
    from pathlib import Path
    from .state import enabled, transaction
    outcome={'exit_code':None}
    if not enabled(config):
        yield outcome
        return
    def process_token(pid):
        try: return Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()[19]
        except (OSError,IndexError): return None
    owner={'host':socket.gethostname(),'pid':os.getpid(),'start_token':process_token(os.getpid())}
    with transaction(config) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)',(int(digest(service)[:15],16),))
        for run,op,prior in conn.execute("SELECT run_id,operation_id,summary FROM runtime.job_runs WHERE service_name=%s AND state='RUNNING' FOR UPDATE",(service,)).fetchall():
            if prior.get('host')!=owner['host'] or os.name!='posix' or process_token(prior.get('pid'))==prior.get('start_token'):
                raise ConfigurationError('JOB_OWNER_ACTIVE_OR_UNRESOLVED')
            conn.execute("UPDATE runtime.job_runs SET state='INTERRUPTED',finished_at=clock_timestamp() WHERE run_id=%s",(run,))
            event(conn,op,'interrupted',{'reason':'previous_local_process_terminated'},state='FAILED')
        op=begin(conn,config,service,str(uuid.uuid4()),'JOB',plan={'owner':owner})
        event(conn,op,'requested',state='AUTHORIZED')
        conn.execute("INSERT INTO runtime.job_runs(run_id,operation_id,service_name,started_at,state,summary) VALUES (%s,%s,%s,clock_timestamp(),'RUNNING',%s::jsonb)",(op,op,service,canonical(owner)))
    token=PARENT.set(op)
    try:
        yield outcome
    finally:
        try:
            with transaction(config) as conn:
                status='COMPLETED' if outcome['exit_code']==0 else 'FAILED'
                event(conn,op,status.lower(),outcome,state=status)
                conn.execute('UPDATE runtime.job_runs SET state=%s,finished_at=clock_timestamp(),summary=summary || %s::jsonb WHERE run_id=%s',
                    (status,canonical(outcome),op))
        finally:
            PARENT.reset(token)
