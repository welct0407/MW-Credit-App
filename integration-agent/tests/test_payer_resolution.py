"""R095 payer name, revision 2: strong contexts never hold and learn payer lines; weak contexts narrow by name,
participants, the same-read nickname hint, due charges and amount; hold texts; hint and reply separation; the agent
command v8 with payerLines. Synthetic names, accounts and identities only."""
import hashlib
import json
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from mw_integration_agent import receipt_api
from mw_integration_agent.conversation_poll import scan
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_hold import held_text
from mw_integration_agent.receipt_identity import PayerHeld, receipt_borrower, resolve_payer
from mw_integration_agent.receipt_journal import ReceiptJournal, batch_hints
from mw_integration_agent.receipt_rules import BANGKOK, ReceiptInvalid
from mw_integration_agent.receipt_run import process

CUTOFF = '2026-01-01T00:00:00+00:00'


def borrower(row_id, name, payer, enabled=True):
    return {'id': row_id, 'username': name, 'enabled': enabled, 'name_en': 'Synthetic ' + name, 'name_th': 'ผู้กู้ ' + name, 'payer': payer}


def master(*borrowers):
    return {'borrowers': list(borrowers) or [borrower('b1', 'borrower', None)],
            'accounts': [{'id': 'a', 'label': 'Synthetic account', 'active': True, 'number': '1234567890', 'alternative': None}],
            'partners': [{'id': 'p', 'username': 'partner', 'email': 'p@example.invalid', 'language': 'English', 'enabled': True}],
            'reviewer_ids': ['p']}


def slip(payer_name='นาย สมชาย ใจดี', **extra):
    return {'is_payment_receipt': True, 'transfer_successful': True, 'date': datetime.now(BANGKOK).date().isoformat(),
            'time': '09:41', 'amount': '500.00', 'currency': 'THB', 'reference': 'SYN' + hashlib.sha256(payer_name.encode()).hexdigest()[:10].upper(),
            'payer_name': payer_name, 'account_numbers': ['xxx-x-x6789-x'], **extra}


class PayerBase(unittest.TestCase):
    def setUp(self):
        patcher = patch('mw_integration_agent.receipt_run.check_existing_payment')
        patcher.start();self.addCleanup(patcher.stop)
        self.tmp = tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root = Path(self.tmp.name)
        self.ingress = IngressJournal(self.root/'in.db');self.addCleanup(self.ingress.close)
        self.j = ReceiptJournal(self.root/'receipt.db');self.addCleanup(self.j.close)
        self.j.db.executescript('''CREATE TABLE IF NOT EXISTS conversation_poll_messages
          (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, event_time REAL NOT NULL, captured_at REAL NOT NULL, outcome TEXT NOT NULL);''')
        self.config = {'instagram_account_id': '999', 'payer_name_cutoff': CUTOFF, 'receipt_forwarding_enabled': True,
                       'receipt_forwarder_partner_id': 'p', 'receipt_group_account_username': 'business',
                       'receipt_forwarding_cutoff': CUTOFF, 'conversation_poll_cutoff': CUTOFF}

    def webhook(self, mid='m1', sender='123'):
        self.ingress.capture(mid, [{'message_id': mid, 'sender_id': sender, 'timestamp': time.time(), 'text': '',
                                   'attachments': [{'url': 'https://scontent.fbcdn.net/' + mid, 'type': 'image'}]}])
        self.j.ingest(self.ingress.db, 1)
        return next(j for j in self.j.pending() if j['message_id'] == mid)

    def run_job(self, job, m, value, username='borrower', config=None):
        process(job, self.j, config or self.config, m, fetch=lambda _: (b'image-' + job['id'].encode(), hashlib.sha256(job['id'].encode()).hexdigest()),
                extractor=lambda *_: value, identity_reader=lambda *_: {'id': job['sender_id'], 'username': username})
        return dict(self.j.db.execute('SELECT * FROM receipt_jobs WHERE id=?', (job['id'],)).fetchone())


