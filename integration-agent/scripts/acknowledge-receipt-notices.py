"""Exact-key, append-only acknowledgement of exhausted optional POSTED notices.

Operator-only: never sends, changes a notice, reopens a review or writes money.
Inspect first; acknowledge only the reviewed row digests in one transaction.
"""
import argparse
import json
import re
from pathlib import Path

from mw_integration_agent import audit
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.state import fence, open_connection


def snapshot(conn, key, lock=False):
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise ConfigurationError('NOTICE_ID_INVALID')
    cursor=conn.execute("SELECT * FROM runtime.partner_notices WHERE stream='receipt' AND id=%s"+
                        (' FOR UPDATE' if lock else ''),(key,))
    rows=cursor.fetchall()
    if len(rows)!=1:raise ConfigurationError('NOTICE_NOT_UNIQUE')
    row=dict(zip([c.name for c in cursor.description],rows[0]))
    parts=row['event_key'].split(':')
    if (len(parts)!=3 or parts[0]!='review-result' or parts[2]!='POSTED' or
        row['ig_status']!='UNAVAILABLE' or row['email_status']!='REJECTED' or
        row['attempts']!=3 or row['message_id'] is not None):
        raise ConfigurationError('NOTICE_NOT_EXHAUSTED_OPTIONAL_RESULT')
    review=conn.execute('SELECT state,payment_id FROM runtime.partner_reviews WHERE id=%s'+
                        (' FOR SHARE' if lock else ''),(parts[1],)).fetchone()
    if not review or review[0]!='POSTED' or not review[1]:
        raise ConfigurationError('POSTED_REVIEW_NOT_CONFIRMED')
    return dict(notice_id=key,observed_sha256=audit.digest(row),event_key=row['event_key'],
                partner_id=row['partner_id'],ig_status=row['ig_status'],email_status=row['email_status'],
                attempts=row['attempts'],payment_id=review[1])


def validate_items(items):
    if not isinstance(items,list) or not 1<=len(items)<=10:
        raise ConfigurationError('ACK_SCOPE_INVALID')
    if len({item['notice_id'] for item in items})!=len(items):
        raise ConfigurationError('ACK_DUPLICATE_NOTICE')


def acknowledge(conn, config, items, operator, reason, authorization):
    validate_items(items)
    if not operator.strip() or not reason.strip() or not authorization.strip():
        raise ConfigurationError('ACK_REASON_AND_AUTHORITY_REQUIRED')
    # All comparisons/locks precede the first audit append. Caller owns one transaction.
    observed=[snapshot(conn,item['notice_id'],lock=True) for item in sorted(items,key=lambda i:i['notice_id'])]
    expected={item['notice_id']:item for item in items}
    if any(item!=expected[item['notice_id']] for item in observed):
        raise ConfigurationError('NOTICE_CHANGED_SINCE_INSPECTION')
    results=[]
    for item in observed:
        plan=dict(contract='optional-notice-ack-v1',observation=item,
                  resolution='ACKNOWLEDGED_UNDELIVERED',reason=reason)
        key=audit.digest([item['notice_id'],item['observed_sha256'],'optional-notice-ack-v1'])
        op=audit.begin(conn,config,'receipt_notice_acknowledgement',key,action='RECONCILE',plan=plan,
                       actor={'kind':'operator','id':operator,'authorization':{'request':authorization}})
        event=audit.event(conn,op,'optional_notification_acknowledged',
            {'notice_id':item['notice_id'],'observed_sha256':item['observed_sha256'],
             'resolution':'ACKNOWLEDGED_UNDELIVERED','payment_id':item['payment_id']},
            state='COMPLETED',key='ack-v1')
        if snapshot(conn,item['notice_id'])!=item:
            raise ConfigurationError('NOTICE_CHANGED_DURING_ACKNOWLEDGEMENT')
        results.append(dict(notice_id=item['notice_id'],operation_id=str(op),event_id=str(event),
                            resolution='ACKNOWLEDGED_UNDELIVERED'))
    return results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['inspect','acknowledge'])
    parser.add_argument('--config',required=True)
    parser.add_argument('--notice-id',action='append')
    parser.add_argument('--plan-file')
    parser.add_argument('--operator');parser.add_argument('--reason');parser.add_argument('--authorization')
    args=parser.parse_args()
    config=json.loads(Path(args.config).read_text())
    config['code_version']='receipt-notice-ack-v1:'+audit.digest(Path(__file__).read_text())
    with open_connection(config) as conn:  # SET ROLE mw_agent_worker first under IAM
        with conn.transaction():
            if args.action=='inspect':
                conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                keys=args.notice_id or []
                validate_items([{'notice_id':key} for key in keys])
                fence(conn,config)
                result=[snapshot(conn,key) for key in sorted(keys)]
            else:
                if not all((args.plan_file,args.operator,args.reason,args.authorization)):
                    parser.error('acknowledge requires plan, operator, reason and authorization')
                fence(conn,config)
                result=acknowledge(conn,config,json.loads(Path(args.plan_file).read_text()),
                                   args.operator,args.reason,args.authorization)
        # Print only after transaction commit; uncertain connection loss is not success.
        print(json.dumps(result,sort_keys=True))


if __name__=='__main__':main()
