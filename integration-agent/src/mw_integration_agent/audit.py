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
JOB = ContextVar('agent_audit_job', default=None)  # the current job() run: its lazy JOB operation and reference reads
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
    parent = PARENT.get()
    # A direct child of a lazy job materialises the JOB operation first (same transaction) and
    # references the routine reads the cycle used so far. request_reference is not part of the
    # idempotency comparison below, so a retry with other reads cannot mismatch.
    reference = materialise_parent(conn, parent)
    values = (op,service,key,parent,config.get('audit_environment','production'),action,
        actor.get('kind','system'),actor.get('id'),actor.get('login'),message_id,
        canonical(actor.get('authorization',{})),canonical(plan),digest(plan),
        config.get('code_version','unknown'),POLICY,config['state_generation'],canonical(reference))
    inserted = conn.execute('''INSERT INTO audit.operations(operation_id,service_name,idempotency_key,parent_operation_id,
        environment,action,actor_kind,actor_id,actor_login,message_id,"authorization",plan,plan_sha256,code_version,policy_version,process_generation,request_reference)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s::jsonb) ON CONFLICT DO NOTHING''', values).rowcount
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


def started(config, service, plan=None, action='PROCESS'):
    """The requested half of a non-effect activity(), for work that finishes later on the same thread.

    Used by ConversationTools.call_many: every audit write stays on the calling thread while the reads run
    in a pool. The parent is the current PARENT (the model_turn operation). None when audit is off.
    """
    from .state import enabled, transaction
    if not enabled(config):
        return None
    with transaction(config) as conn:
        op = begin(conn,config,service,str(uuid.uuid4()),action,plan)
        event(conn,op,'requested',state='AUTHORIZED')
    return op


def finished(config, op, exc=None, route='internal'):
    """The closing half of started(): completed, or failed with the exception type (as activity() writes it)."""
    from .state import transaction
    if op is None:
        return
    if exc is None:
        with transaction(config) as conn:
            event(conn,op,'completed',route=route,state='COMPLETED')
        return
    try:
        with transaction(config) as conn:
            event(conn,op,'failed',{'exception_type':type(exc).__name__},route,'FAILED')
    except Exception:
        pass


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


def audited(service, route='internal', action='PROCESS', effect=False, plan=None):
    """For entry points whose first argument is config or an object with config.

    `plan`, when given, is called with the entry point's arguments and returns the operation plan.
    """
    def decorate(fn):
        @wraps(fn)
        def wrapped(first, *args, **kwargs):
            config = first if isinstance(first,dict) else first.config
            with activity(config,service,action,route,plan=plan(first,*args,**kwargs) if plan else None,effect=effect) as op:
                result=fn(first,*args,**kwargs)
                if op:
                    from .state import transaction
                    with transaction(config) as conn:
                        event(conn,op,'result_observed',{'result_sha256':digest(result),
                            'result_count':len(result) if isinstance(result,(list,dict)) else None},route)
                return result
        return wrapped
    return decorate


def reads_reference(reads):
    """What a child operation records about the routine reads its cycle used before it (prefix-verifiable)."""
    return {'reference_reads':len(reads),'reference_reads_sha256':digest(reads)} if reads else {}


def service_lock(conn, service):
    """The per-service transaction lock. Every start, child materialisation and exit of a service's job
    takes it first, so the heartbeat and the RUNNING job run are read and written in series: a start
    never observes a half-written run, and a run never writes after it was retired."""
    conn.execute('SELECT pg_advisory_xact_lock(%s)',(int(digest(service)[:15],16),))


def owned(conn, run):
    """Under the service lock: the heartbeat still names this run (operation and run key) as the RUNNING owner."""
    return bool(conn.execute('''SELECT 1 FROM runtime.service_heartbeats WHERE service_name=%s AND operation_id=%s AND run_key=%s AND state='RUNNING' ''',
                             (run['service'],run['op'],run['key'])).fetchone())


def job_run_state(conn, run):
    # The job run row is the truth (its insert commits or rolls back with the child), never a process flag.
    row=conn.execute('SELECT state FROM runtime.job_runs WHERE run_id=%s',(run['op'],)).fetchone()
    return row[0] if row else None


