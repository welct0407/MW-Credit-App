"""Receipt ownership, including the owner's explicitly configured group forwarder.

R095 payer name, revision 2 (change note "Revision 2"). From `payer_name_cutoff`:
- Strong contexts (C1 borrower DM, C2 borrower in a 3-member group, C3 forwarder in a 3-member group) decide the
  borrower exactly as before; the slip name never holds a receipt there and is only learned as a payer line.
  A borrower sending in a multi-borrower group (C4') also keeps the sender rule and learns like C1 (R098).
- Weak contexts (C4 forwarder in a 4+ group, C5 forwarder DM) are resolved after extraction: borrowers whose payer
  lines match (or are the only near) the slip, narrowed by participants, the forwarder's nickname hint from the same
  read, what is due and an exact amount fit; otherwise REVIEW PAYER_UNRESOLVED (or PAYER_NAME_UNREADABLE).

R151 (group slips whose sender left the participants list):
- SENDER: the poll names the borrower by the message's sender username; strong, like C1/C2.
- UNIDENTIFIED: any other non-business sender's image is resolved like C5 (payer name), narrowed to the group's
  borrowers when that leaves one; never an automatic payment (review_cycle.automatic_payment).
- C3 hold: a forwarded slip naming exactly one other borrower and not the group's borrower is held
  (PAYER_NAME_OTHER_BORROWER).

R179 (owner, 21 November 2026: name the borrower by replying to the hold): a job whose result carries
`designated_borrower_id` (hold_reply.decide, a Reviewer's Reply with the borrower's name) has the context kind
'designated': that borrower, live and AI-enabled, decides; no poll row, forwarder or sender identity is read. It is an
identified sender for the automatic-payment policy (review_cycle.automatic_payment). With
`receipt_hold_designation_learn_enabled` (owner, 21 November 2026: "Yes remember the name") the slip's payer name is
learned as a payer line of that borrower through the R095 path (command payerLines, applied only when the payment posts
and only while the column still equals `before`), unless it is unreadable, the record already has 5 lines, or the name
already matches another enabled borrower's line (designated_learning).
"""
import json
import sqlite3
from .config import cutoff_ts
from .payer_name import MAX_LINES, best, hint_key, joined, learn, lines, readable
from .receipt_rules import borrower_for, username, ReceiptInvalid, SenderUnbound
from .instagram import Instagram

# Job result keys kept from capture through every later pass (the job result is rewritten on each pass).
PROVENANCE = ('forwarded_borrower_id', 'candidate_borrower_ids', 'payer_borrower_id', 'payer_step', 'hint_texts',
              'sender_borrower_id', 'sender_username', 'unidentified_sender', 'group_borrower_ids',
              # R179: the Reviewer's designation (borrower, the Partner and the inbound message that named it).
              'designated_borrower_id', 'designated_by', 'designated_message')
HINT_LIMIT = 3
HINT_WINDOW = 60  # seconds from the slip to the nickname (owner: one minute)


def payer_active(config, job):
    return bool(config.get('payer_name_cutoff')) and job['created_at'] >= cutoff_ts(config, 'payer_name_cutoff')


def field(job, key):
    return job[key] if key in job.keys() else None


def provenance(job):
    try:
        saved = json.loads(field(job, 'result') or '{}')
    except (TypeError, ValueError):
        saved = {}
    return {k: v for k, v in saved.items() if k in PROVENANCE} if isinstance(saved, dict) else {}


def forwarder(config, master):
    """The configured forwarder partner's unique Instagram username."""
    partners = [p for p in master['partners'] if p['id'] == config.get('receipt_forwarder_partner_id')]
    if len(partners) != 1:
        raise ReceiptInvalid('FORWARDER_UNMAPPED')
    name = username(partners[0]['username'])
    if sum(username(p['username']) == name for p in master['partners']) != 1:
        raise ReceiptInvalid('FORWARDER_UNMAPPED')
    return name