class StrongContextTests(PayerBase):
    """C1-C3: the conversation decides; the slip name never holds and is only learned."""

    def lines_of(self, row):
        return json.loads(row['result'])['receipt']['payer_lines']

    def test_c1_empty_lines_learn_the_slip_name(self):
        row = self.run_job(self.webhook(), master(), slip())
        self.assertEqual(row['status'], 'VALIDATED')
        self.assertEqual(self.lines_of(row), {'before': None, 'after': 'นาย สมชาย ใจดี'})

    def test_c1_mismatch_other_borrower_or_unreadable_still_proceed(self):
        cases = (('m1', slip('นาย สมศักดิ์ รักดี'), {'before': 'สมชาย ใจดี', 'after': 'สมชาย ใจดี\nนาย สมศักดิ์ รักดี'}),
                 ('m2', slip('Alice Aaa'), {'before': 'สมชาย ใจดี', 'after': 'สมชาย ใจดี\nAlice Aaa'}),
                 ('m3', slip(''), None), ('m4', slip('ส***'), None),
                 ('m5', slip('นายสมชาย ใ***'), None), ('m6', slip('นาย สมชาย ใจดีมาก'), {'before': 'สมชาย ใจดี', 'after': 'สมชาย ใจดี\nนาย สมชาย ใจดีมาก'}))
        m = master(borrower('b1', 'borrower', 'สมชาย ใจดี'), borrower('b2', 'alice', 'Alice Aaa'))
        for mid, value, expected in cases:
            with self.subTest(slip=value['payer_name']):
                row = self.run_job(self.webhook(mid), m, value)
                self.assertEqual((row['status'], row['detail']), ('VALIDATED', 'RECEIPT_PROCESSING_STARTED'))
                self.assertEqual(self.lines_of(row), expected)

    def test_c1_a_fuller_name_replaces_a_more_masked_line_and_five_lines_stay(self):
        m = master(borrower('b1', 'borrower', 'สมชาย ใ***\nAlice Aaa'))
        row = self.run_job(self.webhook(), m, slip('นาย สมชาย ใจดี'))
        self.assertEqual(self.lines_of(row), {'before': 'สมชาย ใ***\nAlice Aaa', 'after': 'นาย สมชาย ใจดี\nAlice Aaa'})
        m['borrowers'][0]['payer'] = '\n'.join(['ก กกก', 'ข ขขข', 'ค คคค', 'ง งงง', 'จ จจจ'])
        self.assertIsNone(self.lines_of(self.run_job(self.webhook('m2'), m, slip('นาย สมศักดิ์ รักดี'))))

    def test_jobs_before_the_cutoff_and_old_extractions_behave_as_before(self):
        late = dict(self.config, payer_name_cutoff='2999-01-01T00:00:00+00:00')
        row = self.run_job(self.webhook(), master(borrower('b1', 'borrower', 'สมชาย ใจดี')), slip('นาย สมศักดิ์ รักดี'), config=late)
        self.assertEqual(row['status'], 'VALIDATED');self.assertIsNone(self.lines_of(row))
        old = {k: v for k, v in slip().items() if k != 'payer_name'}
        row = self.run_job(self.webhook('m2'), master(), old, config={'instagram_account_id': '999'})
        self.assertEqual(row['status'], 'VALIDATED');self.assertEqual(json.loads(row['result'])['receipt']['payer_name'], '')

    def test_c6_stranger_and_disabled_forwarding_stay_ignored(self):
        forbidden = Mock(side_effect=AssertionError('must not extract'))
        for mid, username, config in (('m1', 'stranger', self.config), ('m2', 'partner', dict(self.config, receipt_forwarding_enabled=False))):
            with self.subTest(username=username):
                job = self.webhook(mid, sender='456')
                process(job, self.j, config, master(), fetch=forbidden, extractor=forbidden,
                        identity_reader=lambda *_, u=username: {'id': '456', 'username': u})
                row = self.j.db.execute('SELECT status,detail FROM receipt_jobs WHERE id=?', (job['id'],)).fetchone()
                self.assertEqual(tuple(row), ('IGNORED', 'BORROWER_NOT_UNIQUELY_ENABLED'))


def due(amount_principal, amount_interest, day=None):
    return {'loans': [], 'charges': [{'id': 'c', 'loan': 'l', 'date': day or '2000-01-01', 'principal': str(amount_principal), 'interest': str(amount_interest)}]}


