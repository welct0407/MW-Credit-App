"""Durable canonical intent for explicitly approved operator SQL requests.

Preparation precedes the Cloud executor's business connection. Repeated or
uncertain requests are reconciliation-only; this module never executes DML.
"""
import uuid
from . import audit
from .config import ConfigurationError
from .outbox import business
from .state import transaction

SERVICE = 'operator_sql'
FIELDS = {'kind','operation_id','database','payment','receipt','moves','reason','code_version',
          'actor_id','actor_login','authorization_reference'}


def validate(value):
    try:
        if (not isinstance(value,dict) or set(value)!=FIELDS
                or value['kind']!='interest-reallocation-v2' or value['database']!='loan_manager_prod'
                or str(uuid.UUID(value['operation_id']))!=value['operation_id']
                or not isinstance(value['receipt'],dict) or not isinstance(value['moves'],list)
                or not 1<=len(value['moves'])<=20
                or any(not isinstance(value[k],str) or not value[k].strip() for k in
                       ('payment','reason','code_version','actor_id','actor_login','authorization_reference'))
                or len(audit.canonical(value).encode())>10*1024*1024):
            raise ValueError()
    except (KeyError,ValueError,TypeError,AttributeError):
        raise ConfigurationError('OPERATOR_CANONICAL_REQUEST_INVALID') from None
    return audit.digest(value)


def marker(config, operation):
    with business(config) as source:
        source.execute('SET default_transaction_read_only=on')
        source.execute('SET statement_timeout=5000')
        return source.execute('''SELECT operation_id::text,plan_sha256,reviewer_id,reviewer_login,
            direct_targets->0,database_txid::text FROM agent_audit.commits WHERE operation_id=%s''',
            (operation,)).fetchone()


def prepare(config, value):
    digest=validate(value)
    if marker(config,value['operation_id']):
        raise ConfigurationError('OPERATOR_BUSINESS_COMMIT_EXISTS_RECONCILE_ONLY')
    scope='operator:interest-reallocation:'+value['payment']
    with transaction(config) as central:
        central.execute('SELECT pg_advisory_xact_lock(%s)',(int(audit.digest(scope)[:15],16),))
        if central.execute('SELECT 1 FROM audit.operations WHERE operation_id=%s',(value['operation_id'],)).fetchone():
            raise ConfigurationError('OPERATOR_ALREADY_ATTEMPTED_RECONCILE_ONLY')
        if central.execute("SELECT 1 FROM runtime.operation_state WHERE blocking_scope=%s AND state IN ('DISPATCHING','UNKNOWN') LIMIT 1",(scope,)).fetchone():
            raise ConfigurationError('OPERATOR_SCOPE_UNCERTAIN_RECONCILE_FIRST')
        actor={'kind':'operator','id':value['actor_id'],'login':value['actor_login'],
               'authorization':{'owner_reference':value['authorization_reference']}}
        op=audit.begin(central,config,SERVICE,value['operation_id'],'UPDATE',value,actor,
                       operation=uuid.UUID(value['operation_id']))
        audit.event(central,op,'dispatch_started',{'plan_sha256':digest,'authority':'explicit-owner-operator-request'},
                    route='postgres',state='DISPATCHING',key='operator-dispatch-v2')
        central.execute('UPDATE runtime.operation_state SET blocking_scope=%s WHERE operation_id=%s',(scope,op))
    # Independent readback after the central transaction commits. Failure here
    # never grants a second dispatch; the durable operation stays in doubt.
    with transaction(config) as central:
        row=central.execute('''SELECT o.plan_sha256,o.plan,o.actor_kind,s.state FROM audit.operations o
            JOIN runtime.operation_state s USING(operation_id) WHERE operation_id=%s''',(value['operation_id'],)).fetchone()
        if not row or row!=(digest,value,'operator','DISPATCHING'):
            raise ConfigurationError('OPERATOR_DURABLE_INTENT_READBACK_FAILED')
    return {'prepared':True,'operation_id':value['operation_id'],'plan_sha256':digest,'business_writes':0}


def verify_marker(row, intent):
    try:
        digest,actor,login,service,value,kind=intent
        expected=validate(value)
        if (service!=SERVICE or kind!='operator' or digest!=expected or not row
                or row[:4]!=(value['operation_id'],expected,actor,login)
                or (actor,login)!=(value['actor_id'],value['actor_login']) or row[4]!=value
                or not row[5].isdecimal()):
            raise ValueError()
    except (KeyError,ValueError,TypeError,AttributeError):
        raise ConfigurationError('OUTBOX_OPERATOR_CANONICAL_MISMATCH') from None


def observe(config, value):
    digest=validate(value)
    row=marker(config,value['operation_id'])
    with transaction(config) as central:
        intent=central.execute('SELECT plan_sha256,actor_id,actor_login,service_name,plan,actor_kind FROM audit.operations WHERE operation_id=%s',
                               (value['operation_id'],)).fetchone()
        if not intent or intent[0]!=digest or intent[4]!=value:
            raise ConfigurationError('OPERATOR_INTENT_OBSERVATION_CONFLICT')
        if row:
            verify_marker(row,intent)
            state='COMMITTED';kind='operator_commit_observed'
            payload={'transaction_id':row[5],'plan_sha256':digest}
        else:
            state='UNKNOWN';kind='operator_outcome_unknown'
            payload={'plan_sha256':digest,'business_marker_absent_is_not_retry_permission':True}
        audit.event(central,uuid.UUID(value['operation_id']),kind,payload,route='postgres',state=state,key=kind+'-v2')
    return {'operation_id':value['operation_id'],'state':state,'replay_permitted':False,'business_writes':0}
