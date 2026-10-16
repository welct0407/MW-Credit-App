"""Bounded read-only relay completion/backlog evidence for the collector."""
import time
from .config import ConfigurationError
from .state import fence, open_connection
from .outbox import business


def assess(snapshot, now):
    fields={'status':4,'completed_at':0,'completed_success':0,'backlog':0,
            'oldest_unexported_seconds':0,'missing_intents':0,'running':0,'inspection_failed':0}
    try:
        count=snapshot['backlog'];oldest=snapshot['oldest'];missing=snapshot['missing_intents']
        if any(type(v) is not int or v<0 for v in (count,missing)) or missing>count:
            raise ValueError()
        fields.update(backlog=count,missing_intents=missing)
        if count:
            if type(oldest) not in (int,float) or oldest>now+120 or oldest<=0:
                raise ValueError()
            fields['oldest_unexported_seconds']=int(max(0,now-oldest))
        elif oldest is not None:
            raise ValueError()
        completed=snapshot['completed']
        # This always-enabled relay cannot establish health without a completed
        # outcome. Fail closed rather than letting Unknown clear its alert.
        status=0
        if completed:
            stamp,state,exit_code=completed
            if type(stamp) not in (int,float) or stamp<=0 or stamp>now+120:
                raise ValueError()
            fields['completed_at']=int(stamp)
            fields['completed_success']=int(state=='COMPLETED' and type(exit_code) is int and exit_code==0)
            status=1 if fields['completed_success'] else 0
            if status==1 and now-stamp>180:status=2
        running=snapshot['running']
        if running is not None:
            if type(running) not in (int,float) or running<=0 or running>now+120:
                raise ValueError()
            fields['running']=1
            if now-running>180 and status==1:status=2
        if missing:status=0
        elif count and fields['oldest_unexported_seconds']>180 and status==1:status=2
        fields['status']=status
    except (KeyError,ValueError,TypeError,OverflowError):
        fields.update(status=0,inspection_failed=1)
    return fields


def inspect(config, now=None):
    now=time.time() if now is None else now
    if config.get('state_backend')!='postgres':
        raise ConfigurationError('RELAY_HEALTH_POSTGRES_REQUIRED')
    # open_connection runs SET ROLE mw_agent_worker first under IAM (ALL-ARCH-03).
    with open_connection(config,options='-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000') as central, \
            business(config) as source:
        source.execute('SET default_transaction_read_only=on')
        source.execute('SET statement_timeout=5000')
        with central.transaction():
            central.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            fence(central,config)
            complete=central.execute('''SELECT extract(epoch FROM finished_at)::double precision,state,
                summary->'exit_code' FROM runtime.job_runs WHERE service_name='audit-relay' AND finished_at IS NOT NULL
                ORDER BY finished_at DESC,started_at DESC,run_id DESC LIMIT 1''').fetchone()
            running=central.execute("SELECT extract(epoch FROM min(started_at))::double precision FROM runtime.job_runs WHERE service_name='audit-relay' AND state='RUNNING'").fetchone()[0]
            # Source snapshot is read AFTER the central snapshot. A newly committed
            # receipt may not be visible centrally yet; missing-intent diagnosis
            # therefore applies only beyond a normal relay cycle (30 seconds).
            count,oldest=source.execute('''SELECT count(*),extract(epoch FROM min(recorded_in_transaction_at))::double precision
                FROM agent_audit.commits c WHERE NOT EXISTS(SELECT 1 FROM agent_audit.exports e WHERE e.operation_id=c.operation_id)''').fetchone()
            candidates=source.execute('''SELECT operation_id FROM agent_audit.commits c
                WHERE recorded_in_transaction_at < now()-interval '30 seconds'
                AND NOT EXISTS(SELECT 1 FROM agent_audit.exports e WHERE e.operation_id=c.operation_id)
                ORDER BY recorded_in_transaction_at,operation_id LIMIT 20''').fetchall()
            ids=[r[0] for r in candidates]
            present=central.execute('SELECT operation_id FROM audit.operations WHERE operation_id=ANY(%s::uuid[])',(ids,)).fetchall() if ids else []
    return assess({'completed':complete,'running':running,'backlog':count,'oldest':oldest,
                   'missing_intents':len(ids)-len(present)},now)