NOTHING = {'loans': [], 'charges': []}


class WeakContextTests(PayerBase):
    """C5 forwarder DM and C4 4+ group: name, participants, same-read hint, due, amount, then review."""

    def forwarder_dm(self, m, value, texts=(), facts=None, mid='m1'):
        self.ingress.capture(mid, [{'message_id': mid, 'sender_id': '456', 'timestamp': time.time(), 'text': '',
                                   'attachments': [{'url': 'https://scontent.fbcdn.net/' + mid, 'type': 'image'}]}]
                             + [{'message_id': f'{mid}-t{i}', 'sender_id': '456', 'timestamp': time.time() + 1 + i, 'text': text, 'attachments': []}
                                for i, text in enumerate(texts)])
        self.j.ingest(self.ingress.db, 1)
        job = next(j for j in self.j.pending() if j['message_id'] == mid)
        value = dict(value, reference='SYN' + hashlib.sha256(mid.encode()).hexdigest()[:10].upper())
        with patch('mw_integration_agent.review_proposal.facts', side_effect=lambda _config, bid: (facts or {}).get(bid, NOTHING)):
            return self.run_job(job, m, value, username='partner')

    def chosen(self, row):
        result = json.loads(row['result'])
        return row['status'], result.get('payer_borrower_id'), result.get('payer_step')

    def people(self):
        # Mali2's own name equals Dara's second payer line: both are candidates.
        return master(borrower('mali2', 'mali2', 'น.ส. สมฤดี เ'), borrower('dara', 'dara', 'น.ส. กมลา ศรีสุข\nน.ส. สมฤดี เ'),
                      borrower('fon', 'fon', 'อรุณี น***'), borrower('off', 'off', 'สมศรี มีสุข', False))

    def test_unique_name_resolves_learns_and_keeps_it_on_later_passes(self):
        m = self.people()
        row = self.forwarder_dm(m, slip('น.ส.อรุณี นามดี'))
        self.assertEqual(self.chosen(row), ('VALIDATED', 'fon', 'name'))
        self.assertEqual(json.loads(row['result'])['receipt']['payer_lines'], {'before': 'อรุณี น***', 'after': 'น.ส.อรุณี นามดี'})
        reader = lambda *_: {'id': '456', 'username': 'partner'}
        self.assertEqual(receipt_borrower(self.config, row, self.j, m, reader)['id'], 'fon')
        m['borrowers'][2]['enabled'] = False
        with self.assertRaisesRegex(ReceiptInvalid, 'BORROWER_CHANGED'):
            receipt_borrower(self.config, row, self.j, m, reader)

    def test_two_candidates_narrow_by_due_then_amount_then_review(self):
        m = self.people()
        row = self.forwarder_dm(m, slip('น.ส. สมฤดี เ***'), facts={'dara': due(0, 300)}, mid='d1')
        self.assertEqual(self.chosen(row), ('VALIDATED', 'dara', 'due'))
        row = self.forwarder_dm(m, slip('น.ส. สมฤดี เ***'), facts={'dara': due(0, 300), 'mali2': due(400, 100)}, mid='d2')
        self.assertEqual(self.chosen(row), ('VALIDATED', 'mali2', 'amount'))
        row = self.forwarder_dm(m, slip('น.ส. สมฤดี เ***'), facts={'dara': due(0, 300), 'mali2': due(0, 200)}, mid='d3')
        self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))
        self.assertEqual(sorted(json.loads(row['result'])['payer_candidates']), ['dara', 'mali2'])

    def test_the_same_read_hint_chooses_and_a_command_or_unknown_nickname_does_not(self):
        m = self.people()
        self.assertEqual(self.chosen(self.forwarder_dm(m, slip('น.ส. สมฤดี เ'), texts=["P' Mali2"], mid='h1')), ('VALIDATED', 'mali2', 'hint'))
        row = self.forwarder_dm(m, slip(''), texts=['พี่ fon'], mid='h2')
        self.assertEqual(self.chosen(row), ('VALIDATED', 'fon', 'hint'))
        self.assertEqual(json.loads(row['result'])['receipt']['payer_lines'], None)
        for mid, texts in (('h3', ['review']), ('h4', ['mali']), ('h5', ['approve'])):
            with self.subTest(texts=texts):
                row = self.forwarder_dm(m, slip(''), texts=texts, mid=mid)
                self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_NAME_UNREADABLE'))

    def test_a_nickname_in_a_later_read_is_ignored(self):
        m = self.people()
        self.ingress.capture('slip', [{'message_id': 'late', 'sender_id': '456', 'timestamp': time.time(), 'text': '',
                                       'attachments': [{'url': 'https://scontent.fbcdn.net/late', 'type': 'image'}]}])
        self.j.ingest(self.ingress.db, 1)
        self.ingress.capture('next', [{'message_id': 'late-t', 'sender_id': '456', 'timestamp': time.time() + 5, 'text': 'Mali2', 'attachments': []}])
        self.j.ingest(self.ingress.db, 1)
        job = next(j for j in self.j.pending() if j['message_id'] == 'late')
        self.assertIsNone(job['result'])
        row = self.run_job(job, m, slip(''), username='partner')
        self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_NAME_UNREADABLE'))

    def test_one_near_borrower_counts_and_a_second_near_suppresses_it(self):
        m = master(borrower('w1', 'w1', 'นาย นภัสสร พงษ์ดี'), borrower('x', 'x', 'นาย สมชาย ใจดี'))
        self.assertEqual(self.chosen(self.forwarder_dm(m, slip('นาย นกัสสร พงษ์ดี'), mid='n1')), ('VALIDATED', 'w1', 'name'))
        m['borrowers'].append(borrower('w2', 'w2', 'นาย นกัสลร พงษ์ดี'))
        row = self.forwarder_dm(m, slip('นาย นภัสสร พงษ์ดี'), mid='n2')
        self.assertEqual(self.chosen(row), ('VALIDATED', 'w1', 'name'), 'an exact match still wins over a near')
        row = self.forwarder_dm(m, slip('นาย นกัสสร พงษ์ดี'), mid='n3')
        self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))


