"""Correlated reviewer dismissal of a hold; never creates a payment proposal.

R179 (owner, 21 November 2026: "allow me (reviewer) to reply that message with borrower name. Then process it in the normal
way"): with `receipt_hold_designation_enabled` on, a Reply to a borrower-identity hold (DESIGNATION_REASONS) with the
borrower's name requeues the slip for that borrower (receipt_identity 'designated' context) in one guarded transaction:
the job moves REVIEW -> PENDING only from the hold that was read and without a live review, the prior state is kept in
receipt_reconsiderations, and the reply row is the idempotency key. The rerun runs every normal check; it never posts
here. An unknown or ambiguous name decides nothing and re-asks. Off: byte-identical to the Reject-only R135 behaviour."""
import hashlib
import json
import time
from datetime import datetime, timedelta
from .partner_review import authorize_reply
from .receipt_hold import base_key,event_key

REJECT={'reject','rejected','no','ignore','drop','ปฏิเสธ','ไม่อนุมัติ'}
# R179: the holds a borrower name can cure (the reason is "which borrower"); IG_CONVERSATION_IDENTITY_AMBIGUOUS holds before
# extraction, so it needs the archived image (as every rerun does: the worker reads the image again).
DESIGNATION_REASONS=('PAYER_UNRESOLVED','PAYER_NAME_UNREADABLE','PAYER_NAME_OTHER_BORROWER','IG_CONVERSATION_IDENTITY_AMBIGUOUS')
DESIGNATED='HOLD_BORROWER_DESIGNATED'
UNCLEAR='HOLD_BORROWER_UNCLEAR'
TOO_OLD='HOLD_TOO_OLD'
NO_IMAGE='HOLD_IMAGE_UNAVAILABLE'
DESIGNATED_DETAIL='REVIEWER_DESIGNATED_BORROWER'
OUTCOMES={'HOLD_REJECTED','HOLD_NOT_ACTIVE','HOLD_REJECT_REQUIRED','HOLD_HAS_REVIEW',DESIGNATED,UNCLEAR,TOO_OLD,NO_IMAGE}
LIVE_REVIEW="SELECT 1 FROM partner_reviews WHERE job_id=? AND state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN')"
NAME_LIMIT=100
TYPED_LIMIT=40
MAX_LISTED=5


def result_key(message_id):
    return 'hold-reply-result:'+hashlib.sha256(message_id.encode()).hexdigest()


def designation_enabled(config):
    return isinstance(config,dict) and config.get('receipt_hold_designation_enabled') is True


def saved(job):
    try:value=json.loads(job['result'] or '{}')
    except (TypeError,ValueError):value={}
    return value if isinstance(value,dict) else {}


def designation_open(config,job):
    """R179: a name Reply can still decide this hold: switch on, a borrower-identity hold, not already named."""
    return (designation_enabled(config) and job['status']=='REVIEW' and job['detail'] in DESIGNATION_REASONS
            and not saved(job).get('designated_borrower_id'))


def preferred_ids(result):
    """The hold's own candidates first (payer_candidates), else the group's (candidate_borrower_ids, group_borrower_ids)."""
    for key in ('payer_candidates','candidate_borrower_ids','group_borrower_ids'):
        if isinstance(result.get(key),list) and result[key]:return [str(i) for i in result[key]]
    return []


def too_old(result,now):
    """The saved slip date is already outside today and yesterday (Bangkok): the rerun would hold it again."""
    from .business_time import BANGKOK
    slip=(result.get('receipt') or result.get('extraction') or {})
    day=slip.get('date') if isinstance(slip,dict) else None
    if not isinstance(day,str):return False
    today=datetime.fromtimestamp(now,BANGKOK).date()
    return day not in (today.isoformat(),(today-timedelta(days=1)).isoformat())


def archived(config,db,job):
    """The rerun reads the slip image from the archive (the hold cleared the source URL)."""
    from .receipt_archive import required
    try:
        if not required(config,job):return False
        row=db.execute("SELECT 1 FROM receipt_assets WHERE job_id=? AND archive_state='ARCHIVED'",(job['id'],)).fetchone()
    except Exception:
        return False
    return bool(row)


def typed(event):
    return ' '.join(str(event.get('text') or '').split())