def materialise(conn, run, fence=True):
    """Write the JOB operation, its requested event and its RUNNING job run exactly as an eager start did.

    With fence, the service lock is taken and the heartbeat must still name this run as the service's
    RUNNING owner: a retired process cannot create a second RUNNING job run (the V3 unique index then
    stays unreachable), and a concurrent start waits behind this transaction instead of racing it.
    """
    if fence:
        service_lock(conn,run['service'])
        if not owned(conn,run):
            raise ConfigurationError('JOB_OWNERSHIP_LOST')
        conn.execute('''UPDATE runtime.service_heartbeats SET materialised=true,last_effect_at=clock_timestamp(),
            updated_at=clock_timestamp() WHERE service_name=%s AND operation_id=%s''',(run['service'],run['op']))
    token=PARENT.set(None)
    try:
        op=begin(conn,run['config'],run['service'],run['key'],'JOB',plan={'owner':run['owner']},operation=run['op'])
    finally:
        PARENT.reset(token)
    event(conn,op,'requested',state='AUTHORIZED')
    conn.execute("INSERT INTO runtime.job_runs(run_id,operation_id,service_name,started_at,state,summary) VALUES (%s,%s,%s,%s,'RUNNING',%s::jsonb)",
                 (op,op,run['service'],run['started_at'],canonical(run['owner'])))
    return op


def materialise_parent(conn, parent):
    run=JOB.get()
    if run is None or parent!=run['op']:
        return {}
    # Every direct child is fenced under the service lock: the job run must be this run's open one (or
    # not yet written) and the heartbeat must still name this run. A run retired while lazy finds its
    # INTERRUPTED row here and cannot add children to it.
    service_lock(conn,run['service'])
    state=job_run_state(conn,run)
    if state is None:
        materialise(conn,run)
    elif state!='RUNNING' or not owned(conn,run):
        raise ConfigurationError('JOB_OWNERSHIP_LOST')
    return reads_reference(run['reads'])


def reference(name, fn, *args, **kwargs):
    """A routine reference read inside a job: no READ tree of its own; its digest and row counts are
    summarised on the JOB record when the cycle materialises (effect or failure) and referenced by
    every child begun after it. Outside a job the audited function runs as before."""
    run=JOB.get()
    if run is None:
        return fn(*args,**kwargs)
    entry={'name':name,'occurred_at':datetime.now(UTC).isoformat()}
    try:
        result=getattr(fn,'__wrapped__',fn)(*args,**kwargs)
    except BaseException as exc:
        entry['exception_type']=type(exc).__name__
        run['reads'].append(entry)
        raise
    rows={k:len(v) for k,v in result.items() if isinstance(v,list)} if isinstance(result,dict) else None
    entry.update(result_sha256=digest(result),result_count=len(result) if isinstance(result,(list,dict)) else None,rows=rows)
    run['reads'].append(entry)
    return result


