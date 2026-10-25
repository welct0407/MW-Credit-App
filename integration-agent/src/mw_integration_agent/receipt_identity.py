"""Receipt ownership, including the owner's explicitly configured group forwarder.

R095 payer name, revision 2 (change note "Revision 2"). From `payer_name_cutoff`:
- Strong contexts (C1 borrower DM, C2 borrower in a 3-member group, C3 forwarder in a 3-member group) decide the
  borrower exactly as before; the slip name never holds a receipt there and is only learned as a payer line.
  A borrower sending in a 4+ group (C4') also keeps the sender rule; nothing is learned there.
- Weak contexts (C4 forwarder in a 4+ group, C5 forwarder DM) are resolved after extraction: borrowers whose payer
  lines match (or are the only near) the slip, narrowed by participants, the forwarder's nickname hint from the same
  read, what is due and an exact amount fit; otherwise REVIEW PAYER_UNRESOLVED (or PAYER_NAME_UNREADABLE).
"""
import json
from .config import cutoff_ts
from .payer_name import best, hint_key, joined, learn, lines, readable
from .receipt_rules import borrower_for, username, ReceiptInvalid
from .instagram import Instagram

# Job result keys kept from capture through every later pass (the job result is rewritten on each pass).
PROVENANCE = ('forwarded_borrower_id', 'candidate_borrower_ids', 'payer_borrower_id', 'payer_step', 'hint_texts')
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


def receipt_context(config, job, journal, master, identity_reader, api=None):
    """How the job arrived and who can have paid, before extraction.

    kind: 'sender' (C1/C2), 'forwarded' (C3), 'group_sender' (C4'), 'candidates' (C4) or 'forwarder_dm' (C5).
    borrower is None for C4/C5 until resolve_payer; fill tells whether a POSTED payment may store the slip name.
    """
    active = payer_active(config, job)
    evidence = provenance(job)
    # Forwarding is allowed only for the message captured by our group poller.
    # Re-read the exact group's membership before validation and before posting.
    if config.get('receipt_forwarding_enabled') is True:
        row = journal.db.execute('SELECT conversation_id,outcome FROM conversation_poll_messages WHERE message_id=?',
                                 (job['message_id'],)).fetchone()
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
        # C4': a borrower sends in a multi-borrower group; the sender decides, nothing is learned.
        members = [b for b in master['borrowers'] if b['id'] in group]
        return {'kind': 'group_sender', 'borrower': borrower, 'candidates': members, 'active': True, 'fill': False}
    return {'kind': 'sender', 'borrower': borrower, 'candidates': [], 'active': active, 'fill': active}


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


def resolve_payer(context, extraction, receipt, master, facts=None, hints=()):
    """(borrower, payer lines change or None, step or None). Strong contexts never raise; a weak context returns the
    borrower and the step that chose it (name, participants, hint, due, amount) or raises PayerHeld."""
    slip = (extraction or {}).get('payer_name') or ''
    kind = context['kind']
    if not context['active']:
        return context['borrower'], None, None
    if kind in ('sender', 'forwarded', 'group_sender'):
        borrower = context['borrower']
        return borrower, (learned(borrower, slip) if kind in ('sender', 'forwarded') else None), None
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