def name_reply_refused(text):
    """Approval words, review commands and option codes are never looked up as names (Echo UX-R179-11); numbers are not
    names in this release (Archie: option answers on payment requests)."""
    from .partner_review import APPROVE,RECHECK,options_choice
    from .review_resend import COMMANDS
    word=text.casefold()
    return word in APPROVE or word in COMMANDS or word in RECHECK or options_choice(word) is not None


def decide(db,config,event,notice,partners,identity,reviewer_ids,now=None,master=None):
    now=time.time() if now is None else now
    cutoff=config.get('receipt_hold_reply_cutoff')
    if not cutoff:return 'HOLD_REPLIES_DISABLED'
    cutoff=datetime.fromisoformat(cutoff).timestamp()
    if event['event_timestamp']<cutoff or event['captured_at']<cutoff:return 'BEFORE_HOLD_REPLY_CUTOFF'
    denied=authorize_reply(event,notice,partners,identity,reviewer_ids)
    if denied:return denied
    if not notice['event_key'].startswith('receipt-held:'):return 'NOT_CORRELATED'
    with db:
        old=db.execute('SELECT review_id,outcome FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone()
        if old:
            if old['review_id']!=notice['event_key']:return 'NOT_CORRELATED'
            outcome=old['outcome']
        else:
            outcome=_decide(db,config,event,notice,now,master)
    if outcome==DESIGNATED:audit_designation(config,db,event,notice)
    return outcome


def _decide(db,config,event,notice,now,master):
    job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
    if not job:return 'NOT_CORRELATED'
    if event['event_timestamp']<job['created_at'] or event['event_timestamp']>now:return 'INVALID_TIME'
    text=typed(event)
    # R135: a copy resent by the `review` command names the same hold as the original alert.
    if job['status']!='REVIEW' or event_key(job)!=base_key(notice['event_key']):
        outcome='HOLD_NOT_ACTIVE'
    elif str(event.get('text','')).strip().casefold() in REJECT:
        if db.execute(LIVE_REVIEW,(job['id'],)).fetchone():
            outcome='HOLD_HAS_REVIEW'
        else:
            changed=db.execute("""UPDATE receipt_jobs SET status='REJECTED',image=NULL,url=''
              WHERE id=? AND status='REVIEW' AND detail=? AND NOT EXISTS
              (SELECT 1 FROM partner_reviews WHERE job_id=? AND state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN'))""",
              (job['id'],job['detail'],job['id'])).rowcount
            outcome='HOLD_REJECTED' if changed else 'HOLD_NOT_ACTIVE'
    elif not designation_open(config,job) or master is None or name_reply_refused(text):
        outcome='HOLD_REJECT_REQUIRED'
    elif db.execute(LIVE_REVIEW,(job['id'],)).fetchone():
        outcome='HOLD_HAS_REVIEW'
    elif too_old(saved(job),now):
        outcome=TOO_OLD
    elif not archived(config,db,job):
        outcome=NO_IMAGE
    else:
        outcome=designate(db,job,event,notice,master,text)
    # Decision and terminal queue transition commit together. Keep receipt,
    # original hold reason, deduplication keys and signed ingress history.
    db.execute('INSERT INTO partner_review_replies VALUES (?,?,?)',(event['message_id'],notice['event_key'],outcome))
    return outcome


def designate(db,job,event,notice,master,text):
    """R179: requeue the held job for the named borrower, guarded like the reject (R174): only from the hold that was read,
    without a live review. The saved extraction stays (no new reading of a PAYER hold); the prior state is kept."""
    from .receipt_identity import named_borrower
    from .state import is_postgres
    if not text or len(text)>NAME_LIMIT or '\n' in str(event.get('text') or '').strip():return UNCLEAR
    result=saved(job)
    borrower,_=named_borrower(text,master,preferred_ids(result))
    if not borrower:return UNCLEAR
    value=dict(result,designated_borrower_id=borrower['id'],designated_by=notice['partner_id'],designated_message=event['message_id'])
    changed=db.execute("""UPDATE receipt_jobs SET status='PENDING',attempts=0,retry_after=0,detail=?,result=?
      WHERE id=? AND status='REVIEW' AND detail=? AND coalesce(result,'')=? AND NOT EXISTS
      (SELECT 1 FROM partner_reviews WHERE job_id=? AND state IN ('PENDING','APPROVED','POSTING','POSTED','UNKNOWN'))""",
      (DESIGNATED_DETAIL,json.dumps(value),job['id'],job['detail'],job['result'] or '',job['id'])).rowcount
    if changed!=1:return 'HOLD_NOT_ACTIVE'
    if not is_postgres(db):
        db.execute('''CREATE TABLE IF NOT EXISTS receipt_reconsiderations
           (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)''')
    previous={k:job[k] for k in ('status','detail','result')}
    db.execute('INSERT INTO receipt_reconsiderations(job_id,created_at,previous) VALUES (?,?,?)',(job['id'],time.time(),json.dumps(previous)))
    return DESIGNATED


def designation_facts(db,job_id):
    """(designated borrower id, partner id, the hold code it replaced) of a designated job, or None."""
    job=db.execute('SELECT result FROM receipt_jobs WHERE id=?',(job_id,)).fetchone()
    result=saved(job) if job else {}
    if not result.get('designated_borrower_id'):return None
    prior=None
    try:
        row=db.execute('SELECT previous FROM receipt_reconsiderations WHERE job_id=? ORDER BY id DESC LIMIT 1',(job_id,)).fetchone()
        prior=json.loads(row['previous']).get('detail') if row else None
    except Exception:
        prior=None
    return result['designated_borrower_id'],result.get('designated_by'),prior


def audit_designation(config,db,event,notice):
    """R179: one audit event `hold_borrower_designated` (job, Partner, borrower, the reply's message id as SHA-256 and the
    prior hold code; never the slip reference, payer name or typed text). Idempotent per inbound message."""
    from .audit import activity,event as audit_event
    from .state import enabled,transaction
    if not enabled(config):return
    job_id=notice['event_key'].split(':')[1]
    facts=designation_facts(db,job_id)
    if not facts:return
    digest=hashlib.sha256(event['message_id'].encode()).hexdigest()
    payload={'job_id':job_id,'partner_id':notice['partner_id'],'borrower_id':facts[0],'message_sha256':digest,'prior_code':facts[2]}
    with activity(config,'hold_borrower_designation','PROCESS','internal',payload,key='hold-borrower-designated:'+digest) as op:
        if op:
            with transaction(config) as conn:
                audit_event(conn,op,'hold_borrower_designated',payload,'internal',key='hold_borrower_designated')


def borrower_label(borrower,thai):
    return ' '.join(str(borrower.get('name_th' if thai else 'name_en') or borrower.get('id') or '').split())[:TYPED_LIMIT]


def slip_text(job,borrower,thai):
    """The slip line of a hold acknowledgement ('Kathy ฿400 (18 Nov 18:16)'), or None when the slip was not read."""
    from .partner_review import slip_line
    from .partner_notice import money
    result=saved(job) if job else {}
    slip=result.get('receipt') or result.get('extraction') or {}
    try:
        money(slip['amount'])
        if not slip.get('date') or not slip.get('time'):return None
        who=borrower or {'id':'ไม่ทราบผู้กู้' if thai else 'Borrower unknown'}
        return slip_line({'amount':str(slip['amount']).replace(',',''),'date':slip['date'],'time':slip['time']},who,thai)
    except Exception:
        return None


def listed(borrowers,thai):
    names=[borrower_label(b,thai) for b in borrowers[:MAX_LISTED]]
    more=len(borrowers)-MAX_LISTED
    text=', '.join(names)
    if more>0:text+=(f' และอีก {more} ราย' if thai else f' and {more} more')
    return text


def designation_words(db,config,event,notice,partner,outcome,master,notices):
    """R179 (Echo UX-R179-04, 07 to 12, wording for TOO_OLD and IMAGE_UNAVAILABLE by Byte, for Echo to confirm):
    (subject, body) for a hold reply while name replies are on, or None for the R135 text."""
    from .review_cycle import reviewer_name
    from .receipt_identity import named_borrower,names_borrower
    thai=partner['language']=='ไทย'
    job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
    if not job:return None
    result=saved(job);people={b['id']:b for b in (master or {}).get('borrowers',[])}
    named=people.get(result.get('designated_borrower_id'))
    def body(*parts):
        slip=slip_text(job,named,thai)
        return '\n'.join(p for p in ((slip,)+parts) if p)
    if outcome==DESIGNATED and named:
        reviewer=reviewer_name(result.get('designated_by'),master,thai)
        name=borrower_label(named,thai)
        return (('กำลังตรวจใหม่',body(f'กำลังตรวจใหม่สำหรับ {name} (ระบุโดย {reviewer}) ผลจะส่งตามมา')) if thai else
                ('Rechecking',body(f'Rechecking as {name} (named by {reviewer}). The result follows.')))
    info=('ผลการตอบสลิปที่พักไว้' if thai else 'Held slip reply')
    if outcome=='HOLD_NOT_ACTIVE':
        if named and result.get('designated_by'):
            reviewer=reviewer_name(result['designated_by'],master,thai);name=borrower_label(named,thai)
            return info,body(f'ตรวจใหม่สำหรับ {name} แล้วโดย {reviewer} คำตอบนี้ไม่ได้เปลี่ยนแปลงอะไร' if thai else
                             f'Already rechecked as {name} by {reviewer}. This reply changed nothing.')
        cleared=cleared_by(db,notices,job) if job['status']=='REJECTED' else None
        if cleared:
            reviewer=reviewer_name(cleared,master,thai)
            return info,body(f'{reviewer} นำออกจากรายการแล้ว คำตอบนี้ไม่ได้เปลี่ยนแปลงอะไร' if thai else
                             f'Already cleared by {reviewer}. This reply changed nothing.')
        return None
    if outcome==UNCLEAR:
        text=typed(event)[:TYPED_LIMIT]
        found=[] if not text else named_borrower(text,master,preferred_ids(result))[1]
        several=[b for b in found if names_borrower(b,text)]
        subject='ไม่พบผู้กู้' if thai else 'Borrower not found'
        if len(several)>1:
            return subject,body(f'"{text}" ตรงกับผู้กู้ {len(several)} ราย: {listed(several,thai)} ใช้ Reply ที่ข้อความแจ้งพักสลิป ตอบชื่อใดชื่อหนึ่ง หรือตอบ ปฏิเสธ' if thai else
                                f'"{text}" matches {len(several)} borrowers: {listed(several,thai)}. Use Reply on the hold message with one of these names, or Reject.')
        off=[b for b in (master or {}).get('borrowers',[]) if b['enabled'] is not True and text and names_borrower(b,text)]
        if off and not several:
            name=borrower_label(off[0],thai)
            return subject,body(f'{name} มีในแอป แต่ระบบไม่ได้จัดการสลิปของผู้กู้รายนี้อัตโนมัติ กรุณาบันทึกในแอป แล้วตอบ ปฏิเสธ' if thai else
                                f"{name} is in the app, but slips for this borrower aren't handled automatically. Record it in the app, then Reply Reject.")
        candidates=[people[i] for i in preferred_ids(result) if i in people and people[i]['enabled'] is True]
        line=(f'ผู้กู้ที่เป็นไปได้: {listed(candidates,thai)}' if thai else f'Possible borrowers: {listed(candidates,thai)}') if candidates else None
        return subject,body(f'ไม่พบผู้กู้ชื่อ "{text}" ยังไม่ได้เปลี่ยนแปลงอะไร ใช้ Reply ที่ข้อความแจ้งพักสลิป ตอบชื่อตามที่อยู่ในแอป หรือตอบ ปฏิเสธ' if thai else
                            f'No borrower matches "{text}". Nothing was changed. Use Reply on the hold message with the name as it appears in the app, or Reject.',line)
    if outcome==TOO_OLD:
        return info,body('สลิปนี้เก่ากว่าเมื่อวาน ตรวจใหม่ผ่านข้อความไม่ได้ ยังไม่ได้เปลี่ยนแปลงอะไร กรุณาบันทึกในแอป แล้วตอบ ปฏิเสธ' if thai else
                         "This slip is older than yesterday, so it can't be rechecked here. Nothing was changed. Record it in the app, then Reply Reject.")
    if outcome==NO_IMAGE:
        return info,body('ไม่มีภาพสลิปที่จัดเก็บไว้ ตรวจใหม่ผ่านข้อความไม่ได้ ยังไม่ได้เปลี่ยนแปลงอะไร กรุณาบันทึกในแอป แล้วตอบ ปฏิเสธ' if thai else
                         "The slip image isn't saved, so it can't be rechecked here. Nothing was changed. Record it in the app, then Reply Reject.")
    if outcome=='HOLD_REJECT_REQUIRED' and designation_open(config,job):
        return info,body('สลิปที่พักไว้อนุมัติไม่ได้ ใช้ Reply ตอบชื่อผู้กู้ หรือตอบ ปฏิเสธ' if thai else
                         "Held slips can't be approved. Reply with the borrower's name, or Reject.")
    return None


def cleared_by(db,notices,job):
    """The Partner whose Reject cleared this hold (the partner of that reply's acknowledgement), or None."""
    try:
        rows=db.execute("SELECT message_id FROM partner_review_replies WHERE review_id LIKE ? AND outcome='HOLD_REJECTED'",
                        ('receipt-held:'+job['id']+':%',)).fetchall()
        for row in rows:
            sent=notices.db.execute('SELECT partner_id FROM partner_notices WHERE event_key=?',(result_key(row['message_id']),)).fetchone()
            if sent:return sent['partner_id']
    except Exception:
        return None
    return None


def queue_result(notices,event,notice,partners,outcome,db=None,config=None,master=None):
    if outcome not in OUTCOMES:return
    partner=next(p for p in partners if p['id']==notice['partner_id'])
    thai=partner['language']=='ไทย'
    if db is not None and designation_enabled(config):
        words=designation_words(db,config,event,notice,partner,outcome,master,notices)
        if words:
            notices.reserve(result_key(event['message_id']),partner,*words)
            return
    if outcome not in ('HOLD_REJECTED','HOLD_NOT_ACTIVE','HOLD_REJECT_REQUIRED','HOLD_HAS_REVIEW'):
        # A name-reply outcome whose facts are gone (the switch was turned off, the borrower left): the neutral line.
        outcome='HOLD_NOT_ACTIVE'
    # R175 (Echo E-HRR-01): a cleared hold reads ✅ (partner_notice.HOLD_CLEARED names these subjects).
    subject=('นำสลิปที่พักไว้ออกแล้ว' if thai else 'Held slip cleared') if outcome=='HOLD_REJECTED' else ('ผลการตอบสลิปที่พักไว้' if thai else 'Held slip reply')
    words={
      'HOLD_REJECTED':('Removed from the list. Nothing was recorded or changed; the slip history is kept.','นำออกจากรายการแล้ว ไม่ได้บันทึกหรือเปลี่ยนแปลงรายการชำระเงิน ยังเก็บประวัติสลิปไว้'),
      'HOLD_NOT_ACTIVE':('That hold is already resolved or has changed. This reply changed nothing.','สลิปที่พักไว้นี้ดำเนินการแล้วหรือมีการเปลี่ยนแปลง คำตอบนี้ไม่ได้เปลี่ยนแปลงข้อมูล'),
      'HOLD_REJECT_REQUIRED':("Held slips can't be approved. Use Reply on the hold message and send Reject. If the payment is genuine, record it in the app first.",'สลิปที่พักไว้อนุมัติไม่ได้ ใช้ Reply ตอบข้อความแจ้งพักสลิปว่า ปฏิเสธ หากเป็นการชำระจริง กรุณาบันทึกในแอปก่อน'),
      'HOLD_HAS_REVIEW':('This slip has its own payment request or result; use that message. This reply changed nothing.','สลิปนี้มีคำขออนุมัติหรือผลแยกต่างหาก กรุณาใช้ข้อความนั้น คำตอบนี้ไม่ได้เปลี่ยนแปลงข้อมูล'),
    }
    notices.reserve(result_key(event['message_id']),partner,subject,subject+'\n'+words[outcome][int(thai)])


def audit_not_learned(config,job_id,borrower_id,reason):
    """R179 learning (receipt_hold_designation_learn_enabled): a designated slip whose payer name was not learned is
    recorded with the reason code (PAYER_NAME_UNREADABLE, PAYER_NAME_OTHER_BORROWER, PAYER_LINES_FULL, PAYER_NAME_KNOWN),
    never the name. A learned change travels in the posting command (payerLines) instead. Idempotent per job and reason."""
    from .audit import activity,event
    from .state import enabled,transaction
    if not reason or not enabled(config):return
    payload={'job_id':job_id,'borrower_id':borrower_id,'reason':reason}
    with activity(config,'hold_borrower_designation','PROCESS','internal',payload,key='payer-name-not-learned:'+job_id+':'+reason) as op:
        if op:
            with transaction(config) as conn:
                event(conn,op,'designated_payer_name_not_learned',payload,'internal',key='designated_payer_name_not_learned')
