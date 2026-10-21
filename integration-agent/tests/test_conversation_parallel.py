"""R085 speed: once-per-turn identity for reads, concurrent read rounds (call_many), fast-path instructions,
per-turn usage totals and the timing script. Fake HTTP and SQL; SQLite journals."""
import contextlib
import importlib.util
import io
import json
import re
import tempfile
import threading
import time
import unittest
import urllib.error
from datetime import datetime, timedelta, UTC
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import conversation_session as session
from mw_integration_agent import conversation_tools
from mw_integration_agent import gemini_conversation as gemini
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.conversation_tools import ASSISTANT_TOOLS, ConversationTools, READ_TOOLS, TOOL_WORKERS
from mw_integration_agent.partner_conversation import execute

ROOT = Path(__file__).resolve().parents[1]
PARTNER = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English',
           'email': 'test@example.com', 'enabled': True}
SQL_CONFIG = {'conversation_sql_read_enabled': True, 'database_enabled': True}
REAL_SLEEP = time.sleep  # the session tests patch time.sleep (shared module object); the fake queries really wait


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FakeOpener:
    def __init__(self, *outcomes):
        self.outcomes, self.requests = list(outcomes), []

    def open(self, request, timeout):
        self.requests.append(json.loads(request.data))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)


def gemini_reply(*parts):
    return json.dumps({'candidates': [{'content': {'role': 'model', 'parts': list(parts)}, 'finishReason': 'STOP'}],
                       'usageMetadata': {'promptTokenCount': 1000, 'candidatesTokenCount': 10, 'thoughtsTokenCount': 5,
                                         'totalTokenCount': 1015, 'cachedContentTokenCount': 800}}).encode()


def gcall(name, args, ident):
    return {'functionCall': {'name': name, 'args': args, 'id': ident}, 'thoughtSignature': 'sig'}


def claude_reply(*content, stop='tool_use'):
    return json.dumps({'type': 'message', 'role': 'assistant', 'content': list(content), 'stop_reason': stop,
                       'usage': {'input_tokens': 100, 'output_tokens': 5}}).encode()


def use(name, args, ident):
    return {'type': 'tool_use', 'id': ident, 'name': name, 'input': args}


def finish_args(observations=(), status='CLARIFY', message='Which borrower?'):
    return {'status': status, 'message': message, 'observations': list(observations)}


class SlowQueries:
    """conversation_sql.query/payoff stand-ins: a per-statement delay, thread names and peak concurrency."""
    def __init__(self, delays=None, failures=()):
        self.delays, self.failures = delays or {}, set(failures)
        self.threads, self.active, self.peak = [], 0, 0
        self.lock = threading.Lock()

    def run(self, key):
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
            self.threads.append(threading.current_thread().name)
        try:
            REAL_SLEEP(self.delays.get(key, 0.01))
            if key in self.failures:
                raise ConfigurationError('SQL_ERROR 42703: column "x" does not exist')
            return {'columns': ['k'], 'rows': [{'k': key}], 'row_count': 1, 'complete': True}
        finally:
            with self.lock:
                self.active -= 1

    def query(self, config, sql):
        return self.run(sql)

    def payoff(self, config, loan_id):
        value = self.run(loan_id)
        return {'loan_id': loan_id, 'eligible': True, 'calculation': value, 'complete': True}