def forwarded_group(config, master, participants, sender):
    """Business account and forwarder (the sender) of an eligible group; the remaining participants."""
    if config.get('receipt_forwarding_enabled') is not True or len(participants) < 3:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    ids = [str(p.get('id', '')) for p in participants]
    names = [username(p.get('username')) for p in participants]
    if len(set(ids)) != len(ids) or len(set(names)) != len(names) or not all(i.isdigit() for i in ids) or not all(names):
        raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
    source_name = forwarder(config, master)
    business = [p for p in participants if str(p['id']) == str(config['instagram_account_id'])
                and username(p.get('username')) == username(config.get('receipt_group_account_username'))]
    source = [p for p in participants if str(p['id']) == str(sender) and username(p.get('username')) == source_name]
    if len(business) != 1 or len(source) != 1 or business[0] == source[0]:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    return [p for p in participants if p not in (business[0], source[0])]


def forwarded_borrower(config, master, participants, sender):
    if config.get('receipt_forwarding_enabled') is not True or len(participants) != 3:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    borrower = forwarded_group(config, master, participants, sender)
    if len(borrower) != 1:
        raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
    return borrower_for(borrower[0], master['borrowers'])


def group_borrowers(master, participants):
    """Enabled borrowers among the participants, by id, in participant order."""
    found = []
    for peer in participants:
        try:
            found.append(borrower_for(peer, master['borrowers']))
        except ReceiptInvalid:
            continue
    return found


def forwarded_candidates(config, master, participants, sender):
    """C4: the forwarder sends in a group (4+ persons) with two or more enabled borrower participants."""
    if len(participants) < 4:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    candidates = group_borrowers(master, forwarded_group(config, master, participants, sender))
    if len(candidates) < 2:
        raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
    return candidates


def group_participants(config, conversation_id, api):
    from .conversation_poll import pages
    for batch in pages(api, config['instagram_account_id'] + '/conversations',
                       {'platform': 'instagram', 'fields': 'id,participants', 'limit': 100}):
        for group in batch:
            if group['id'] != conversation_id:
                continue
            peers = group.get('participants', {})
            if peers.get('paging', {}).get('next') or not isinstance(peers.get('data'), list):
                raise ReceiptInvalid('FORWARDED_GROUP_AMBIGUOUS')
            return peers['data']
    raise ReceiptInvalid('FORWARDED_GROUP_MISSING')


def webhook_job(job):
    try:
        return json.loads(field(job, 'source') or '{}').get('kind') == 'webhook'
    except (TypeError, ValueError, AttributeError):
        return False


def poll_row(journal, message_id):
    """The poll's record of the message, or None (also before the first poll created the SQLite table)."""
    try:
        return journal.db.execute('SELECT conversation_id,outcome FROM conversation_poll_messages WHERE message_id=?',
                                  (message_id,)).fetchone()
    except sqlite3.OperationalError as exc:
        if 'no such table' in str(exc):
            return None
        raise


def sender_context(config, job, master, identity_reader, evidence, active):
    """R151 SENDER: the borrower the poll named by the sender username, still that live borrower; the directory must
    bind the sender id to that username, or bind the id to nothing while no other id holds the username."""
    name = username(evidence.get('sender_username'))
    if not name:
        raise ReceiptInvalid('BORROWER_CHANGED')
    borrower = borrower_for({'username': name}, master['borrowers'])
    if borrower['id'] != evidence.get('sender_borrower_id'):
        raise ReceiptInvalid('BORROWER_CHANGED')
    try:
        identity = identity_reader(config, job['sender_id'])
    except SenderUnbound as exc:
        if name in exc.taken:
            raise
    else:
        if username(identity.get('username')) != name:
            raise ReceiptInvalid('IG_CONVERSATION_IDENTITY_AMBIGUOUS')
    return {'kind': 'sender', 'borrower': borrower, 'candidates': [], 'active': active, 'fill': active}


