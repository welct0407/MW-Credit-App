"""Idempotent business audit relay and read-only uncertain-write reconciliation."""
from contextlib import contextmanager
import json
from decimal import Decimal
from . import audit
from .config import DATABASES, PASSWORD_PORT, ConfigurationError, auth_mode, iam_port, load_secret
from .state import transaction


@contextmanager
def business(config):
    import psycopg
    if config.get('database_host') not in ('127.0.0.1','::1') or config.get('database_name') not in DATABASES.values():
        raise ConfigurationError('OUTBOX_TARGET_DENIED')
    # The relay is an agent role: its credential family (password file or the IAM listener
    # plus SET ROLE) follows agent_database_auth, while the database is the business one.
    mode=auth_mode(config,'agent_database_')
    credential=({'user':config['database_iam_user']} if mode=='iam' else
                {'user':'mw_agent_relay','password':load_secret(config,'agent_database_relay_password_file')})
    with psycopg.connect(host=config['database_host'],port=iam_port(config) if mode=='iam' else PASSWORD_PORT,dbname=config['database_name'],
        autocommit=True,connect_timeout=10,application_name='mw-agent-outbox',**credential) as conn:
        if mode=='iam':
            conn.execute('SET ROLE mw_agent_relay')
        yield conn


def relay(config):
    exported=0
    with business(config) as source:
        markers=source.execute('''SELECT operation_id,plan_sha256,reviewer_id,reviewer_login,database_txid::text,
                recorded_in_transaction_at FROM agent_audit.commits c
                WHERE NOT EXISTS(SELECT 1 FROM agent_audit.exports e WHERE e.operation_id=c.operation_id)
                ORDER BY recorded_in_transaction_at,operation_id LIMIT 20''').fetchall()
        for op,plan_hash,actor,login,txid,stamp in markers:
            rows=source.execute('''SELECT change_id,schema_name::text,table_name::text,action,row_key::text,
                    before_row::text,after_row::text FROM agent_audit.row_changes WHERE operation_id=%s ORDER BY change_id''',(op,)).fetchall()
            with transaction(config,'relay') as central:
                intent=central.execute('SELECT plan_sha256,actor_id,actor_login,service_name,plan,actor_kind FROM audit.operations WHERE operation_id=%s',(op,)).fetchone()
                if intent and intent[3]=='receipt_projection':
                    from .receipt_audit import verify_marker, ACTOR
                    if (intent[0] != audit.digest(intent[4]) or tuple(intent[1:3]) != (actor,login)
                            or intent[5] != ACTOR['kind']):
                        raise ConfigurationError('OUTBOX_INTENT_MISMATCH')
                    verify_marker(op,plan_hash,actor,login,rows,intent[4],config['database_name'])
                elif intent and intent[3]=='operator_sql_reconciliation':
                    from .operator_audit import snapshot, verify
                    verify(snapshot(source, op), config['database_name'], intent)
                elif intent and intent[3]=='operator_sql':
                    from .operator_execution import verify_marker
                    marker=source.execute('''SELECT operation_id::text,plan_sha256,reviewer_id,reviewer_login,
                        direct_targets->0,database_txid::text FROM agent_audit.commits WHERE operation_id=%s''',(op,)).fetchone()
                    verify_marker(marker,intent)
                elif not intent or tuple(intent[:3])!=(plan_hash,actor,login):
                    raise ConfigurationError('OUTBOX_INTENT_MISMATCH')
                for ident,schema,table,action,key,before,after in rows:
                    decode=lambda s: json.loads(s,parse_float=lambda n:str(Decimal(n))) if s is not None else None
                    audit.event(central,op,'row_changed',{'action':action,'before':decode(before),'after':decode(after)},
                        'postgres',key='business-row:'+str(ident),target={'database':config['database_name'],
                            'schema':schema,'table':table,'keys':[decode(key)]})
                current=central.execute('SELECT state FROM runtime.operation_state WHERE operation_id=%s',(op,)).fetchone()[0]
                completed=audit.event(central,op,'business_committed',{'transaction_id':txid,'recorded_in_transaction_at':str(stamp),
                    'row_changes':len(rows)},'postgres','COMMITTED' if current in ('DISPATCHING','UNKNOWN') else None,key='business-committed')
            # Separate commit: retry after a crash above compares stable event content.
            source.execute('''INSERT INTO agent_audit.exports(operation_id,central_completion_event_id)
                VALUES (%s,%s) ON CONFLICT DO NOTHING''',(op,completed))
            old=source.execute('SELECT central_completion_event_id FROM agent_audit.exports WHERE operation_id=%s',(op,)).fetchone()
            if not old or old[0]!=completed:
                raise ConfigurationError('OUTBOX_ACK_MISMATCH')
            exported+=1
    return {'exported':exported}


def reconcile(config):
    """Only proven committed SQL operations; never release unknown API sends."""
    from .conversation_dml import connect, metadata, select
    with transaction(config) as central:
        pending=central.execute('''SELECT d.id,d.request,o.operation_id,o.plan_sha256,o.actor_id,o.actor_login
            FROM runtime.conversation_dml d JOIN audit.operations o
            ON o.service_name='reviewer_dml' AND o.idempotency_key=d.id WHERE d.state='UNKNOWN' LIMIT 20''').fetchall()
    verified=0
    for legacy,raw,op,plan_hash,actor,login in pending:
        request=json.loads(raw)
        final=[]
        with connect(config) as source:
            marker=source.execute('SELECT plan_sha256,reviewer_id,reviewer_login FROM agent_audit.commits WHERE operation_id=%s',(op,)).fetchone()
            if not marker: continue  # absence is not proof of rollback
            if (marker['plan_sha256'],marker['reviewer_id'],marker['reviewer_login'])!=(plan_hash,actor,login):
                raise ConfigurationError('RECONCILE_MARKER_MISMATCH')
            valid=True
            for step in request['plan']:
                expected={**step['values'],**step['expected_after']}
                expected={k:login if v=='__ACTOR__' else v for k,v in expected.items()}
                columns=metadata(source,step['table'])
                rows=select(source,step['table'],columns,{'Row ID':step['row_id'],**expected})
                if (step['action']=='DELETE' and rows) or (step['action']!='DELETE' and len(rows)!=1):
                    valid=False;break
                final.append({'table':step['table'],'rows':rows})
        if not valid: continue
        result={'operation':legacy,'state':'VERIFIED','write_verified':True,'atomic':True,'records':final,'reconciled':True}
        with transaction(config) as central:
            central.execute("UPDATE runtime.conversation_dml SET state='VERIFIED',result=%s WHERE id=%s AND state='UNKNOWN'",(audit.canonical(result),legacy))
            audit.event(central,op,'reconciled',result,'postgres','VERIFIED',key='worker-reconciled')
        verified+=1
    return {'verified':verified}