class Base(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = ConversationStore(self.root / 'partner-conversations.db')
        self.addCleanup(self.store.close)
        self.checks = []
        self.config = dict(SQL_CONFIG, state_directory=str(self.root), instagram_account_id='100',
                           partner_conversations_enabled=True, conversation_timeout_seconds=600,
                           conversation_provider='claude', claude_project='clever-oasis-508610-n7',
                           gemini_project='clever-oasis-508610-n7', gemini_location='global')
        pause = patch.object(session.time, 'sleep')
        pause.start()
        self.addCleanup(pause.stop)

    def authorize(self):
        self.checks.append(threading.current_thread().name)
        return dict(self.config)

    def bridge(self, message_id='m1'):
        return ConversationTools(self.authorize, self.store, message_id, 'q', tools=ASSISTANT_TOOLS, finish_limit=1000)

    def queries(self, slow):
        patches = [patch('mw_integration_agent.conversation_sql.query', side_effect=slow.query),
                   patch('mw_integration_agent.conversation_sql.payoff', side_effect=slow.payoff)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)


class TurnAuthorizationTests(Base):
    def event(self, message_id='event1'):
        return {'message_id': message_id, 'sender_id': '999', 'text': 'How much does Somchai owe?', 'attachments': '[]'}

    def turn(self, *outcomes, authenticator=None, event=None):
        opener = FakeOpener(*outcomes)
        calls = []
        def authenticate(config, sender):
            calls.append(sender)
            return authenticator(len(calls)) if authenticator else PARTNER
        with patch.object(session.http, 'opener', return_value=opener), \
                patch.object(session.http, 'access_token', return_value='token'):
            execute(event or self.event(), PARTNER, self.store, lambda: dict(self.config), None, authenticate)
        row = self.store.db.execute('SELECT status,detail FROM turns WHERE message_id=?', ((event or self.event())['message_id'],)).fetchone()
        return opener, row, calls

    def test_read_only_turn_checks_identity_at_start_finish_and_end_only(self):
        self.queries(SlowQueries())
        reads = [use('sql_query', {'sql': f'q{i}'}, f'r{i}') for i in range(3)] + [use('loan_payoff', {'loan_id': 'L1'}, 'p1')]
        opener, row, calls = self.turn(claude_reply(*reads), claude_reply(use('sql_query', {'sql': 'q9'}, 'r9')),
                                       claude_reply(use('finish', finish_args(['observation-1'], 'VERIFIED'), 'f1')))
        self.assertEqual(row['status'], 'READY')
        # Before R085: one check per tool call plus one per SQL read (14 here). Now: start, finish, end.
        self.assertEqual(len(calls), 3)

    def test_write_turn_rechecks_around_the_write(self):
        self.config['conversation_writes_enabled'] = True
        def write(bridge, args):
            bridge.authorize()  # conversation_write's own checkpoints stay (before dispatch, before completion)
            bridge.possible_write = bridge.write_verified = True
            bridge.authorize()
            return {'write_verified': True, 'complete': True}
        self.queries(SlowQueries())
        args = {k: '' for k in next(t for t in ASSISTANT_TOOLS if t['name'] == 'api_action')['inputSchema']['properties']}
        with patch('mw_integration_agent.conversation_write.api_action', side_effect=write):
            opener, row, calls = self.turn(claude_reply(use('sql_query', {'sql': 'q'}, 'r1')),
                                           claude_reply(use('api_action', dict(args, action='Edit'), 'w1')),
                                           claude_reply(use('finish', finish_args(['observation-2'], 'VERIFIED'), 'f1')))
        self.assertEqual(row['status'], 'READY')
        # start + api_action (bridge) + 2 inside the write + finish + end; the read added none.
        self.assertEqual(len(calls), 6)

    def test_revocation_before_finish_fails_the_turn(self):
        self.queries(SlowQueries())
        revoked = lambda n: PARTNER if n == 1 else dict(PARTNER, enabled=False)  # noqa: E731
        opener, row, calls = self.turn(
            claude_reply(use('sql_query', {'sql': 'q'}, 'r1'), use('sql_query', {'sql': 'q2'}, 'r2')),
            claude_reply(use('finish', finish_args(), 'f1')),
            claude_reply({'type': 'text', 'text': 'done'}, stop='end_turn'),
            claude_reply({'type': 'text', 'text': 'done'}, stop='end_turn'), authenticator=revoked)
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CONVERSATION_FINISH_MISSING'))
        rejected = opener.requests[2]['messages'][4]['content'][0]
        self.assertEqual((rejected['is_error'], rejected['content']), (True, 'PARTNER_CHANGED_DURING_TURN'))
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM conversation_messages').fetchone()[0], 0)

    def test_provider_results_keep_call_order_under_call_many(self):
        slow = SlowQueries(delays={'first': 0.15, 'second': 0.01, 'third': 0.05})
        self.queries(slow)
        reads = [('sql_query', {'sql': 'first'}), ('sql_query', {'sql': 'second'}), ('loan_payoff', {'loan_id': 'third'})]
        opener, row, _ = self.turn(claude_reply(*[use(n, a, f'c{i}') for i, (n, a) in enumerate(reads)]),
                                   claude_reply(use('finish', finish_args(['observation-1']), 'f1')))
        self.assertEqual(row['status'], 'READY')
        results = opener.requests[1]['messages'][2]['content']
        self.assertEqual([r['tool_use_id'] for r in results], ['c0', 'c1', 'c2'])
        self.assertEqual([json.loads(r['content'])['observation'] for r in results], ['observation-1', 'observation-2', 'observation-3'])
        self.assertTrue(all(name.startswith('conversation-read') for name in slow.threads))
        self.config['conversation_provider'] = 'gemini'
        slow.threads.clear()
        opener, row, _ = self.turn(gemini_reply(*[gcall(n, a, f'g{i}') for i, (n, a) in enumerate(reads)]),
                                   gemini_reply(gcall('finish', finish_args(['observation-1']), 'gf')),
                                   event=self.event('event2'))
        self.assertEqual(row['status'], 'READY')
        answers = [p['functionResponse'] for p in opener.requests[1]['contents'][2]['parts']]
        self.assertEqual([a['id'] for a in answers], ['g0', 'g1', 'g2'])
        self.assertEqual([a['response']['result']['observation'] for a in answers], ['observation-1', 'observation-2', 'observation-3'])
        self.assertEqual(len(slow.threads), 3)


class CallManyTests(Base):
    def test_results_and_observations_in_call_order_with_one_failure_isolated(self):
        slow = SlowQueries(delays={'a': 0.12, 'b': 0.01, 'c': 0.06, 'd': 0.03}, failures={'c'})
        self.queries(slow)
        bridge = self.bridge()
        calls = [('sql_query', {'sql': 'a'}, 'c1'), ('sql_query', {'sql': 'b'}, 'c2'), ('sql_query', {'sql': 'c'}, 'c3'),
                 ('loan_payoff', {'loan_id': 'd'}, 'c4'), ('sql_query', {'nope': 1}, 'c5')]
        outcomes, ms = bridge.call_many(calls, time.monotonic() + 30)
        self.assertEqual(outcomes[0]['rows'], [{'k': 'a'}])
        self.assertEqual([outcomes[i]['observation'] for i in (0, 1, 3)], ['observation-1', 'observation-2', 'observation-3'])
        self.assertIsInstance(outcomes[2], ConfigurationError)
        self.assertTrue(str(outcomes[2]).startswith('SQL_ERROR 42703'))
        self.assertEqual(str(outcomes[4]), 'UNSUPPORTED_TOOL_OR_ARGUMENTS')
        self.assertEqual(outcomes[3]['calculation']['rows'], [{'k': 'd'}])
        self.assertGreaterEqual(ms[0], 100)
        stored = dict(self.store.db.execute('SELECT call_id,result FROM tool_calls').fetchall())
        self.assertEqual(sorted(stored), ['c1', 'c2', 'c3', 'c4'])
        self.assertIsNone(stored['c3'])
        self.assertEqual(json.loads(stored['c1'])['observation'], 'observation-1')
        # Identity: the turn's one authorization served all reads.
        self.assertEqual(self.checks, ['MainThread'])

    def test_journal_and_audit_writes_stay_on_the_calling_thread(self):
        slow = SlowQueries(delays={'a': 0.05, 'b': 0.01})
        self.queries(slow)
        bridge = self.bridge()
        threads = []
        real = self.store.db

        class Proxy:
            config = {}
            def execute(self, *args):
                threads.append(threading.current_thread().name)
                return real.execute(*args)
            def __enter__(self):
                threads.append(threading.current_thread().name)
                return real.__enter__()
            def __exit__(self, *exc):
                return real.__exit__(*exc)
        self.store.db = Proxy()
        audits = []
        with patch('mw_integration_agent.audit.started', side_effect=lambda *a, **k: audits.append(('started', threading.current_thread().name)) or object()), \
                patch('mw_integration_agent.audit.finished', side_effect=lambda *a, **k: audits.append(('finished', threading.current_thread().name))):
            outcomes, _ = bridge.call_many([('sql_query', {'sql': 'a'}, 'c1'), ('sql_query', {'sql': 'b'}, 'c2')], time.monotonic() + 30)
        self.store.db = real
        self.assertTrue(all(not isinstance(o, Exception) for o in outcomes))
        self.assertEqual(set(threads), {'MainThread'})
        self.assertEqual(audits, [('started', 'MainThread'), ('started', 'MainThread'), ('finished', 'MainThread'), ('finished', 'MainThread')])
        self.assertTrue(all(name.startswith('conversation-read') for name in slow.threads))

    def test_a_straggler_times_out_without_blocking_the_round(self):
        slow = SlowQueries(delays={'slow': 2.0, 'fast': 0.01})
        self.queries(slow)
        bridge = self.bridge()
        started = time.monotonic()
        outcomes, _ = bridge.call_many([('sql_query', {'sql': 'slow'}, 'c1'), ('sql_query', {'sql': 'fast'}, 'c2')],
                                       time.monotonic() + 0.3)
        self.assertLess(time.monotonic() - started, 1.5)
        self.assertEqual(str(outcomes[0]), 'TOOL_TIMEOUT')
        self.assertEqual(outcomes[1]['rows'], [{'k': 'fast'}])
        self.assertIsNone(self.store.db.execute("SELECT result FROM tool_calls WHERE call_id='c1'").fetchone()[0])

    def test_queued_calls_cancelled_at_the_deadline_are_timeouts(self):
        slow = SlowQueries(delays={str(i): 0.5 for i in range(6)})
        self.queries(slow)
        outcomes, _ = self.bridge().call_many([('sql_query', {'sql': str(i)}, f'c{i}') for i in range(6)],
                                              time.monotonic() + 0.2)
        self.assertEqual([str(outcome) for outcome in outcomes], ['TOOL_TIMEOUT'] * 6)
        REAL_SLEEP(0.7)
        self.assertEqual(len(slow.threads), 4)  # calls 4-5 were queued and cancelled, never run
        for i in range(6):
            self.assertIsNone(self.store.db.execute('SELECT result FROM tool_calls WHERE call_id=?', (f'c{i}',)).fetchone()[0])

    def test_worker_cap_is_four(self):
        self.assertEqual(TOOL_WORKERS, 4)
        slow = SlowQueries(delays={str(i): 0.1 for i in range(7)})
        self.queries(slow)
        sizes = []
        real = conversation_tools.ThreadPoolExecutor
        def pool(max_workers, **kwargs):
            sizes.append(max_workers)
            return real(max_workers=max_workers, **kwargs)
        with patch.object(conversation_tools, 'ThreadPoolExecutor', side_effect=pool):
            outcomes, _ = self.bridge().call_many([('sql_query', {'sql': str(i)}, f'c{i}') for i in range(7)], time.monotonic() + 30)
            self.bridge('m2').call_many([('sql_query', {'sql': '0'}, 'x'), ('sql_query', {'sql': '1'}, 'y')], time.monotonic() + 30)
        self.assertEqual(sizes, [4, 2])
        self.assertLessEqual(slow.peak, 4)
        self.assertEqual(len(outcomes), 7)

    def test_rounds_with_a_write_or_finish_run_sequentially(self):
        class Bridge:
            def __init__(self):
                self.sequential = []
            def call(self, name, args, call_id):
                self.sequential.append(name)
                return {'accepted': True} if name == 'finish' else {'observation': 'observation-1'}
            def call_many(self, calls, deadline=None):
                raise AssertionError('a round with a write or finish must not run concurrently')
        bridge = Bridge()
        conversation = gemini.GeminiConversation(self.config, 'b', self.store, ASSISTANT_TOOLS, bridge.call)
        conversation.rounds = 1
        for names in (['sql_query', 'api_action'], ['sql_query', 'finish'], ['database_transaction', 'sql_query'],
                      ['sql_query', 'unknown_tool'], ['sql_query']):
            bridge.sequential.clear()
            conversation.tool_results([{'name': n, 'args': {}, 'id': None} for n in names])
            self.assertEqual(bridge.sequential, names)
        self.assertTrue({'sql_query', 'loan_payoff', 'read_records', 'verify_operation'} <= READ_TOOLS)
        self.assertFalse({'api_action', 'database_transaction', 'finish'} & READ_TOOLS)


class InstructionsAndUsageTests(Base):
    def test_fast_path_block_comes_first_and_names_existing_views_and_columns(self):
        text = session.ASSISTANT_INSTRUCTIONS
        self.assertTrue(text.startswith('FAST PATHS'))
        self.assertLess(text.index('FAST PATHS'), text.index('You are the MW partner operations assistant'))
        self.assertLess(text.index('REPLY FORMAT'), text.index('COMMON QUESTIONS: produce exactly these figures'))
        self.assertLess(text.index('COMMON QUESTIONS'), text.index('Signs: amounts received, paid'))
        self.assertIn('say a Partner closes the loan manually (owner decision 15.2)', text)
        self.assertNotIn('open-decision default wording', text)
        digest = json.loads((ROOT / 'src/mw_integration_agent/assets/schema-digest.json').read_text(encoding='utf-8'))
        relations = {r['relation'].split('.', 1)[1].strip('"'): {c['name'] for c in r['columns']} for r in digest['relations']}
        fast = text[:text.index('You are the MW partner')]
        rules = (ROOT / 'src/mw_integration_agent/assets/conversation-business-rules.md').read_text(encoding='utf-8')
        section = rules[rules.index('## 14. Answer recipes'):rules.index('## 15.')]
        for block in (fast, section):
            for view in set(re.findall(r'\b((?:reporting|oltp|olap)_[a-z0-9_]+)\b', block)):
                self.assertIn(view, relations, view)
        expected = {'reporting_borrower_directory_v1': {'borrower_label', 'borrower_id', 'borrower_name', 'active_loans', 'outstanding_principal'},
                    'reporting_borrower_loan_facts_v1': {'original_principal', 'principal_received', 'interest_received',
                                                         'outstanding_principal', 'default_loss', 'loan_type', 'loan_status', 'borrower_id'},
                    'oltp_borrower_payment_health_v1': {'Ref Borrower', 'Overdue Principal', 'Overdue Interest', 'Overdue Amount',
                                                        'Overdue Charge Count', 'Oldest Overdue Date'},
                    'oltp_upcoming_charge_events_v1': {'Ref Borrower', 'Ref Loan', 'Due Date', 'Principal Remaining', 'Interest Remaining',
                                                       'Amount Remaining', 'Basis'},
                    'olap_borrowers_analytics': {'Row ID', 'Total Interest Earned', 'Total Amount Loaned', 'Lifetime Default Loss'},
                    'reporting_borrower_payments_v1': {'status', 'borrower_id'},
                    'Charges': {'Ref Loans', 'Charge Date', 'Amount Remaining', 'Principal Remaining', 'Interest Remaining'},
                    'Loans': {'Ref Borrowers'},
                    'Repayments': {'Interest Paid', 'Principal Paid', 'Row ID', 'Ref Loans'}}
        for view, columns in expected.items():
            self.assertLessEqual(columns, relations[view], view)
        for block in (fast, section):
            flat = ' '.join(block.replace('`', '').split())
            self.assertIn('first 5', flat)  # upcoming-events view limits (R1)
            self.assertIn('within 7 days', flat)
            self.assertIn('3 month', flat.replace('3-month', '3 month'))
            self.assertIn('"Charge Date" > today', flat)
            self.assertIn('NULL', flat)  # overdue fallback (R3)
            # R086: the split counts every repayment except the default-loss row; the payoff comes from the
            # charge balances and loan_payoff (loan_close_calculation_v83, which ignored unlinked legacy
            # repayments before V101) is a cross-check only.
            self.assertIn("""Row ID" LIKE 'df10:%'""", flat)
            self.assertIn('"Interest Remaining"', flat)
            self.assertIn('cross-check', flat)
            self.assertIn('two totals', flat)
            self.assertIn('including future-dated recorded ones', flat)  # Chase R086: charges after today count
            self.assertIn('Loan Close would refuse', flat)  # fractional or overpaid: the function raises
        rules_flat = ' '.join(rules.replace('`', '').split())
        self.assertNotIn('"Ref Payment" not null', rules_flat)
        self.assertNotIn('"Ref Payment" not null', ' '.join(text.split()))
        self.assertNotIn('Prefer calling it over recomputing', rules_flat)
        self.assertIn('from the charge balances', text[text.index('COMMON QUESTIONS'):])
        common = text[text.index('COMMON QUESTIONS'):text.index('Signs: amounts received, paid')]
        self.assertNotIn('from Posted payments', common)
        self.assertIn('from the loan facts', common)
        self.assertIn('principal +X and interest -X', ' '.join(fast.split()))

    def test_model_rounds_totals_are_per_turn_with_per_round_lists(self):
        conversation = gemini.GeminiConversation(self.config, 'b', self.store, ASSISTANT_TOOLS, lambda *_: {'accepted': True})
        opener = FakeOpener(gemini_reply(gcall('sql_query', {'sql': 'x'}, 'c1')),
                            gemini_reply(gcall('finish', finish_args(), 'f1')))
        events = []
        with patch.object(session.http, 'opener', return_value=opener), patch.object(session.http, 'access_token', return_value='t'), \
                patch('mw_integration_agent.state.enabled', return_value=True), \
                patch('mw_integration_agent.state.transaction', return_value=contextlib.nullcontext(None)), \
                patch('mw_integration_agent.audit.event', side_effect=lambda conn, op, kind, payload, *a, **k: events.append((kind, payload))), \
                patch.object(session, 'time', wraps=time) as clock:
            clock.sleep = lambda *_: None
            from mw_integration_agent import audit
            token = audit.PARENT.set('op')
            try:
                conversation.converse(session.ASSISTANT_INSTRUCTIONS, '{}')
            finally:
                audit.PARENT.reset(token)
        kind, payload = events[-1]
        self.assertEqual(kind, 'model_rounds')
        self.assertEqual((payload['prompt_tokens'], payload['thoughts_tokens'], payload['cached_content_tokens']), (2000, 10, 1600))
        self.assertEqual(payload['finish_reason'], 'STOP')
        self.assertEqual(len(payload['round_usage']), 2)
        self.assertEqual(payload['round_usage'][0]['prompt_tokens'], 1000)
        self.assertEqual(len(payload['round_ms']), 2)
        self.assertEqual([t['name'] for t in payload['tool_ms']], ['sql_query', 'finish'])
        self.assertEqual((payload['rounds'], payload['attempts']), (2, 2))

    def test_failed_turns_are_measured_too(self):
        conversation = gemini.GeminiConversation(self.config, 'b', self.store, ASSISTANT_TOOLS, lambda *_: {'accepted': True})
        events = []
        opener = FakeOpener(urllib.error.HTTPError('u', 400, 'bad', {}, io.BytesIO(b'{}')))
        with patch.object(session.http, 'opener', return_value=opener), patch.object(session.http, 'access_token', return_value='t'), \
                patch('mw_integration_agent.state.enabled', return_value=True), \
                patch('mw_integration_agent.state.transaction', return_value=contextlib.nullcontext(None)), \
                patch('mw_integration_agent.audit.event', side_effect=lambda conn, op, kind, payload, *a, **k: events.append((kind, payload))):
            from mw_integration_agent import audit
            token = audit.PARENT.set('op')
            try:
                with self.assertRaises(ConfigurationError):
                    conversation.converse(session.ASSISTANT_INSTRUCTIONS, '{}')
            finally:
                audit.PARENT.reset(token)
        self.assertEqual(events[-1][1]['failure'], 'GEMINI_HTTP_400')
        self.assertEqual(len(events[-1][1]['round_ms']), 1)


class TimingScriptTests(unittest.TestCase):
    def script(self):
        spec = importlib.util.spec_from_file_location('conversation_timing', ROOT / 'scripts' / 'conversation-timing.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_aggregates_per_turn_and_overall(self):
        module = self.script()
        start = datetime(2026, 10, 22, 3, 0, tzinfo=UTC)
        rows = [{'operation_id': 'a', 'provider': 'gemini', 'started_at': start, 'ended_at': start + timedelta(seconds=42.04),
                 'last_event': 'completed',
                 'rounds': {'rounds': 3, 'attempts': 4, 'round_ms': [9000, 7000, 20000], 'prompt_tokens': 60000,
                            'tool_ms': [{'name': 'sql_query', 'ms': 1200}, {'name': 'sql_query', 'ms': 1300}, {'name': 'finish', 'ms': 5}]}},
                {'operation_id': 'b', 'provider': 'gemini', 'started_at': start + timedelta(minutes=5),
                 'ended_at': start + timedelta(minutes=5, seconds=230), 'last_event': 'failed',
                 'rounds': {'rounds': 12, 'attempts': 12, 'failure': 'GEMINI_TOOL_ROUNDS_EXCEEDED'}},
                {'operation_id': 'c', 'provider': None, 'started_at': start + timedelta(minutes=9), 'ended_at': None,
                 'last_event': 'requested', 'rounds': None}]
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(out):
            config = Path(directory) / 'config.json'
            config.write_text('{}', encoding='utf-8')
            seen = []
            module.main(['--since', '2026-10-22T10:00:00+07:00', '--config', str(config)],
                        reader=lambda c, since: seen.append(since) or rows)
        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(seen[0].isoformat(), '2026-10-22T10:00:00+07:00')
        first = lines[0]
        self.assertEqual((first['rounds'], first['attempts'], first['turn_seconds'], first['model_seconds']), (3, 4, 42.0, 36.0))
        self.assertEqual((first['tool_calls'], first['tool_seconds'], first['status']), (3, 2.5, 'completed'))
        self.assertEqual(first['tokens'], {'prompt_tokens': 60000})
        self.assertEqual((lines[1]['status'], lines[1]['failure'], lines[1]['tool_calls']), ('failed', 'GEMINI_TOOL_ROUNDS_EXCEEDED', 0))
        self.assertEqual((lines[2]['status'], lines[2]['turn_seconds']), ('running', None))
        summary = lines[3]['summary']
        self.assertEqual((summary['turns'], summary['completed'], summary['median_turn_seconds'], summary['max_turn_seconds']),
                         (3, 1, 136.0, 230.0))
        self.assertEqual((summary['tool_calls'], summary['tool_seconds'], summary['model_seconds']), (3, 2.5, 36.0))

    def test_since_needs_a_timezone_and_the_query_is_read_only(self):
        module = self.script()
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            module.main(['--since', '2026-10-22T00:00:00'], reader=lambda *_: [])
        self.assertTrue(module.QUERY.lstrip().upper().startswith('SELECT'))
        self.assertNotRegex(module.QUERY.upper(), r'\b(INSERT|UPDATE|DELETE)\b')


if __name__ == '__main__':
    unittest.main()