def receipt_context(config, job, journal, master, identity_reader, api=None):
    """How the job arrived and who can have paid, before extraction.

    kind: 'sender' (C1/C2, R151 SENDER), 'forwarded' (C3), 'group_sender' (C4'), 'candidates' (C4), 'forwarder_dm'
    (C5) or 'unidentified' (R151). borrower is None for C4/C5/unidentified until resolve_payer; fill tells whether a
    POSTED payment may store the slip name.
    """
    active = payer_active(config, job)
    evidence = provenance(job)
    if evidence.get('designated_borrower_id'):
        return designated_context(master, evidence['designated_borrower_id'], learn_enabled(config))
    row = poll_row(journal, job['message_id'])
    # Forwarding is allowed only for the message captured by our group poller.
    # Re-read the exact group's membership before validation and before posting.
    if config.get('receipt_forwarding_enabled') is True:
        if row and row['outcome'] == 'FORWARDED':
            api = api or Instagram(config)
            borrower = forwarded_borrower(config, master, group_participants(config, row['conversation_id'], api), job['sender_id'])
            if borrower['id'] != evidence.get('forwarded_borrower_id'):
                raise ReceiptInvalid('FORWARDED_BORROWER_CHANGED')
            return {'kind': 'forwarded', 'borrower': borrower, 'candidates': [], 'active': active, 'fill': active}
        if row and row['outcome'] == 'CANDIDATES':
            if not active:
                raise ReceiptInvalid('FORWARDED_GROUP_NOT_ELIGIBLE')
            api = api or Instagram(config)
            candidates = forwarded_candidates(config, master, group_participants(config, row['conversation_id'], api), job['sender_id'])
            if sorted(b['id'] for b in candidates) != sorted(evidence.get('candidate_borrower_ids') or []):
                raise ReceiptInvalid('FORWARDED_BORROWER_CHANGED')
            return {'kind': 'candidates', 'borrower': None, 'candidates': candidates, 'active': True, 'fill': False}
    if row and row['outcome'] == 'SENDER':
        return sender_context(config, job, master, identity_reader, evidence, active)
    if row and row['outcome'] == 'UNIDENTIFIED':
        # R151: the sender is no known borrower; the slip's payer name decides, as in the forwarder's own chat.
        if not active or evidence.get('unidentified_sender') is not True:
            raise ReceiptInvalid('PAYER_UNRESOLVED')
        pool = [b for b in master['borrowers'] if b['enabled'] is True]
        return {'kind': 'unidentified', 'borrower': None, 'candidates': pool, 'active': True, 'fill': False,
                'group_ids': list(evidence.get('group_borrower_ids') or [])}
    identity = identity_reader(config, job['sender_id'])
    try:
        borrower = borrower_for(identity, master['borrowers'])
    except ReceiptInvalid:
        # C5: the forwarder partner's direct message (webhook only; group messages arrive through the poll).
        if active and config.get('receipt_forwarding_enabled') is True and webhook_job(job):
            try:
                is_forwarder = username(identity.get('username')) == forwarder(config, master)
            except ReceiptInvalid:
                is_forwarder = False
            if is_forwarder:
                pool = [b for b in master['borrowers'] if b['enabled'] is True]
                return {'kind': 'forwarder_dm', 'borrower': None, 'candidates': pool, 'active': True, 'fill': False}
        raise
    group = evidence.get('candidate_borrower_ids') if active else None
    if group:
        # C4': a borrower sends in a multi-borrower group; the sender decides and, as in the borrower's own chat,
        # the slip's payer name is learned (R098; R095 learned nothing here, so such slips never filled the name).
        members = [b for b in master['borrowers'] if b['id'] in group]
        return {'kind': 'group_sender', 'borrower': borrower, 'candidates': members, 'active': True, 'fill': True}
    return {'kind': 'sender', 'borrower': borrower, 'candidates': [], 'active': active, 'fill': active}


def learn_enabled(config):
    return (isinstance(config, dict) and config.get('receipt_hold_designation_enabled') is True
            and config.get('receipt_hold_designation_learn_enabled') is True)


def designated_context(master, borrower_id, fill=False):
    """R179: the borrower a Reviewer named for this job, still in the app and AI-enabled, else BORROWER_CHANGED. fill: the
    slip's payer name may be learned (receipt_hold_designation_learn_enabled)."""
    matches = [b for b in master['borrowers'] if b['id'] == borrower_id and b['enabled'] is True]
    if len(matches) != 1:
        raise ReceiptInvalid('BORROWER_CHANGED')
    return {'kind': 'designated', 'borrower': matches[0], 'candidates': [], 'active': True, 'fill': fill is True}


