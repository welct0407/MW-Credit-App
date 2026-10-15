"""Receipt ownership, including the owner's explicitly configured group forwarder."""
import json
from .receipt_rules import borrower_for, username, ReceiptInvalid
from .instagram import Instagram


def forwarded_borrower(config, master, participants, sender):
    if config.get('receipt_forwarding_enabled') is not True or len(participants)!=3:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    ids=[str(p.get('id','')) for p in participants]
    names=[username(p.get('username')) for p in participants]
    if len(set(ids))!=3 or len(set(names))!=3 or not all(i.isdigit() for i in ids) or not all(names):
        raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
    partners=[p for p in master['partners'] if p['id']==config.get('receipt_forwarder_partner_id')]
    if len(partners)!=1:raise ReceiptInvalid('FORWARDER_UNMAPPED')
    forwarder=username(partners[0]['username'])
    if sum(username(p['username'])==forwarder for p in master['partners'])!=1:
        raise ReceiptInvalid('FORWARDER_UNMAPPED')
    business=[p for p in participants if str(p['id'])==str(config['instagram_account_id'])
              and username(p.get('username'))==username(config.get('receipt_group_account_username'))]
    source=[p for p in participants if str(p['id'])==str(sender) and username(p.get('username'))==forwarder]
    if len(business)!=1 or len(source)!=1 or business[0]==source[0]:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    borrower=[p for p in participants if p not in (business[0],source[0])]
    if len(borrower)!=1:raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
    return borrower_for(borrower[0],master['borrowers'])


def receipt_borrower(config,job,journal,master,identity_reader,api=None):
    # Forwarding is allowed only for the message captured by our group poller.
    # Re-read the exact group's membership before validation and before posting.
    if config.get('receipt_forwarding_enabled') is True:
        row=journal.db.execute('SELECT conversation_id,outcome FROM conversation_poll_messages WHERE message_id=?',
                               (job['message_id'],)).fetchone()
        if row and row['outcome']=='FORWARDED':
            from .conversation_poll import pages
            api=api or Instagram(config)
            for batch in pages(api,config['instagram_account_id']+'/conversations',
                               {'platform':'instagram','fields':'id,participants','limit':100}):
                for group in batch:
                    if group['id']!=row['conversation_id']:continue
                    peers=group.get('participants',{})
                    if peers.get('paging',{}).get('next') or not isinstance(peers.get('data'),list):
                        raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
                    borrower=forwarded_borrower(config,master,peers['data'],job['sender_id'])
                    evidence=json.loads(job['result'] or '{}')
                    if borrower['id']!=evidence.get('forwarded_borrower_id'):
                        raise ReceiptInvalid('FORWARDED_BORROWER_CHANGED')
                    return borrower
            raise ReceiptInvalid('FORWARDED_GROUP_MISSING')
    return borrower_for(identity_reader(config,job['sender_id']),master['borrowers'])