@contextmanager
def job(config, service):
    """Single active job per service without holding a database connection.

    The owner fence is runtime.service_heartbeats (V6), one row per service, taken under the
    service advisory lock; child materialisation and the exit take the same lock and require the
    heartbeat to still name this run. Only a provably dead process on THIS host can be retired automatically.
    Retiring a job never releases its uncertain business effects. The JOB operation is lazy: an
    idle run updates the heartbeat only; the first child operation, a failure or an interruption
    materialises exactly the rows an eager start wrote (operation, requested event, job run).
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
    def dead(prior):
        return prior.get('host')==owner['host'] and os.name=='posix' and process_token(prior.get('pid'))!=prior.get('start_token')
    owner={'host':socket.gethostname(),'pid':os.getpid(),'start_token':process_token(os.getpid())}
    key=str(uuid.uuid4())
    run={'service':service,'config':config,'key':key,'op':stable(service+':'+key),'owner':owner,'reads':[]}
    interrupted={'reason':'previous_local_process_terminated'}
    with transaction(config) as conn:
        # The service lock serialises this start with every child materialisation and exit of the
        # service (they take it first too), so the heartbeat row locked next and the RUNNING job runs
        # read after it are the committed truth: no run is half-written while we look.
        service_lock(conn,service)
        beat=conn.execute('''SELECT operation_id,run_key,owner,process_generation,code_version,last_started_at FROM runtime.service_heartbeats
            WHERE service_name=%s AND state='RUNNING' FOR UPDATE''',(service,)).fetchone()
        retired=False
        # Materialised runs (and runs of a pre-V6 binary) still own the service through their RUNNING job run.
        for run_id,op,prior in conn.execute("SELECT run_id,operation_id,summary FROM runtime.job_runs WHERE service_name=%s AND state='RUNNING' FOR UPDATE",(service,)).fetchall():
            if not dead(prior):
                raise ConfigurationError('JOB_OWNER_ACTIVE_OR_UNRESOLVED')
            conn.execute("UPDATE runtime.job_runs SET state='INTERRUPTED',finished_at=clock_timestamp() WHERE run_id=%s",(run_id,))
            event(conn,op,'interrupted',interrupted,state='FAILED')
            retired=True
        if beat and not conn.execute('SELECT 1 FROM runtime.job_runs WHERE run_id=%s',(beat[0],)).fetchone():
            # A lazy run still owns the service. A dead one is interrupted on the record it never wrote.
            if not dead(beat[2]):
                raise ConfigurationError('JOB_OWNER_ACTIVE_OR_UNRESOLVED')
            prior={'service':service,'config':dict(config,state_generation=str(beat[3]),code_version=beat[4]),
                   'key':beat[1],'op':beat[0],'owner':beat[2],'started_at':beat[5]}
            op=materialise(conn,prior,fence=False)
            conn.execute("UPDATE runtime.job_runs SET state='INTERRUPTED',finished_at=clock_timestamp() WHERE run_id=%s",(op,))
            event(conn,op,'interrupted',interrupted,state='FAILED')
            retired=True
        if retired:
            conn.execute('''UPDATE runtime.service_heartbeats SET state='INTERRUPTED',last_outcome='INTERRUPTED',last_finished_at=clock_timestamp(),
                exit_code=NULL,updated_at=clock_timestamp() WHERE service_name=%s AND state='RUNNING' ''',(service,))
        run['started_at']=conn.execute('''INSERT INTO runtime.service_heartbeats(service_name,operation_id,run_key,owner,process_generation,code_version,state,last_started_at)
            VALUES (%s,%s,%s,%s::jsonb,%s,%s,'RUNNING',clock_timestamp())
            ON CONFLICT (service_name) DO UPDATE SET operation_id=EXCLUDED.operation_id,run_key=EXCLUDED.run_key,owner=EXCLUDED.owner,
              process_generation=EXCLUDED.process_generation,code_version=EXCLUDED.code_version,state='RUNNING',
              last_started_at=EXCLUDED.last_started_at,exit_code=NULL,materialised=false,updated_at=clock_timestamp()
            RETURNING last_started_at''',(service,run['op'],key,canonical(owner),config['state_generation'],config.get('code_version','unknown'))).fetchone()[0]
    token=PARENT.set(run['op'])
    job_token=JOB.set(run)
    try:
        yield outcome
    finally:
        try:
            with transaction(config) as conn:
                service_lock(conn,service)
                status='COMPLETED' if outcome['exit_code']==0 else 'FAILED'
                owns=owned(conn,run)
                state=job_run_state(conn,run)
                if owns and state is None and (status=='FAILED' or outcome.get('effect')):
                    materialise(conn,run)
                    state='RUNNING'
                # Only this run's own open record is closed. A run retired by another process (its job run
                # INTERRUPTED, the heartbeat renamed) is left exactly as the retiring process wrote it: no
                # completed/failed after interrupted, no second RUNNING run, no heartbeat write.
                written=state=='RUNNING'
                if written:
                    summary=dict(outcome,**({'reference_reads':run['reads']} if run['reads'] else {}))
                    event(conn,run['op'],status.lower(),summary,state=status)
                    conn.execute('''UPDATE runtime.job_runs SET state=%s,finished_at=clock_timestamp(),summary=summary || %s::jsonb
                        WHERE run_id=%s AND state='RUNNING' ''',(status,canonical(summary),run['op']))
                if owns:
                    conn.execute('''UPDATE runtime.service_heartbeats SET state=%s,last_outcome=%s,last_finished_at=clock_timestamp(),exit_code=%s,
                        consecutive_noop=CASE WHEN %s THEN 0 ELSE consecutive_noop+1 END,
                        last_effect_at=CASE WHEN %s THEN clock_timestamp() ELSE last_effect_at END,materialised=%s,updated_at=clock_timestamp()
                        WHERE service_name=%s AND operation_id=%s AND state='RUNNING' ''',
                        (status,status,outcome['exit_code'],written,written,written,service,run['op']))
        finally:
            JOB.reset(job_token)
            PARENT.reset(token)