def designated_learning(borrower, slip, master):
    """R179: (payer-lines change or None, reason or None) for a designated slip. Never an unreadable or empty name; never a
    sixth line (nothing is evicted); never a name that already matches a line of another enabled borrower (future slips
    would be ambiguous). A name already known (or near a line) changes nothing."""
    if not readable(slip):
        return None, 'PAYER_NAME_UNREADABLE'
    if any(b['enabled'] is True and b['id'] != borrower['id'] and best(lines(b.get('payer')), slip) == 'match'
           for b in master['borrowers']):
        return None, 'PAYER_NAME_OTHER_BORROWER'
    change = learned(borrower, slip)
    if change:
        return change, None
    current = lines(borrower.get('payer'))
    if best(current, slip) is None and len(current) >= MAX_LINES:
        return None, 'PAYER_LINES_FULL'
    return None, 'PAYER_NAME_KNOWN'


def named_borrower(text, master, preferred_ids=()):
    """R179: the AI-enabled borrower a Reviewer's typed name names: (borrower, []) or (None, candidates).

    A borrower matches when the hint key of the text equals that of its Thai name, English name (Description) or
    Instagram username (hint_key drops one leading พี่ / p' / "pi " and an @), or when the text is an exact 'match' of one
    of its payer lines (near never counts). Exactly one match among `preferred_ids` (the hold's candidates) wins, else
    exactly one in the whole pool. Otherwise the candidates are the several matches, else the preferred borrowers."""
    pool = [b for b in master['borrowers'] if b['enabled'] is True]
    found = [b for b in pool if names_borrower(b, text)]
    preferred = [b for b in found if b['id'] in set(preferred_ids or ())]
    if len(preferred) == 1:
        return preferred[0], []
    if len(found) == 1:
        return found[0], []
    return None, found or [b for b in pool if b['id'] in set(preferred_ids or ())]


def names_borrower(borrower, text):
    """True when the typed text names this borrower (named_borrower's rule, whatever the borrower's AI switch)."""
    key = hint_key(text)
    if key and key in {hint_key(borrower.get('name_th')), hint_key(borrower.get('name_en')), hint_key(borrower.get('username'))} - {''}:
        return True
    return readable(text) and best(lines(borrower.get('payer')), text) == 'match'


class PayerHeld(ReceiptInvalid):
    """A weak-context payer hold; `candidates` are borrower ids the reviewer is shown."""

    def __init__(self, code, candidates=()):
        super().__init__(code)
        self.candidates = list(candidates)


def hint_word(text):
    """True for an exact command or decision word, which is never a nickname hint."""
    from .hold_reply import REJECT
    from .partner_review import APPROVE
    from .review_resend import COMMANDS
    return str(text or '').strip().casefold() in COMMANDS | APPROVE | REJECT


def next_hint(read, index):
    """The forwarder's nickname hint for the slip at read[index], as hint_texts input. read: one poll read or ingest batch
    of a conversation in time order, each (sender, ts, text, reply_to, has_attachment). Only the slip sender's
    immediately next message counts: a plain text (no reply_to, no attachment) at most HINT_WINDOW seconds after the
    slip. Another message of that sender in between (an image too), a later read or a later text is never a hint."""
    sender, stamp = read[index][0], read[index][1]
    for who, ts, text, reply, attached in read[index + 1:]:
        if who != sender:
            continue
        if reply or attached or not 0 <= ts - stamp <= HINT_WINDOW:
            return []
        return [(text, ts)]
    return []


def hint_texts(messages):
    """Up to 3 forwarder texts of the same read that may name a borrower: [{'text', 'ts'}]."""
    found = []
    for text, stamp in messages:
        if isinstance(text, str) and text.strip() and not hint_word(text) and len(found) < HINT_LIMIT:
            found.append({'text': text.strip()[:200], 'ts': stamp})
    return found


def hint_borrower(texts, master):
    """The one enabled borrower the first naming text names exactly (Borrower Name, English name or Instagram)."""
    enabled = [b for b in master['borrowers'] if b['enabled'] is True]
    for item in texts or []:
        key = hint_key(item.get('text') if isinstance(item, dict) else None)
        if not key or hint_word(item.get('text')):
            continue
        named = [b for b in enabled if key in {hint_key(b.get('name_th')), hint_key(b.get('name_en')), hint_key(b.get('username'))} - {''}]
        if len(named) == 1:
            return named[0]
    return None


def learned(borrower, slip):
    """The payer-lines change for a posted slip: {'before', 'after'} or None."""
    after = learn(lines(borrower.get('payer')), slip)
    return {'before': borrower.get('payer'), 'after': joined(after)} if after else None