class GroupContextTests(PayerBase):
    """C4 4+ group (participants, hint in the same read only) and C4' (sender decides and learns, R098)."""

    def group(self, *messages, extra=()):
        peers = [{'id': '123', 'username': 'mali2'}, {'id': '124', 'username': 'dara'}, {'id': '999', 'username': 'business'},
                 {'id': '456', 'username': 'partner'}, *extra]
        return Mock(request=Mock(return_value={'data': [{'id': 'group', 'participants': {'data': peers}, 'messages': {'data': list(messages)[::-1]}}]}))

    def message(self, key, sender, text=None, image=True, offset=0):
        stamp = datetime.fromtimestamp(time.time() - 60 + offset, BANGKOK).replace(microsecond=0).isoformat()
        body = {'id': key, 'created_time': stamp, 'from': {'id': sender},
                'attachments': {'data': [{'image_data': {'url': 'https://scontent.fbcdn.net/' + key}}] if image else []}}
        if text is not None:
            body['message'] = text
        return body

    def capture(self, api, m):
        scan(self.config, api, m, self.j, time.time() + 1)
        return {r['message_id']: r for r in self.j.pending()}

    def people(self):
        return master(borrower('mali2', 'mali2', 'น.ส. สมฤดี เ'), borrower('dara', 'dara', 'น.ส. กมลา ศรีสุข\nน.ส. สมฤดี เ'),
                      borrower('fon', 'fon', 'น.ส. สมฤดี เ'))

    def run_group(self, job, m, value, api, facts=None, username='must-not-be-read'):
        value = dict(value, reference='SYN' + hashlib.sha256(job['id'].encode()).hexdigest()[:10].upper())
        with patch('mw_integration_agent.receipt_identity.Instagram', return_value=api), \
             patch('mw_integration_agent.review_proposal.facts', side_effect=lambda _config, bid: (facts or {}).get(bid, NOTHING)):
            return self.run_job(job, m, value, username=username)

    def test_participants_narrow_and_the_same_read_hint_is_stored(self):
        m = self.people()
        api = self.group(self.message('fw', '456'), self.message('nick', '456', text='พี่ Dara', image=False, offset=1))
        job = self.capture(api, m)['fw']
        evidence = json.loads(job['result'])
        self.assertEqual(evidence['candidate_borrower_ids'], ['dara', 'mali2'])
        self.assertEqual([t['text'] for t in evidence['hint_texts']], ['พี่ Dara'])
        row = self.run_group(job, m, slip('น.ส. สมฤดี เ***'), api)
        self.assertEqual((row['status'], json.loads(row['result'])['payer_borrower_id'], json.loads(row['result'])['payer_step']), ('VALIDATED', 'dara', 'hint'))

    def test_a_non_participant_match_is_not_a_candidate(self):
        m = master(borrower('mali2', 'mali2', 'นาย สมชาย ใจดี'), borrower('dara', 'dara', None), borrower('fon', 'fon', 'น.ส. สมฤดี เ'))
        api = self.group(self.message('fw', '456'))
        job = self.capture(api, m)['fw']
        row = self.run_group(job, m, slip('น.ส. สมฤดี เ***'), api)
        self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))
        self.assertEqual(json.loads(row['result'])['payer_candidates'], [])
        api = self.group(self.message('fw2', '456'))
        row = self.run_group(self.capture(api, m)['fw2'], m, slip('นาย สมชาย ใจดี'), api)
        self.assertEqual((row['status'], json.loads(row['result'])['payer_step']), ('VALIDATED', 'participants'))

    def test_a_nickname_in_the_next_poll_read_is_ignored(self):
        m = self.people()
        api = self.group(self.message('fw', '456'))
        job = self.capture(api, m)['fw']
        api.request.return_value['data'][0]['messages']['data'].insert(0, self.message('nick', '456', text='Dara', image=False, offset=2))
        jobs = self.capture(api, m)
        self.assertNotIn('hint_texts', json.loads(jobs['fw']['result']))
        row = self.run_group(jobs['fw'], m, slip('น.ส. สมฤดี เ***'), api, facts={'mali2': due(0, 100), 'dara': due(0, 100)})
        self.assertEqual((row['status'], row['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))
        del job

    def test_in_a_poll_read_only_the_last_slip_before_the_nickname_gets_it_within_sixty_seconds(self):
        m = self.people()
        api = self.group(self.message('s1', '456', offset=-20), self.message('s2', '456', offset=-10),
                         self.message('nick', '456', text='Dara', image=False), self.message('s3', '456', offset=5),
                         self.message('late', '456', text='Mali2', image=False, offset=66))
        jobs = self.capture(api, m)
        hints = {k: [t['text'] for t in json.loads(jobs[k]['result']).get('hint_texts', [])] for k in ('s1', 's2', 's3')}
        self.assertEqual(hints, {'s1': [], 's2': ['Dara'], 's3': []})

    def test_c4_prime_sender_decides_and_learns_like_the_borrowers_own_chat(self):
        """R098: a borrower's slip in a multi-borrower group fills an empty payer name and appends a new payer line;
        the sender still decides the borrower (the posting decision is unchanged)."""
        cases = (
            ('fill', None, 'นาย สมศักดิ์ รักดี', {'before': None, 'after': 'นาย สมศักดิ์ รักดี'}),
            ('append', 'น.ส. สมฤดี เ', 'นาย สมศักดิ์ รักดี', {'before': 'น.ส. สมฤดี เ', 'after': 'น.ส. สมฤดี เ\nนาย สมศักดิ์ รักดี'}),
            ('known', 'น.ส. สมฤดี เ', 'น.ส. สมฤดี เ***', None),
        )
        for key, stored, name, expected in cases:
            with self.subTest(key):
                m = master(borrower('mali2', 'mali2', stored), borrower('dara', 'dara', 'น.ส. กมลา ศรีสุข'), borrower('fon', 'fon', None))
                api = self.group(self.message('own-' + key, '123'))
                job = self.capture(api, m)['own-' + key]
                self.assertEqual(json.loads(job['result'])['candidate_borrower_ids'], ['dara', 'mali2'])
                row = self.run_group(job, m, slip(name), api, username='mali2')
                result = json.loads(row['result'])
                self.assertEqual((row['status'], result['borrower']['id']), ('VALIDATED', 'mali2'))
                self.assertNotIn('payer_step', result)
                self.assertEqual(result['receipt']['payer_lines'], expected)


class HintReplySeparationTests(unittest.TestCase):
    """The four crossings: a hint is never a reply, a reply is never a hint, a command is neither, an image-only reply
    is neither a decision nor a hint."""

    def test_batch_hints(self):
        batch = [('img', '456', '[{"url":"u"}]', 10.0, '', ''), ('hint', '456', '[]', 11.0, 'Mali2', ''),
                 ('reply', '456', '[]', 12.0, 'Dara', 'out-1'), ('cmd', '456', '[]', 13.0, 'Review', ''),
                 ('other', '777', '[]', 14.0, 'Fon', ''), ('before', '456', '[]', 9.0, 'Fon', ''),
                 ('photo-reply', '456', '[{"url":"v"}]', 15.0, '', 'out-2')]
        self.assertEqual(json.loads(batch_hints(batch, '456', 10.0, 'img'))['hint_texts'], [{'text': 'Mali2', 'ts': 11.0}])
        self.assertIsNone(batch_hints([batch[0], batch[2], batch[3]], '456', 10.0, 'img'))

    def test_the_hint_is_the_immediately_next_text_within_sixty_seconds(self):
        def batch(*rows):
            return [(mid, '456', '[{"url":"u"}]' if image else '[]', ts, text, '') for mid, ts, text, image in rows]

        def hint(rows, mid):
            value = batch_hints(rows, '456', next(r[3] for r in rows if r[0] == mid), mid)
            return value and json.loads(value)['hint_texts']
        # Chase's repro: two slips and a nickname far later in the same batch name nobody.
        rows = batch(('s1', 100.0, '', True), ('s2', 110.0, '', True), ('nick', 9000.0, 'Mali2', False))
        self.assertEqual((hint(rows, 's1'), hint(rows, 's2')), (None, None))
        self.assertEqual(hint(batch(('s1', 100.0, '', True), ('nick', 120.0, 'Mali2', False)), 's1'), [{'text': 'Mali2', 'ts': 120.0}])
        # slip, slip, nickname: only the second slip, and only within 60 s of it.
        rows = batch(('s1', 100.0, '', True), ('s2', 110.0, '', True), ('nick', 170.0, 'Mali2', False))
        self.assertEqual((hint(rows, 's1'), hint(rows, 's2')), (None, [{'text': 'Mali2', 'ts': 170.0}]))
        rows = batch(('s1', 100.0, '', True), ('s2', 110.0, '', True), ('nick', 171.0, 'Mali2', False))
        self.assertEqual(hint(rows, 's2'), None)
        # Another text of the forwarder in between: only that first text is considered.
        rows = batch(('s1', 100.0, '', True), ('chat', 105.0, 'thanks', False), ('nick', 106.0, 'Mali2', False))
        self.assertEqual(hint(rows, 's1'), [{'text': 'thanks', 'ts': 105.0}])

    def test_a_hint_text_is_not_a_reply_decision(self):
        from mw_integration_agent.review_resend import is_command
        self.assertFalse(is_command({'reply_to': '', 'text': 'Mali2'}))
        self.assertTrue(is_command({'reply_to': '', 'text': 'review'}))


class WeakHoldTextTests(unittest.TestCase):
    def job(self, detail, result):
        return {'id': 'j', 'detail': detail, 'created_at': 1791766800, 'result': json.dumps(result, ensure_ascii=False)}

    def test_unresolved_and_unreadable_use_the_reviewed_copy(self):
        m = master(borrower('b1', 'borrower', None), borrower('b2', 'referee', None))
        english = held_text(self.job('PAYER_UNRESOLVED', {'extraction': slip(), 'payer_candidates': ['b1', 'b2']}), None, 'English', m['accounts'], m['borrowers'])[1]
        self.assertIn("Reason: The slip's payer name did not identify one borrower.\nPossible borrowers: Synthetic borrower, Synthetic referee\n"
                      "Record it in the app (the payer name is saved for next time) or reply Reject. Next time, send the borrower's nickname right after the slip.", english)
        thai = held_text(self.job('PAYER_UNRESOLVED', {'extraction': slip(), 'payer_candidates': []}), None, 'ไทย', m['accounts'], m['borrowers'])[1]
        self.assertIn('ผู้กู้ที่เป็นไปได้: ไม่มี\nบันทึกรายการในแอป (ระบบจะเก็บชื่อผู้โอนไว้ใช้ครั้งถัดไป) หรือตอบกลับว่า Reject ครั้งหน้าให้ส่งชื่อเล่นผู้กู้ต่อจากสลิปทันที', thai)
        unreadable = held_text(self.job('PAYER_NAME_UNREADABLE', {'extraction': slip('')}), None, 'English', m['accounts'], m['borrowers'])[1]
        self.assertIn("Reason: The slip's payer name could not be read and no nickname was sent.\nRecord it in the app", unreadable)
        self.assertNotIn('Possible borrowers', unreadable)

    def test_every_hold_shows_the_slip_payer_and_a_chosen_step(self):
        english = held_text(self.job('AMOUNT_UNREADABLE', {'extraction': slip('MR. SOMCHAI J***'), 'payer_step': 'hint'}), None, 'English', master()['accounts'])[1]
        self.assertIn("Payer on slip: MR. SOMCHAI J***\nReason: The receipt amount could not be read.\nBorrower chosen by: forwarder's nickname message\n", english)
        thai = held_text(self.job('AMOUNT_UNREADABLE', {'extraction': {k: v for k, v in slip().items() if k != 'payer_name'}}), None, 'ไทย', master()['accounts'])[1]
        self.assertIn('\nผู้โอนในสลิป: ไม่ทราบ\n', thai)

    def test_worst_case_hold_fits_one_instagram_message(self):
        long_name = 'ก' * 120
        m = master(*[borrower(f'b{i}', f'u{i}', None) for i in range(8)])
        for b in m['borrowers']:
            b['name_th'] = b['name_en'] = long_name
        for language in ('English', 'ไทย'):
            result = {'extraction': slip(long_name), 'payer_candidates': [b['id'] for b in m['borrowers']]}
            body = held_text(self.job('PAYER_UNRESOLVED', result), {'name_en': long_name, 'name_th': long_name}, language, m['accounts'], m['borrowers'])[1]
            self.assertLessEqual(len(body), 1000, (language, len(body)))


class PayerResolveTests(unittest.TestCase):
    def test_resolve_payer_without_the_feature_returns_the_sender(self):
        b = borrower('b1', 'borrower', 'สมชาย ใจดี')
        context = {'kind': 'sender', 'borrower': b, 'candidates': [], 'active': False, 'fill': False}
        self.assertEqual(resolve_payer(context, slip('Other Name'), {}, master(b)), (b, None, None))

    def test_payer_held_carries_its_code(self):
        held = PayerHeld('PAYER_UNRESOLVED', ['b1'])
        self.assertEqual((str(held), held.candidates), ('PAYER_UNRESOLVED', ['b1']))


class PayerConfigTests(unittest.TestCase):
    def test_payer_name_cutoff_must_be_aware_when_set(self):
        from mw_integration_agent.config import ConfigurationError, validate_config
        base = json.loads((Path(__file__).resolve().parents[1] / 'config.example.json').read_text())
        validate_config(dict(base, payer_name_cutoff=CUTOFF))
        with self.assertRaises(ConfigurationError):
            validate_config(dict(base, payer_name_cutoff='2026-01-01T00:00:00'))


class ReplyGuardTests(unittest.TestCase):
    def test_attachment_only_messages_are_never_reply_decisions(self):
        from mw_integration_agent.review_cycle import has_attachment
        self.assertTrue(has_attachment({'attachments': json.dumps([{'url': 'https://scontent.fbcdn.net/x'}])}))
        self.assertTrue(has_attachment({'attachments': [{'url': 'x'}]}))
        for value in ('[]', '', None, 'not json', '{}'):
            self.assertFalse(has_attachment({'attachments': value}), value)

    def test_forwarded_slip_reply_neither_rejects_a_review_nor_acknowledges_a_hold(self):
        from mw_integration_agent.partner_notice import NoticeJournal
        from mw_integration_agent.partner_review import ReviewStore
        from mw_integration_agent.review_cycle import Run
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            j = ReceiptJournal(root/'receipt-processing.db');reviews = ReviewStore(j.db)
            j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES ('job','m','123','','REVIEW_REQUESTED',1)");j.db.commit()
            key = reviews.reserve('job', {'receipt': {'amount': '500.00'}})
            notices = NoticeJournal(root/'partner-notices.db')
            partner = {'id': 'p', 'username': 'partner', 'enabled': True, 'language': 'English', 'email': 'p@example.invalid'}
            notice = notices.reserve('review:' + key, partner, 's', 'b')
            with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out',recipient_id='456' WHERE id=?", (notice,))
            notices.close()
            ingress = IngressJournal(root/'instagram-ingress.db')
            ingress.capture('b', [{'message_id': 'slip', 'sender_id': '456', 'timestamp': time.time() - 1, 'text': '', 'reply_to': 'out',
                                   'attachments': [{'url': 'https://scontent.fbcdn.net/s', 'type': 'image'}]}])
            ingress.close()
            config = {'state_directory': str(root), 'partner_review_cutoff': '1970-01-01T00:00:00+00:00'}
            live = {'partners': [partner], 'reviewer_ids': ['p'], 'borrowers': [], 'accounts': []}
            with patch('mw_integration_agent.review_cycle.masters', return_value=live):
                run = Run(config, j, lambda *_: {'id': '456', 'username': 'partner'})
                try:run.decide_replies()
                finally:run.close()
            self.assertEqual(run.failures, [])
            self.assertEqual(j.db.execute('SELECT state FROM partner_reviews').fetchone()[0], 'PENDING')
            self.assertEqual(j.db.execute('SELECT count(*) FROM partner_review_replies').fetchone()[0], 0)
            j.close()


class CommandV8Tests(unittest.TestCase):
    config = dict(receipt_payment_api_enabled=True, receipt_environment='dev', database_name='loan_manager_dev',
                  receipt_archive_enabled=True, receipt_payment_api_cutoff=CUTOFF,
                  receipt_payment_api_origin='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',
                  receipt_payment_api_audience='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app')
    asset = {'archive_state': 'ARCHIVED', 'source': json.dumps({'captured_at': 1791766800}), 'receipt_id': 'a' * 64,
             'object_key': 'receipts/dev/2026/10/12/' + 'a' * 64 + '/' + 'b' * 64 + '.jpg', 'generation': 456,
             'raw_sha256': 'b' * 64, 'mime_type': 'image/jpeg', 'byte_size': 123}

    def command(self, **receipt):
        proposal = {'receipt': {'amount': '500.00', 'account_id': 'a', 'date': '2026-10-12', 'time': '09:41', 'reference': 'SYNREF1', **receipt},
                    'borrower': {'id': 'b1'}}
        return receipt_api.payload(self.config, {'id': 'review-1', 'deciding_partner': 'p'}, proposal, self.asset, False)['command']

    def test_payer_lines_are_sent_only_when_the_cycle_decided_a_change(self):
        change = {'before': 'สมชาย ใจดี', 'after': 'สมชาย ใจดี\nน.ส. สมฤดี เ'}
        sent = self.command(payer_lines=change)
        self.assertEqual((sent['schemaVersion'], sent['payerLines']), (8, change))
        self.assertEqual(list(sent)[-1], 'archiveEvidence')
        for receipt in ({'payer_lines': None}, {}, {'payer_lines': {'before': None, 'after': ''}},
                        {'payer_lines': {'before': 'a b c', 'after': 'a b c'}}, {'payer_lines': {'before': None, 'after': 'x\n\ny'}},
                        {'payer_lines': {'before': None, 'after': '\n'.join(['ก กกก'] * 6)}}):
            with self.subTest(receipt=receipt):
                command = self.command(**receipt)
                self.assertEqual(command['schemaVersion'], 7);self.assertNotIn('payerLines', command)
        self.assertEqual(sent['requestId'], self.command()['requestId'], 'the request identity never depends on the names')


if __name__ == '__main__':
    unittest.main()
