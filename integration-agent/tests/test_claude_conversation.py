"""Claude Opus 5.5 on Vertex AI behind the Partner conversation: request shape, tool loop, history, failures.

Fake HTTP only (the Vertex opener and the VM token are patched); SQLite journals; no live service.
"""
import io
import json
import logging
import sqlite3
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import claude_conversation as claude
from mw_integration_agent import partner_conversation
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import CLAUDE_TOOLS, TOOLS, ConversationTools
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.partner_conversation import execute

TOKEN = 'ya29.synthetic-vm-token'
PARTNER = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English',
           'email': 'test@example.com', 'enabled': True}
THINKING = {'type': 'thinking', 'thinking': '', 'signature': 'c2lnbmF0dXJlLXN5bnRoZXRpYw=='}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FakeOpener:
    def __init__(self, *outcomes):
        self.outcomes, self.requests = list(outcomes), []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)

    def bodies(self):
        return [json.loads(r.data) for r, _ in self.requests]


def reply(*content, stop='tool_use', usage=None):
    return json.dumps({'id': 'msg_synthetic', 'type': 'message', 'role': 'assistant', 'model': 'claude-opus-5-5',
                       'content': list(content), 'stop_reason': stop, 'stop_sequence': None,
                       'usage': usage or {'input_tokens': 900, 'cache_read_input_tokens': 20000,
                                          'cache_creation_input_tokens': 0, 'output_tokens': 120}}).encode()


def use(name, arguments, ident):
    return {'type': 'tool_use', 'id': ident, 'name': name, 'input': arguments}


def finish(message='Which borrower do you mean?', ident='toolu_finish', status='CLARIFY'):
    return use('finish', {'status': status, 'message': message, 'observations': []}, ident)


def http_error(code, body=b'{}'):
    return urllib.error.HTTPError('https://vertex', code, 'error', {}, io.BytesIO(body))


class ClaudeConversationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = ConversationStore(self.root / 'partner-conversations.db')
        self.addCleanup(self.store.close)
        self.config = {'state_directory': str(self.root), 'instagram_account_id': '100',
                       'partner_conversations_enabled': True, 'conversation_timeout_seconds': 600,
                       'conversation_provider': 'claude', 'claude_project': 'clever-oasis-508610-n7'}
        self.binding = binding_key('100', PARTNER['id'], '999')
        self.count = 0
        pause = patch.object(claude.time, 'sleep')
        self.pause = pause.start()
        self.addCleanup(pause.stop)

    def event(self, text='How much does Somchai owe?'):
        """A partner message as the signed ingress journal holds it (the transcript reads its text there)."""
        self.count += 1
        event = {'message_id': f'event{self.count:03d}', 'sender_id': '999', 'text': text, 'attachments': '[]'}
        ingress = IngressJournal(self.root / 'instagram-ingress.db')
        try:
            ingress.capture(f'batch-{self.count}', [{'message_id': event['message_id'], 'sender_id': '999',
                                                     'timestamp': 1792555200 + 60 * self.count, 'text': text}])
        finally:
            ingress.close()
        return event

    def turn(self, *outcomes, event=None, session_factory=None):
        opener = FakeOpener(*outcomes)
        event = event or self.event()
        with patch.object(claude.http, 'opener', return_value=opener), \
                patch.object(claude.http, 'access_token', return_value=TOKEN):
            execute(event, PARTNER, self.store, lambda: self.config, session_factory, lambda *_: PARTNER)
        row = self.store.db.execute('SELECT status,result,detail FROM turns WHERE message_id=?', (event['message_id'],)).fetchone()
        return opener, row

    def rows(self):
        return [dict(r) for r in self.store.db.execute('SELECT * FROM conversation_messages ORDER BY epoch,seq')]

    def direct(self, *outcomes, call_tool=None, config=None):
        """ClaudeConversation with a fake tool bridge; returns (session, opener, exception or None)."""
        calls = []
        def tool(name, arguments, ident):
            calls.append((name, arguments, ident))
            if call_tool:
                return call_tool(name, arguments, ident)
            return {'accepted': True} if name == 'finish' else {'observation': 'observation-1'}
        session = claude.ClaudeConversation(config or self.config, self.binding, self.store, CLAUDE_TOOLS, tool)
        opener = FakeOpener(*outcomes)
        session.calls = calls
        with patch.object(claude.http, 'opener', return_value=opener), \
                patch.object(claude.http, 'access_token', return_value=TOKEN):
            try:
                session.run(claude.CLAUDE_INSTRUCTIONS, '{"request":"synthetic"}')
            except ConfigurationError as exc:
                return session, opener, exc
        return session, opener, None

    # 1 ---------------------------------------------------------------------------------------------------------
    def test_request_shape_on_vertex_without_thinking_beta_or_forced_tool_choice(self):
        with self.assertNoLogs(level=logging.DEBUG):
            opener, row = self.turn(reply(THINKING, finish()))
        self.assertEqual(row['status'], 'READY')
        request, timeout = opener.requests[0]
        self.assertEqual(request.full_url, 'https://aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/global'
                                           '/publishers/anthropic/models/claude-opus-5-5:rawPredict')
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + TOKEN)
        self.assertNotIn('anthropic-beta', {k.lower() for k, _ in request.header_items()})
        self.assertEqual(timeout, 300)
        body = json.loads(request.data)
        self.assertEqual(body['anthropic_version'], 'vertex-2023-10-16')
        self.assertEqual(body['max_tokens'], 16000)
        self.assertNotIn('model', body)
        self.assertNotIn('thinking', body)
        self.assertNotIn('anthropic_beta', body)
        self.assertEqual(body['tool_choice'], {'type': 'auto'})
        self.assertEqual(body['output_config'], {'effort': 'high'})
        self.assertEqual(len(body['system']), 2)
        self.assertNotIn('cache_control', body['system'][0])
        self.assertEqual(body['system'][0]['text'], claude.CLAUDE_INSTRUCTIONS)
        self.assertEqual(body['system'][1]['cache_control'], {'type': 'ephemeral'})
        self.assertIn('BUSINESS RULES', body['system'][1]['text'])
        self.assertIn('public.\\"Loans\\"', body['system'][1]['text'])
        self.assertEqual([t['name'] for t in body['tools']], [t['name'] for t in CLAUDE_TOOLS])
        self.assertTrue(all(set(t) == {'name', 'description', 'input_schema'} for t in body['tools']))
        self.assertIn('sql_query', [t['name'] for t in body['tools']])
        self.assertEqual(body['messages'][0]['role'], 'user')
        # A new partner has no earlier conversation: the request alone opens the first epoch.
        self.assertEqual(len(body['messages'][0]['content']), 1)
        self.assertEqual(json.loads(body['messages'][0]['content'][0]['text'])['request'], 'How much does Somchai owe?')
        # The VM token is never written to the journal or the stored history.
        self.store.db.commit()
        for path in self.root.rglob('*'):
            if path.is_file():
                self.assertNotIn(TOKEN.encode(), path.read_bytes())

    def test_regional_location_uses_the_regional_host_and_settings_are_validated(self):
        config = dict(self.config, claude_location='asia-southeast1')
        self.assertTrue(claude.endpoint(config).startswith('https://asia-southeast1-aiplatform.googleapis.com/v1/projects/'
                                                           'clever-oasis-508610-n7/locations/asia-southeast1/'))
        with self.assertRaises(ConfigurationError):
            claude.endpoint(dict(self.config, claude_model='claude-sonnet-5-5'))

    # 2 ---------------------------------------------------------------------------------------------------------
    def test_parallel_tool_uses_return_in_one_message_and_history_replays_byte_identical(self):
        assistant = [THINKING, {'type': 'text', 'text': 'Checking.'},
                     use('loan_payoff', {'loan_id': 'L1'}, 'toolu_1'), use('loan_payoff', {'loan_id': 'L2'}, 'toolu_2')]
        opener, row = self.turn(reply(*assistant), reply(THINKING, finish()))
        self.assertEqual(row['status'], 'READY')
        second = opener.bodies()[1]['messages']
        self.assertEqual(second[1], {'role': 'assistant', 'content': assistant})
        results = second[2]
        self.assertEqual(results['role'], 'user')
        self.assertEqual([r['tool_use_id'] for r in results['content']], ['toolu_1', 'toolu_2'])
        self.assertTrue(all(r['is_error'] and r['content'] == 'SQL_READ_DISABLED' for r in results['content']))
        rows = self.rows()
        self.assertEqual([(r['epoch'], r['seq'], r['role']) for r in rows],
                         [(0, 0, 'user'), (0, 1, 'assistant'), (0, 2, 'user'), (0, 3, 'assistant'), (0, 4, 'user')])
        self.assertEqual([r['input_tokens'] for r in rows], [None, None, None, None, 20900])
        sent = second + [{'role': 'assistant', 'content': [THINKING, finish()]}]
        # The next turn replays every stored message exactly as sent and received, then the new request.
        opener, row = self.turn(reply(finish(ident='toolu_finish2')))
        replay = opener.bodies()[0]['messages']
        self.assertEqual(json.dumps(replay[:5], ensure_ascii=False), json.dumps(sent[:4] + [replay[4]], ensure_ascii=False))
        self.assertEqual(replay[3]['content'][0], THINKING)
        self.assertEqual(replay[4]['content'][0]['type'], 'tool_result')
        self.assertEqual(replay[4]['content'][0]['tool_use_id'], 'toolu_finish')
        self.assertEqual(replay[5]['role'], 'user')
        self.assertEqual(len(replay[5]['content']), 1)  # no history note on a continuing epoch
        self.assertEqual(len(self.rows()), 8)

    def test_tool_failure_text_is_redacted_like_codex(self):
        def tool(name, arguments, ident):
            if name == 'read_records':
                raise RuntimeError('HTTP body with zq-marker-7731')
            if name == 'data_catalogue':
                raise ConfigurationError('UNKNOWN_RESOURCE')
            return {'accepted': True}
        session, opener, error = self.direct(
            reply(use('read_records', {}, 't1'), use('data_catalogue', {}, 't2')), reply(finish()), call_tool=tool)
        self.assertIsNone(error)
        results = opener.bodies()[1]['messages'][2]['content']
        self.assertEqual([r['content'] for r in results], ['TOOL_FAILED_INSPECT_BEFORE_RETRY', 'UNKNOWN_RESOURCE'])
        self.assertNotIn('zq-marker-7731', json.dumps(opener.bodies()))

    # 3 ---------------------------------------------------------------------------------------------------------
    def test_failed_turn_leaves_no_history_and_restart_marks_interrupted_without_rows(self):
        opener, row = self.turn(reply(THINKING, use('loan_payoff', {'loan_id': 'L1'}, 'toolu_1')), http_error(400))
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CLAUDE_HTTP_400'))
        self.assertEqual(json.loads(row['result'])['status'], 'FAILED')
        self.assertEqual(self.rows(), [])
        event = self.event()
        self.assertTrue(self.store.reserve(event, self.binding, PARTNER))
        self.store.recover()
        status = self.store.db.execute('SELECT status FROM turns WHERE message_id=?', (event['message_id'],)).fetchone()[0]
        self.assertEqual(status, 'INTERRUPTED')
        self.assertEqual(self.rows(), [])
        # The next turn replays no partial prefix; it opens a new epoch seeded with the earlier exchanges'
        # text (the failure and interruption replies the partner actually received).
        opener, row = self.turn(reply(finish()), event=self.event('Try again please'))
        messages = opener.bodies()[0]['messages']
        self.assertEqual(len(messages), 1)
        seeded = messages[0]['content'][0]['text']
        self.assertTrue(seeded.startswith('Earlier conversation with this partner'))
        self.assertIn('Partner: How much does Somchai owe?', seeded)
        # Host failure and interruption notices are labelled as such, not as model replies.
        self.assertIn('Notice: I could not complete this request.', seeded)
        self.assertIn('Notice: The previous request was interrupted.', seeded)
        self.assertNotIn('Assistant:', seeded)
        self.assertNotIn('Try again please', seeded)  # the current message is the request, not history

    def test_history_rows_are_append_only_in_sqlite(self):
        self.turn(reply(finish()))
        with self.assertRaises(sqlite3.DatabaseError):
            with self.store.db:
                self.store.db.execute("UPDATE conversation_messages SET content='[]'")
        with self.assertRaises(sqlite3.DatabaseError):
            with self.store.db:
                self.store.db.execute('DELETE FROM conversation_messages')
        self.assertEqual(len(self.rows()), 3)

    # 4 ---------------------------------------------------------------------------------------------------------
    def test_end_turn_without_finish_nudges_once_then_fails(self):
        text = {'type': 'text', 'text': 'Here is the answer.'}
        opener, row = self.turn(reply(THINKING, text, stop='end_turn'), reply(text, stop='end_turn'))
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CONVERSATION_FINISH_MISSING'))
        nudge = opener.bodies()[1]['messages'][-1]
        self.assertEqual(nudge, {'role': 'user', 'content': [{'type': 'text', 'text': claude.FINISH_NUDGE}]})
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(self.rows(), [])

    def test_nudge_then_finish_keeps_the_nudge_in_history(self):
        opener, row = self.turn(reply({'type': 'text', 'text': 'Answer'}, stop='end_turn'), reply(finish()))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual([r['role'] for r in self.rows()], ['user', 'assistant', 'user', 'assistant', 'user'])

    def test_round_cap_gives_a_final_nudge_then_fails(self):
        config = dict(self.config, claude_max_tool_rounds=4)
        rounds = [reply(use('read_records', {}, f't{i}')) for i in range(5)]
        session, opener, error = self.direct(*rounds, config=config)
        self.assertEqual(str(error), 'CLAUDE_TOOL_ROUNDS_EXCEEDED')
        self.assertEqual(len(opener.requests), 5)
        fifth = opener.bodies()[4]['messages'][-1]['content']
        self.assertEqual(fifth[-1], {'type': 'text', 'text': claude.ROUND_NUDGE})
        self.assertEqual(fifth[0]['type'], 'tool_result')
        self.assertIsNone(session.pending_history)

    def test_max_tokens_and_refusal_stops_fail_without_history(self):
        for stop in ('max_tokens', 'refusal', 'pause_turn'):
            with self.subTest(stop=stop):
                session, opener, error = self.direct(reply({'type': 'text', 'text': 'partial'}, stop=stop))
                self.assertEqual(str(error), 'CLAUDE_STOP_' + stop.upper())
                self.assertEqual(session.calls, [])
                self.assertIsNone(session.pending_history)

    def test_unexpected_block_type_fails_closed(self):
        block = {'type': 'server_tool_use', 'id': 'srvtoolu_1', 'name': 'web_search', 'input': {}}
        session, _, error = self.direct(reply(block))
        self.assertEqual(str(error), 'CLAUDE_UNEXPECTED_BLOCK')

    def test_deadline_stops_before_a_request_without_replay(self):
        with patch.object(claude.time, 'monotonic', side_effect=[0.0, 1000.0, 1000.0]):
            opener, row = self.turn(reply(finish()))
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CONVERSATION_TIMEOUT_NO_REPLAY'))
        self.assertEqual(opener.requests, [])

    def test_request_timeout_is_bounded_by_the_remaining_turn_time(self):
        with patch.object(claude.time, 'monotonic', side_effect=[0.0, 590.0, 590.0]):
            opener, row = self.turn(reply(finish()))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual(opener.requests[0][1], 10.0)

    # 5 ---------------------------------------------------------------------------------------------------------
    def test_retry_once_on_429_5xx_and_timeouts_never_on_other_4xx(self):
        for failure in (http_error(429), http_error(503), http_error(529), TimeoutError('timed out'),
                        urllib.error.URLError(TimeoutError('timed out')), ConnectionResetError()):
            with self.subTest(failure=failure):
                session, opener, error = self.direct(failure, reply(finish()))
                self.assertIsNone(error)
                self.assertEqual(len(opener.requests), 2)
        for code in (400, 401, 403, 404, 413):
            with self.subTest(code=code):
                session, opener, error = self.direct(http_error(code), reply(finish()))
                self.assertEqual(str(error), f'CLAUDE_HTTP_{code}')
                self.assertEqual(len(opener.requests), 1)
        session, opener, error = self.direct(http_error(500), http_error(500))
        self.assertEqual((str(error), len(opener.requests)), ('CLAUDE_HTTP_500', 2))
        session, opener, error = self.direct(TimeoutError(), TimeoutError())
        self.assertEqual((str(error), len(opener.requests)), ('CLAUDE_TIMEOUT', 2))

    def test_token_failure_is_a_plain_error(self):
        session = claude.ClaudeConversation(self.config, self.binding, self.store, CLAUDE_TOOLS, lambda *_: None)
        with patch.object(claude.http, 'access_token', side_effect=OSError('metadata')), \
                patch.object(claude.http, 'opener', return_value=FakeOpener()):
            with self.assertRaisesRegex(ConfigurationError, '^CLAUDE_TOKEN_UNAVAILABLE$'):
                session.run(claude.CLAUDE_INSTRUCTIONS, '{}')

    # 6 ---------------------------------------------------------------------------------------------------------
    def test_epoch_rolls_over_after_token_limit_or_prompt_change(self):
        big = {'input_tokens': 1000, 'cache_read_input_tokens': 150000, 'cache_creation_input_tokens': 0, 'output_tokens': 10}
        self.turn(reply(finish(), usage=big))
        opener, _ = self.turn(reply(finish(ident='toolu_2')))
        messages = opener.bodies()[0]['messages']
        self.assertEqual(len(messages), 1)
        # The new epoch is reseeded with the earlier exchange in plain text (no replayed thinking).
        self.assertIn('Assistant: Which borrower do you mean?', messages[0]['content'][0]['text'])
        self.assertEqual(len(messages[0]['content']), 2)
        self.assertEqual(sorted({r['epoch'] for r in self.rows()}), [0, 1])
        # Within the limit the epoch continues.
        opener, _ = self.turn(reply(finish(ident='toolu_3')))
        self.assertEqual(len(opener.bodies()[0]['messages']), 4)
        # A different system prompt or tool set (deploy) starts a new epoch instead of replaying bound thinking.
        with patch.object(claude, 'CLAUDE_INSTRUCTIONS', claude.CLAUDE_INSTRUCTIONS + '\nChanged.'), \
                patch.object(partner_conversation, 'CLAUDE_INSTRUCTIONS', claude.CLAUDE_INSTRUCTIONS + '\nChanged.'):
            opener, _ = self.turn(reply(finish(ident='toolu_4')))
        self.assertEqual(len(opener.bodies()[0]['messages']), 1)
        self.assertEqual(opener.bodies()[0]['messages'][0]['content'][0]['text'].count('Assistant: Which borrower'), 3)
        self.assertEqual(max(r['epoch'] for r in self.rows()), 2)
        # Older epochs stay.
        self.assertEqual([r['epoch'] for r in self.rows()].count(0), 3)

    def test_binding_mismatch_on_the_first_round_restarts_once_in_a_fresh_epoch(self):
        self.turn(reply(THINKING, finish()))
        mismatch = lambda: http_error(400, b'{"error":{"message":"messages.1.content.0: Invalid `signature` in `thinking` '
                                           b'block. The block is bound to a different conversation."}}')
        opener, row = self.turn(mismatch(), reply(finish(ident='toolu_2')))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual([len(b['messages']) for b in opener.bodies()], [4, 1])
        self.assertEqual(max(r['epoch'] for r in self.rows()), 1)
        # A second mismatch in the fresh epoch is not retried.
        opener, row = self.turn(mismatch(), mismatch())
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CLAUDE_HISTORY_BINDING_MISMATCH'))
        self.assertEqual([len(b['messages']) for b in opener.bodies()], [4, 1])

    # 7 ---------------------------------------------------------------------------------------------------------
    def test_provider_switch_keeps_the_codex_thread_and_the_claude_history(self):
        self.store.bind(self.binding, 'codex-thread-1')
        self.turn(reply(finish()))
        parent = self
        class FakeCodex:
            def __init__(self, config, binding, store, tools, call):
                parent.assertIs(tools, TOOLS)
                parent.assertEqual(store.thread(binding), 'codex-thread-1')
                self.call = call
            def run(self, instructions, request):
                parent.assertIs(instructions, partner_conversation.INSTRUCTIONS)
                self.call('finish', {'status': 'CLARIFY', 'message': 'x' * 1500, 'observations': []}, 'finish')
        self.config['conversation_provider'] = 'codex'
        with patch.object(partner_conversation, 'CodexConversation', FakeCodex):
            opener, row = self.turn()
        self.assertEqual(row['status'], 'READY')  # Codex keeps its own length bound
        self.assertEqual(opener.requests, [])
        self.config['conversation_provider'] = 'claude'
        opener, row = self.turn(reply(finish(ident='toolu_2')))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual(len(opener.bodies()[0]['messages']), 4)  # Claude history resumed, Codex turn not in it
        self.assertEqual(self.store.thread(self.binding), 'codex-thread-1')

    def test_provider_selection(self):
        self.assertEqual(partner_conversation.provider({})[:3],
                         (partner_conversation.CodexConversation, partner_conversation.INSTRUCTIONS, TOOLS))
        session, instructions, tools, limit = partner_conversation.provider({'conversation_provider': 'claude'})
        self.assertEqual((session, instructions, tools, limit), (claude.ClaudeConversation, claude.CLAUDE_INSTRUCTIONS, CLAUDE_TOOLS, 1000))
        self.assertNotIn('AppSheet', claude.CLAUDE_INSTRUCTIONS)
        self.assertNotIn('Compatibility for existing persistent sessions', claude.CLAUDE_INSTRUCTIONS)
        self.assertIn('apply the owner decisions in section 15'.lower(), claude.CLAUDE_INSTRUCTIONS.lower())
        self.assertNotIn('has not set another definition', claude.CLAUDE_INSTRUCTIONS)
        self.assertIn('REPLY FORMAT', claude.CLAUDE_INSTRUCTIONS)
        self.assertEqual([t['name'] for t in TOOLS][-1], 'finish')
        self.assertNotIn('sql_query', [t['name'] for t in TOOLS])

    # 11 --------------------------------------------------------------------------------------------------------
    def test_finish_length_gate_applies_to_the_claude_registry_only(self):
        long = 'ก' * 1001
        opener, row = self.turn(reply(finish(long, 'toolu_long')), reply(finish('ตกลง', 'toolu_short')))
        self.assertEqual(row['status'], 'READY')
        rejected = opener.bodies()[1]['messages'][2]['content'][0]
        self.assertTrue(rejected['is_error'])
        self.assertTrue(rejected['content'].startswith('FINISH_MESSAGE_TOO_LONG: 1001 characters; the limit is 1000.'))
        self.assertEqual(json.loads(row['result'])['message'], 'ตกลง')
        exact = ConversationTools(lambda: self.config, self.store, 'gate-1', 'q', tools=CLAUDE_TOOLS, finish_limit=1000)
        self.assertEqual(exact.call('finish', {'status': 'CLARIFY', 'message': 'x' * 1000, 'observations': []}, 'f'), {'accepted': True})
        codex = ConversationTools(lambda: self.config, self.store, 'gate-2', 'q')
        self.assertEqual(codex.call('finish', {'status': 'CLARIFY', 'message': 'x' * 1001, 'observations': []}, 'f'), {'accepted': True})
        with self.assertRaisesRegex(ConfigurationError, 'UNSUPPORTED_TOOL_OR_ARGUMENTS'):
            ConversationTools(lambda: self.config, self.store, 'gate-3', 'q').call('sql_query', {'sql': 'SELECT 1'}, 's')

    def test_sql_tools_answer_through_the_bridge_when_enabled(self):
        self.config.update(conversation_sql_read_enabled=True, database_enabled=True)
        with patch('mw_integration_agent.conversation_sql.query', return_value={'columns': ['n'], 'rows': [{'n': 1}],
                                                                                'row_count': 1, 'complete': True}) as query:
            cited = use('finish', {'status': 'VERIFIED', 'message': 'One loan.', 'observations': ['observation-1']}, 'toolu_f')
            opener, row = self.turn(reply(use('sql_query', {'sql': 'SELECT 1 AS n'}, 'toolu_sql')), reply(cited))
        self.assertEqual(query.call_args.args[1], 'SELECT 1 AS n')
        result = opener.bodies()[1]['messages'][2]['content'][0]
        self.assertNotIn('is_error', result)
        self.assertEqual(json.loads(result['content'])['observation'], 'observation-1')
        self.assertEqual(json.loads(result['content'])['rows'], [{'n': 1}])
        self.assertEqual((row['status'], json.loads(row['result'])['observations']), ('READY', ['observation-1']))

    # Earlier-conversation seeding ------------------------------------------------------------------------------
    def past(self, text, reply_text, status='QUEUED'):
        """A finished earlier turn of this binding, as either provider leaves it in the conversation store."""
        event = self.event(text)
        self.store.reserve(event, self.binding, PARTNER)
        self.store.finish(event['message_id'], status, {'status': 'CLARIFY', 'message': reply_text, 'observations': []})
        return event

    def test_first_claude_epoch_is_seeded_with_codex_and_claude_exchanges_and_replays_identically(self):
        self.store.bind(self.binding, 'codex-thread-1')
        self.past('ยอดค้างของสมชาย', 'สมชายค้าง ฿10,600')  # Codex era
        self.past('And Lisa?', 'I could not complete this request.', status='FAILED_NOTIFIED')
        other = binding_key('100', 'someone-else', '888')
        foreign = self.event('Other partner question')
        self.store.reserve(foreign, other, PARTNER)
        self.store.finish(foreign['message_id'], 'QUEUED', {'status': 'CLARIFY', 'message': 'not yours'})
        current = self.event('What about today?')
        opener, row = self.turn(reply(THINKING, finish()), event=current)
        self.assertEqual(row['status'], 'READY')
        first = opener.bodies()[0]['messages'][0]['content']
        seeded = first[0]['text']
        self.assertEqual(seeded.split('\n\n'), [
            'Earlier conversation with this partner (context only; oldest first; Bangkok time):',
            '[21-Oct-2026 11:01] Partner: ยอดค้างของสมชาย\n[' + claude.stamp(self.created('event001')) + '] Assistant: สมชายค้าง ฿10,600',
            '[21-Oct-2026 11:02] Partner: And Lisa?\n[' + claude.stamp(self.created('event002')) + '] Notice: I could not complete this request.'])
        self.assertNotIn('Other partner question', seeded)
        self.assertNotIn('What about today?', seeded)
        self.assertEqual(json.loads(first[1]['text'])['request'], 'What about today?')
        self.assertIn('Earlier conversation', claude.CLAUDE_INSTRUCTIONS)
        self.assertIn('never repeat an action', claude.CLAUDE_INSTRUCTIONS)
        # The seeded text is stored with the user message, so the next turn replays it unchanged.
        opener2, _ = self.turn(reply(finish(ident='toolu_2')))
        replay = opener2.bodies()[0]['messages']
        self.assertEqual(json.dumps(replay[0], ensure_ascii=False), json.dumps(opener.bodies()[0]['messages'][0], ensure_ascii=False))
        self.assertEqual(replay[1]['content'][0], THINKING)
        self.assertEqual(len(replay[-1]['content']), 1)  # a continuing epoch is not reseeded
        self.assertEqual(self.store.thread(self.binding), 'codex-thread-1')

    def created(self, message_id):
        return self.store.db.execute('SELECT created_at FROM turns WHERE message_id=?', (message_id,)).fetchone()[0]

    def test_seed_budget_keeps_the_newest_whole_exchanges_and_counts_the_omitted(self):
        for n in range(5):
            self.past(f'question {n} ' + 'x' * 40, f'answer {n} ' + 'y' * 40)
        block = len(claude.transcript([dict(message_id='m', created_at=0, status='QUEUED', result=json.dumps({'message': 'answer 0 ' + 'y' * 40}))],
                                      {'m': ('question 0 ' + 'x' * 40, 0)}, 10 ** 6)[0].split('\n\n', 1)[1])
        self.config['claude_seed_history_chars'] = 2 * block + 5
        opener, row = self.turn(reply(finish()))
        seeded = opener.bodies()[0]['messages'][0]['content'][0]['text']
        self.assertTrue(seeded.startswith('Earlier conversation with this partner (context only; oldest first; Bangkok time; '
                                          '3 earlier exchanges omitted):'))
        self.assertEqual([n for n in range(5) if f'question {n} ' in seeded], [3, 4])
        self.assertLess(seeded.index('question 3'), seeded.index('question 4'))
        # A budget smaller than one exchange keeps none and still says how many exist (5 earlier + that turn).
        self.config['claude_seed_history_chars'] = 10
        session = claude.ClaudeConversation(self.config, self.binding, self.store, CLAUDE_TOOLS, lambda *_: None)
        self.assertTrue(session.seed(claude.validate(self.config)).endswith('; 6 earlier exchanges omitted):'))
        self.assertEqual(session.seeded, {'exchanges': 0, 'chars': 0, 'status': 'seeded'})

    def test_seed_read_failure_continues_with_a_note(self):
        self.past('Earlier question', 'Earlier answer')
        with patch.object(claude, 'partner_texts', side_effect=OSError('ingress unavailable')):
            session, opener, error = self.direct(reply(finish()))
        self.assertIsNone(error)
        self.assertEqual(opener.bodies()[0]['messages'][0]['content'][0]['text'], claude.SEED_FAILED_NOTE)
        self.assertEqual(session.seeded['status'], 'unavailable')
        (self.root / 'instagram-ingress.db').unlink()
        opener, row = self.turn(reply(finish()), event={'message_id': 'no-ingress', 'sender_id': '999', 'text': 'q',
                                                        'attachments': '[]'})
        self.assertEqual(row['status'], 'READY')
        self.assertEqual(opener.bodies()[0]['messages'][0]['content'][0]['text'], claude.SEED_FAILED_NOTE)

    def test_seed_can_be_disabled(self):
        self.past('Earlier question', 'Earlier answer')
        self.config['claude_seed_history_chars'] = 0
        session, opener, error = self.direct(reply(finish()))
        self.assertEqual(opener.bodies()[0]['messages'][0]['content'][0]['text'], claude.HISTORY_NOTE)
        self.assertEqual(session.seeded['status'], 'disabled')

    def test_current_message_is_excluded_by_its_bound_tool_bridge(self):
        event = self.past('Same message', 'Its own reply')
        bridge = ConversationTools(lambda: self.config, self.store, event['message_id'], 'Same message', tools=CLAUDE_TOOLS)
        session = claude.ClaudeConversation(self.config, self.binding, self.store, CLAUDE_TOOLS, bridge.call)
        self.assertEqual(session.current, event['message_id'])
        self.assertIsNone(session.seed(claude.validate(self.config)))

    def test_nul_in_model_content_is_stored_and_replayed_verbatim(self):
        text = {'type': 'text', 'text': 'a\x00b'}
        self.turn(reply(text, finish()))
        self.assertIn('\\u0000', self.rows()[1]['content'])
        opener, _ = self.turn(reply(finish(ident='toolu_2')))
        self.assertEqual(opener.bodies()[0]['messages'][1]['content'][0], text)


if __name__ == '__main__':
    unittest.main()