def other_borrower(borrower, slip, master):
    """R151 C3 hold: a readable slip whose name neither matches nor nears the group's borrower but matches exactly
    one other enabled borrower is held for the reviewer (group's borrower first); the line is not learned."""
    if not readable(slip) or best(lines(borrower.get('payer')), slip) in ('match', 'near'):
        return
    others = [b for b in master['borrowers'] if b['enabled'] is True and b['id'] != borrower['id']
              and best(lines(b.get('payer')), slip) == 'match']
    if len(others) == 1:
        raise PayerHeld('PAYER_NAME_OTHER_BORROWER', [borrower['id'], others[0]['id']])


def resolve_payer(context, extraction, receipt, master, facts=None, hints=()):
    """(borrower, payer lines change or None, step or None). Strong contexts never raise (except the R151 C3 hold,
    other_borrower); a weak context returns the
    borrower and the step that chose it (name, participants, hint, due, amount) or raises PayerHeld."""
    slip = (extraction or {}).get('payer_name') or ''
    kind = context['kind']
    if not context['active']:
        return context['borrower'], None, None
    if kind == 'designated':
        # R179: the Reviewer's choice stands (no other-borrower hold); the name is learned only with the learning switch.
        borrower = context['borrower']
        change = designated_learning(borrower, slip, master)[0] if context.get('fill') is True else None
        return borrower, change, 'designated'
    if kind in ('sender', 'forwarded', 'group_sender'):
        borrower = context['borrower']
        if kind == 'forwarded':
            other_borrower(borrower, slip, master)
        return borrower, learned(borrower, slip), None
    enabled = [b for b in master['borrowers'] if b['enabled'] is True]
    hint = hint_borrower(hints, master)
    if not readable(slip) and hint is None:
        raise PayerHeld('PAYER_NAME_UNREADABLE', [])
    scores = {b['id']: best(lines(b.get('payer')), slip) for b in enabled} if readable(slip) else {}
    matched = [b for b in enabled if scores.get(b['id']) == 'match']
    nearby = [b for b in enabled if scores.get(b['id']) == 'near']
    # A near line counts only when no other borrower has a match or near line for the same slip.
    pool = matched + (nearby if len(matched) + len(nearby) == 1 else [])
    participants = {b['id'] for b in context['candidates']} if kind == 'candidates' else None
    if participants is not None:
        pool = [b for b in pool if b['id'] in participants]
    if kind == 'unidentified' and len(pool) > 1:
        # R151: several borrowers' lines fit; the group's own borrowers decide only when exactly one of them is left.
        group = set(context.get('group_ids') or [])
        narrowed = [b for b in pool if b['id'] in group]
        if len(narrowed) == 1:
            return narrowed[0], learned(narrowed[0], slip), 'participants'

    def chosen(borrower, step):
        return borrower, learned(borrower, slip), step
    if len(pool) == 1:
        return chosen(pool[0], 'participants' if participants is not None else 'name')
    if hint is not None and (any(b['id'] == hint['id'] for b in pool)
                             or (not pool and (participants is None or hint['id'] in participants))):
        return chosen(hint, 'hint')
    if len(pool) > 1 and facts is not None:
        from .review_proposal import due_charges, fits
        current = {b['id']: facts(b['id']) for b in pool}
        owing = [b for b in pool if due_charges(current[b['id']], receipt['date'])]
        if len(owing) == 1:
            return chosen(owing[0], 'due')
        pool = owing or pool
        fitting = [b for b in pool if fits(receipt, b, current[b['id']])]
        if len(fitting) == 1:
            return chosen(fitting[0], 'amount')
    raise PayerHeld('PAYER_UNRESOLVED', [b['id'] for b in pool])


def receipt_borrower(config, job, journal, master, identity_reader, api=None):
    """The job's borrower on every later pass. C4/C5 jobs re-check the borrower resolved at extraction
    (payer_borrower_id) against the live context: still an enabled candidate, else BORROWER_CHANGED."""
    context = receipt_context(config, job, journal, master, identity_reader, api)
    if context['borrower'] is not None:
        return context['borrower']
    chosen = provenance(job).get('payer_borrower_id')
    matches = [b for b in context['candidates'] if chosen and b['id'] == chosen]
    if len(matches) != 1:
        raise ReceiptInvalid('BORROWER_CHANGED')
    return matches[0]
