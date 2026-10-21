"""Gemini (gemini-4-argon) on Vertex AI behind the Partner conversation: request shape, parts and signatures,
tool loop, stop reasons, retries, history epochs, seeding, provider switches and configuration.

Fake HTTP only (the Vertex opener and the VM token are patched); SQLite journals; no live service. Response
shapes follow Forge's live call (functionCall with id and thoughtSignature in the same part).
"""
import io
import json
import logging
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import claude_conversation as claude
from mw_integration_agent import conversation_session as session
from mw_integration_agent import gemini_conversation as gemini
from mw_integration_agent import partner_conversation
from mw_integration_agent.config import ConfigurationError, load_json, validate_catalogue, validate_config
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import CLAUDE_TOOLS, TOOLS
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.partner_conversation import execute

ROOT = Path(__file__).resolve().parents[1]
TOKEN = 'ya29.synthetic-vm-token'
PARTNER = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English',
           'email': 'test@example.com', 'enabled': True}
SIGNATURE = 'AY89synthetic-thought-signature=='


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


def call(name, args, ident=None, signature=SIGNATURE):
    part = {'functionCall': {'name': name, 'args': args, **({'id': ident} if ident else {})}}
    if signature:
        part['thoughtSignature'] = signature
    return part


def finish(message='Which borrower do you mean?', ident='call_finish', status='CLARIFY', observations=()):
    return call('finish', {'status': status, 'message': message, 'observations': list(observations)}, ident)


def reply(*parts, reason='STOP', usage=None):
    return json.dumps({'candidates': [{'content': {'role': 'model', 'parts': list(parts)}, 'finishReason': reason}],
                       'usageMetadata': usage or {'promptTokenCount': 21000, 'candidatesTokenCount': 40,
                                                  'thoughtsTokenCount': 300, 'totalTokenCount': 21340,
                                                  'trafficType': 'ON_DEMAND', 'cachedContentTokenCount': 20000},
                       'modelVersion': 'gemini-4-argon'}).encode()


def http_error(code, body=b'{}'):
    return urllib.error.HTTPError('https://vertex', code, 'error', {}, io.BytesIO(body))


class GeminiConversationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = ConversationStore(self.root / 'partner-conversations.db')
        self.addCleanup(self.store.close)
        self.config = {'state_directory': str(self.root), 'instagram_account_id': '100',
                       'partner_conversations_enabled': True, 'conversation_timeout_seconds': 600,
                       'conversation_provider': 'gemini', 'gemini_project': 'clever-oasis-508610-n7',
                       'gemini_location': 'global', 'claude_project': 'clever-oasis-508610-n7'}
        self.binding = binding_key('100', PARTNER['id'], '999')
        self.count = 0
        pause = patch.object(session.time, 'sleep')
        self.pause = pause.start()
        self.addCleanup(pause.stop)

    def event(self, text='How much does Somchai owe?'):
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
        with patch.object(session.http, 'opener', return_value=opener), \
                patch.object(session.http, 'access_token', return_value=TOKEN):
            execute(event, PARTNER, self.store, lambda: self.config, session_factory, lambda *_: PARTNER)
        row = self.store.db.execute('SELECT status,result,detail FROM turns WHERE message_id=?', (event['message_id'],)).fetchone()
        return opener, row

    def rows(self):
        return [dict(r) for r in self.store.db.execute('SELECT * FROM conversation_messages ORDER BY epoch,seq')]

    def direct(self, *outcomes, call_tool=None, config=None):
        calls = []
        def tool(name, arguments, ident):
            calls.append((name, arguments, ident))
            if call_tool:
                return call_tool(name, arguments, ident)
            return {'accepted': True} if name == 'finish' else {'observation': 'observation-1'}
        conversation = gemini.GeminiConversation(config or self.config, self.binding, self.store, CLAUDE_TOOLS, tool)
        conversation.calls = calls
        opener = FakeOpener(*outcomes)
        with patch.object(session.http, 'opener', return_value=opener), \
                patch.object(session.http, 'access_token', return_value=TOKEN):
            try:
                conversation.run(gemini.ASSISTANT_INSTRUCTIONS, '{"request":"synthetic"}')
            except ConfigurationError as exc:
                return conversation, opener, exc
        return conversation, opener, None

    def past(self, text, reply_text, status='QUEUED'):
        event = self.event(text)
        self.store.reserve(event, self.binding, PARTNER)
        self.store.finish(event['message_id'], status, {'status': 'CLARIFY', 'message': reply_text, 'observations': []})
        return event

    # 1 ---------------------------------------------------------------------------------------------------------
    def test_request_shape_on_vertex(self):
        with self.assertNoLogs(level=logging.DEBUG):
            opener, row = self.turn(reply(finish()))
        self.assertEqual(row['status'], 'READY')
        request, timeout = opener.requests[0]
        self.assertEqual(request.full_url, 'https://aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/global'
                                           '/publishers/google/models/gemini-4-argon:generateContent')
        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + TOKEN)
        self.assertEqual(timeout, 300)
        body = json.loads(request.data)
        self.assertEqual(set(body), {'systemInstruction', 'contents', 'tools', 'toolConfig', 'generationConfig'})
        self.assertEqual(body['systemInstruction']['parts'][0]['text'], gemini.ASSISTANT_INSTRUCTIONS)
        self.assertIn('BUSINESS RULES', body['systemInstruction']['parts'][1]['text'])
        self.assertEqual(body['toolConfig'], {'functionCallingConfig': {'mode': 'AUTO'}})
        # The default thinking level HIGH is always sent; never thinkingBudget, never temperature.
        self.assertEqual(body['generationConfig'], {'maxOutputTokens': 16384, 'candidateCount': 1,
                                                    'thinkingConfig': {'thinkingLevel': 'HIGH'}})
        self.assertNotIn('thinkingBudget', request.data.decode())
        self.assertNotIn('temperature', request.data.decode())
        declarations = body['tools'][0]['functionDeclarations']
        self.assertEqual([d['name'] for d in declarations], [t['name'] for t in CLAUDE_TOOLS])
        self.assertNotIn('additionalProperties', json.dumps(declarations))
        read = next(d for d in declarations if d['name'] == 'read_records')['parameters']
        self.assertEqual(read['type'], 'OBJECT')
        self.assertEqual(read['properties']['limit'], {'type': 'INTEGER', 'minimum': 1, 'maximum': 100})
        self.assertEqual(read['properties']['keys'], {'type': 'ARRAY', 'items': {'type': 'STRING'}})
        self.assertIn('limit', read['required'])
        status = next(d for d in declarations if d['name'] == 'finish')['parameters']['properties']['status']
        self.assertEqual(status, {'type': 'STRING', 'enum': ['VERIFIED', 'CLARIFY', 'REFUSE']})
        self.assertEqual(body['contents'], [{'role': 'user', 'parts': [{'text': body['contents'][0]['parts'][0]['text']}]}])
        self.assertEqual(json.loads(body['contents'][0]['parts'][0]['text'])['request'], 'How much does Somchai owe?')
        self.store.db.commit()
        for path in self.root.rglob('*'):
            if path.is_file():
                self.assertNotIn(TOKEN.encode(), path.read_bytes())

    def test_thinking_level_is_always_sent_and_regional_host(self):
        for level in ('LOW', 'MEDIUM', 'HIGH', 'MAX'):
            config = dict(self.config, gemini_conversation_thinking_level=level)
            conversation, opener, error = self.direct(reply(call('read_records', {}, 'c1')), reply(finish()), config=config)
            self.assertIsNone(error)
            for body in opener.bodies():
                self.assertEqual(body['generationConfig']['thinkingConfig'], {'thinkingLevel': level})
                self.assertEqual(body['generationConfig']['maxOutputTokens'], 16384)
                self.assertNotIn('thinkingBudget', json.dumps(body))
        self.assertTrue(gemini.endpoint(dict(self.config, gemini_location='asia-southeast1')).startswith(
            'https://asia-southeast1-aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/asia-southeast1/'
            'publishers/google/models/gemini-4-argon:generateContent'))

    # 2 ---------------------------------------------------------------------------------------------------------
    def test_integer_valued_floats_become_ints_for_integer_properties(self):
        arguments = {'app': 'oltp', 'table': 'Loans', 'keys': [], 'match_field': '', 'match_text': '', 'filter': '',
                     'columns': ['Row ID'], 'offset': 0.0, 'limit': 100.0}
        conversation, opener, error = self.direct(reply(call('read_records', arguments, 'call_1')), reply(finish()))
        self.assertIsNone(error)
        name, received, _ = conversation.calls[0]
        self.assertEqual((received['offset'], received['limit']), (0, 100))
        self.assertIs(type(received['limit']), int)
        self.assertEqual(gemini.coerce({'limit': 2.5, 'table': 1.0}, next(t for t in TOOLS if t['name'] == 'read_records')),
                         {'limit': 2.5, 'table': 1.0})

    # 3 ---------------------------------------------------------------------------------------------------------
    def test_parallel_calls_answer_in_order_with_ids_echoed_and_derived_journal_ids(self):
        parts = [{'text': 'Checking both.', 'thoughtSignature': SIGNATURE},
                 call('loan_payoff', {'loan_id': 'L1'}, 'call_818466'), call('loan_payoff', {'loan_id': 'L2'}, None, None)]
        conversation, opener, error = self.direct(reply(*parts), reply(finish()))
        self.assertIsNone(error)
        self.assertEqual([c[2] for c in conversation.calls[:2]], ['call_818466', 'gemini-1-1'])
        second = opener.bodies()[1]['contents']
        self.assertEqual(second[1], {'role': 'model', 'parts': parts})
        self.assertEqual(second[2], {'role': 'user', 'parts': [
            {'functionResponse': {'name': 'loan_payoff', 'id': 'call_818466', 'response': {'result': {'observation': 'observation-1'}}}},
            {'functionResponse': {'name': 'loan_payoff', 'response': {'result': {'observation': 'observation-1'}}}}]})

    def test_tool_errors_are_redacted_like_codex_and_journal_ids_stay_unique(self):
        def tool(name, arguments, ident):
            if name == 'read_records':
                raise RuntimeError('HTTP body zq-marker-7731')
            if name == 'data_catalogue':
                raise ConfigurationError('UNKNOWN_RESOURCE')
            return {'accepted': True}
        conversation, opener, error = self.direct(
            reply(call('read_records', {}, 'call_a'), call('data_catalogue', {}, 'call_b')),
            reply(call('data_catalogue', {}, 'call_a')), reply(finish()), call_tool=tool)
        self.assertIsNone(error)
        answers = [p['functionResponse'] for p in opener.bodies()[1]['contents'][2]['parts']]
        self.assertEqual([a['response'] for a in answers], [{'error': 'TOOL_FAILED_INSPECT_BEFORE_RETRY'}, {'error': 'UNKNOWN_RESOURCE'}])
        self.assertNotIn('zq-marker-7731', json.dumps(opener.bodies()))
        # A repeated model id in a later round is echoed, but journals under a distinct id.
        self.assertEqual([c[2] for c in conversation.calls], ['call_a', 'call_b', 'call_a~2-0', 'call_finish'])
        self.assertEqual(opener.bodies()[2]['contents'][4]['parts'][0]['functionResponse']['id'], 'call_a')

    def test_duplicate_call_id_in_one_response_journals_uniquely_and_echoes_the_model_id(self):
        conversation, opener, error = self.direct(reply(call('loan_payoff', {'loan_id': 'L1'}, 'x'),
                                                        call('loan_payoff', {'loan_id': 'L2'}, 'x')), reply(finish()))
        self.assertIsNone(error)
        self.assertEqual([(c[1], c[2]) for c in conversation.calls[:2]], [({'loan_id': 'L1'}, 'x'), ({'loan_id': 'L2'}, 'x~1-1')])
        answers = [p['functionResponse'] for p in opener.bodies()[1]['contents'][2]['parts']]
        self.assertEqual([a['id'] for a in answers], ['x', 'x'])

    # 4 ---------------------------------------------------------------------------------------------------------
    def test_signatures_replay_byte_identical_across_turns(self):
        first = [{'text': 'Let me check.', 'thoughtSignature': SIGNATURE}, call('loan_payoff', {'loan_id': 'L1'}, 'call_1')]
        opener, row = self.turn(reply(*first), reply(finish()))
        self.assertEqual(row['status'], 'READY')
        rows = self.rows()
        self.assertEqual([(r['provider'], r['role']) for r in rows],
                         [('gemini', 'user'), ('gemini', 'model'), ('gemini', 'user'), ('gemini', 'model'), ('gemini', 'user')])
        self.assertEqual(json.loads(rows[1]['content']), first)
        self.assertEqual([r['input_tokens'] for r in rows], [None, None, None, None, 21000])
        sent = opener.bodies()[1]['contents'] + [{'role': 'model', 'parts': [finish()]}]
        # A text-only reply with a signature (after the nudge) is also kept verbatim.
        text_only = {'text': 'Done.', 'thoughtSignature': SIGNATURE + 'b'}
        opener2, row2 = self.turn(reply(text_only), reply(finish(ident='call_finish2')))
        self.assertEqual(row2['status'], 'READY')
        replay = opener2.bodies()[0]['contents']
        self.assertEqual(json.dumps(replay[:4], ensure_ascii=False), json.dumps(sent[:4], ensure_ascii=False))
        self.assertEqual(replay[4]['parts'][0]['functionResponse']['id'], 'call_finish')
        self.assertEqual(opener2.bodies()[1]['contents'][-2], {'role': 'model', 'parts': [text_only]})
        third, _ = self.turn(reply(finish(ident='call_finish3')))
        replay3 = third.bodies()[0]['contents']
        self.assertEqual(json.dumps(replay3[:len(opener2.bodies()[1]['contents'])], ensure_ascii=False),
                         json.dumps(opener2.bodies()[1]['contents'], ensure_ascii=False))
        self.assertIn({'role': 'model', 'parts': [text_only]}, replay3)

    def test_signature_only_part_is_stored_and_replayed_with_no_other_meaning(self):
        alone = {'thoughtSignature': SIGNATURE + 'only'}
        opener, row = self.turn(reply(alone, finish()))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual(json.loads(self.rows()[1]['content']), [alone, finish()])
        self.assertEqual(len(opener.requests), 1)  # not a call, not text: the finish call alone was answered
        # Signature-only reply with no call: treated as no finish (one nudge), and stored with the turn.
        opener2, row2 = self.turn(reply(alone), reply(finish(ident='call_finish2')))
        self.assertEqual(row2['status'], 'READY')
        self.assertEqual(opener2.bodies()[1]['contents'][-2:], [{'role': 'model', 'parts': [alone]},
                                                              {'role': 'user', 'parts': [{'text': session.FINISH_NUDGE}]}])
        opener3, _ = self.turn(reply(finish(ident='call_finish3')))
        replay = opener3.bodies()[0]['contents']
        self.assertEqual(json.dumps(replay[1], ensure_ascii=False),
                         json.dumps({'role': 'model', 'parts': [alone, finish()]}, ensure_ascii=False))
        self.assertIn({'role': 'model', 'parts': [alone]}, replay)

    def test_unknown_part_fields_are_kept_verbatim_and_ignored(self):
        extra = dict(finish(), futureField={'nested': [1, 'two']}, videoMetadata={'fps': 1})
        with_data = {'thoughtSignature': SIGNATURE, 'inlineData': {'mimeType': 'text/plain', 'data': 'eA=='}}
        opener, row = self.turn(reply(with_data, extra))
        self.assertEqual(row['status'], 'READY')
        self.assertEqual(len(opener.requests), 1)  # the finish call was recognised beside the extra fields
        self.assertEqual(self.rows()[1]['content'], json.dumps([with_data, extra], ensure_ascii=False, separators=(',', ':')))
        opener2, _ = self.turn(reply(finish(ident='call_finish2')))
        self.assertEqual(json.dumps(opener2.bodies()[0]['contents'][1], ensure_ascii=False),
                         json.dumps({'role': 'model', 'parts': [with_data, extra]}, ensure_ascii=False))

    # 5 ---------------------------------------------------------------------------------------------------------
    def test_stop_without_finish_nudges_once_then_fails(self):
        text = {'text': 'Here is the answer.', 'thoughtSignature': SIGNATURE}
        opener, row = self.turn(reply(text), reply(text))
        self.assertEqual((row['status'], row['detail']), ('FAILED', 'CONVERSATION_FINISH_MISSING'))
        self.assertEqual(opener.bodies()[1]['contents'][-1], {'role': 'user', 'parts': [{'text': session.FINISH_NUDGE}]})
        self.assertEqual(self.rows(), [])

    def test_round_cap_final_nudge_then_fails(self):
        config = dict(self.config, gemini_conversation_max_tool_rounds=4)
        rounds = [reply(call('read_records', {}, f'c{i}')) for i in range(5)]
        conversation, opener, error = self.direct(*rounds, config=config)
        self.assertEqual(str(error), 'GEMINI_TOOL_ROUNDS_EXCEEDED')
        self.assertEqual(opener.bodies()[4]['contents'][-1], {'role': 'user', 'parts': [{'text': session.ROUND_NUDGE}]})
        self.assertIsNone(conversation.pending_history)

    def test_round_cap_nudge_is_its_own_user_content_and_replays_in_order(self):
        # Live Vertex: functionResponse and text parts in one user content are a 400; separate contents are 200.
        self.config['gemini_conversation_max_tool_rounds'] = 4
        rounds = [reply(call('read_records', {}, f'c{i}')) for i in range(4)]
        opener, row = self.turn(*rounds, reply(finish()))
        self.assertEqual(row['status'], 'READY')
        fifth = opener.bodies()[4]['contents']
        self.assertEqual(fifth[-3]['role'], 'model')
        self.assertEqual(fifth[-2]['role'], 'user')
        self.assertTrue(fifth[-2]['parts'] and all(set(p) == {'functionResponse'} for p in fifth[-2]['parts']))
        self.assertEqual(fifth[-1], {'role': 'user', 'parts': [{'text': session.ROUND_NUDGE}]})
        for body in opener.bodies():
            for content in body['contents']:
                kinds = {'functionResponse' if 'functionResponse' in p else 'other' for p in content['parts']}
                self.assertNotEqual(kinds, {'functionResponse', 'other'})
        stored = [(r['role'], json.loads(r['content'])) for r in self.rows()]
        self.assertEqual(stored[-4:-2], [('user', fifth[-2]['parts']), ('user', fifth[-1]['parts'])])
        replay, _ = self.turn(reply(finish(ident='call_finish2')))
        sent = fifth + [{'role': 'model', 'parts': [finish()]}]
        self.assertEqual(json.dumps(replay.bodies()[0]['contents'][:len(sent)], ensure_ascii=False),
                         json.dumps(sent, ensure_ascii=False))

    def test_every_other_finish_reason_fails_without_history(self):
        for reason in ('MAX_TOKENS', 'SAFETY', 'PROHIBITED_CONTENT', 'RECITATION', 'BLOCKLIST', 'SPII', 'OTHER',
                       'SOMETHING_NEW', None):
            with self.subTest(reason=reason):
                opener, row = self.turn(reply(finish(), reason=reason))
                self.assertEqual((row['status'], row['detail']), ('FAILED', 'GEMINI_STOP_' + (reason or 'UNKNOWN')))
        self.assertEqual(self.rows(), [])

    def test_malformed_function_call_is_resent_identically_once(self):
        conversation, opener, error = self.direct(reply(reason='MALFORMED_FUNCTION_CALL'), reply(finish()))
        self.assertIsNone(error)
        self.assertEqual(opener.requests[0][0].data, opener.requests[1][0].data)
        self.assertEqual(conversation.rounds, 1)
        conversation, opener, error = self.direct(reply(reason='MALFORMED_FUNCTION_CALL'),
                                                  reply(reason='MALFORMED_FUNCTION_CALL'))
        self.assertEqual((str(error), len(opener.requests)), ('GEMINI_STOP_MALFORMED_FUNCTION_CALL', 2))

    def test_blocked_prompt_missing_candidate_and_unexpected_parts(self):
        cases = [(json.dumps({'promptFeedback': {'blockReason': 'PROHIBITED_CONTENT'}}).encode(), 'GEMINI_PROMPT_BLOCKED_PROHIBITED_CONTENT'),
                 (json.dumps({'candidates': []}).encode(), 'GEMINI_RESPONSE_INVALID'),
                 (json.dumps({'usageMetadata': {}}).encode(), 'GEMINI_RESPONSE_INVALID'),
                 (b'not json', 'GEMINI_RESPONSE_INVALID'),
                 (json.dumps({'candidates': [{'finishReason': 'STOP'}]}).encode(), 'GEMINI_RESPONSE_INVALID'),
                 (json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': []}}]}).encode(), 'GEMINI_RESPONSE_INVALID'),
                 (reply({'executableCode': {'code': 'print(1)'}}), 'GEMINI_UNEXPECTED_PART'),
                 (reply({}), 'GEMINI_UNEXPECTED_PART'),
                 (reply({'inlineData': {'mimeType': 'text/plain', 'data': ''}}), 'GEMINI_UNEXPECTED_PART'),
                 (reply({'functionCall': {'args': {}}}), 'GEMINI_RESPONSE_INVALID')]
        for raw, code in cases:
            with self.subTest(code=code, raw=raw[:60]):
                conversation, opener, error = self.direct(raw)
                self.assertEqual(str(error), code)
                self.assertEqual(conversation.calls, [])
        # Thought parts are accepted and stored (a missing thoughtsTokenCount counts as 0).
        usage = {'promptTokenCount': 900, 'candidatesTokenCount': 4, 'totalTokenCount': 904}
        conversation, opener, error = self.direct(reply({'text': 'plan', 'thought': True}, finish(), usage=usage))
        self.assertIsNone(error)
        response = conversation.parse(reply(finish(), usage=usage))
        self.assertEqual((response['audit']['thoughts_tokens'], response['input_tokens']), (0, 900))

    # 6 ---------------------------------------------------------------------------------------------------------
    def test_retries_capacity_twice_other_transients_once_never_other_4xx(self):
        for code in (429, 503):
            with self.subTest(code=code):
                self.pause.reset_mock()
                conversation, opener, error = self.direct(http_error(code), http_error(code), reply(finish()))
                self.assertIsNone(error)
                self.assertEqual(len(opener.requests), 3)
                self.assertEqual([c.args[0] for c in self.pause.call_args_list], [2, 5])
                self.assertEqual(conversation.attempts, 3)
                conversation, opener, error = self.direct(http_error(code), http_error(code), http_error(code))
                self.assertEqual((str(error), len(opener.requests)), (f'GEMINI_HTTP_{code}', 3))
                self.assertIsNone(conversation.pending_history)
        for failure in (http_error(500), http_error(502), http_error(504), TimeoutError(), ConnectionResetError()):
            with self.subTest(failure=failure):
                self.pause.reset_mock()
                conversation, opener, error = self.direct(failure, reply(finish()))
                self.assertIsNone(error)
                self.assertEqual(len(opener.requests), 2)
                self.assertEqual([c.args[0] for c in self.pause.call_args_list], [1])
        conversation, opener, error = self.direct(http_error(500), http_error(500))
        self.assertEqual((str(error), len(opener.requests)), ('GEMINI_HTTP_500', 2))
        conversation, opener, error = self.direct(TimeoutError(), TimeoutError())
        self.assertEqual((str(error), len(opener.requests)), ('GEMINI_TIMEOUT', 2))
        for code in (400, 401, 403, 404):
            with self.subTest(code=code):
                conversation, opener, error = self.direct(http_error(code), reply(finish()))
                self.assertEqual((str(error), len(opener.requests)), (f'GEMINI_HTTP_{code}', 1))

    def test_retries_stay_inside_the_deadline(self):
        # Deadline 600 s; after the first 429 only 5 s remain, less than the 2 s pause plus the minimum.
        with patch.object(session.time, 'monotonic', side_effect=[0.0, 0.0, 595.0]):
            conversation, opener, error = self.direct(http_error(429), reply(finish()))
        self.assertEqual((str(error), len(opener.requests)), ('GEMINI_HTTP_429', 1))
        with patch.object(session.time, 'monotonic', side_effect=[0.0, 1000.0, 1000.0]):
            opener, row = self.turn(reply(finish()))
        self.assertEqual((row['status'], row['detail'], opener.requests), ('FAILED', 'CONVERSATION_TIMEOUT_NO_REPLAY', []))
        with patch.object(session.time, 'monotonic', side_effect=[0.0, 590.0]):
            opener, row = self.turn(reply(finish()))
        self.assertEqual((row['status'], opener.requests[0][1]), ('READY', 10.0))

    # 7 ---------------------------------------------------------------------------------------------------------
    def test_epoch_rolls_on_token_limit_provider_change_and_prompt_change(self):
        big = {'promptTokenCount': 150001, 'candidatesTokenCount': 1, 'totalTokenCount': 150002}
        self.turn(reply(finish(), usage=big))
        opener, _ = self.turn(reply(finish(ident='f2')))
        self.assertEqual(len(opener.bodies()[0]['contents']), 1)
        self.assertIn('Assistant: Which borrower do you mean?', opener.bodies()[0]['contents'][0]['parts'][0]['text'])
        opener, _ = self.turn(reply(finish(ident='f3')))
        self.assertEqual(len(opener.bodies()[0]['contents']), 4)  # within the limit the epoch continues
        with patch.object(partner_conversation, 'ASSISTANT_INSTRUCTIONS', gemini.ASSISTANT_INSTRUCTIONS + '\nChanged.'):
            opener, _ = self.turn(reply(finish(ident='f4')))
        self.assertEqual(len(opener.bodies()[0]['contents']), 1)
        self.assertEqual(sorted({r['epoch'] for r in self.rows()}), [0, 1, 2])
        self.assertEqual({r['provider'] for r in self.rows()}, {'gemini'})

    # 8 ---------------------------------------------------------------------------------------------------------
    def test_first_gemini_epoch_is_seeded_from_turns_of_any_provider(self):
        self.store.bind(self.binding, 'codex-thread-1')
        self.past('ยอดค้างของสมชาย', 'สมชายค้าง ฿10,600')  # Codex era
        self.past('And Lisa?', 'I could not complete this request.', status='FAILED_NOTIFIED')
        current = self.event('What about today?')
        opener, row = self.turn(reply(finish()), event=current)
        self.assertEqual(row['status'], 'READY')
        parts = opener.bodies()[0]['contents'][0]['parts']
        self.assertTrue(parts[0]['text'].startswith('Earlier conversation with this partner (context only;'))
        self.assertIn('Partner: ยอดค้างของสมชาย', parts[0]['text'])
        self.assertIn('Assistant: สมชายค้าง ฿10,600', parts[0]['text'])
        self.assertIn('Notice: I could not complete this request.', parts[0]['text'])
        self.assertNotIn('What about today?', parts[0]['text'])
        self.assertEqual(json.loads(parts[1]['text'])['request'], 'What about today?')
        self.assertEqual(json.loads(self.rows()[0]['content'])[0], parts[0])  # stored, so replayed unchanged

    def test_seed_disabled_and_unavailable_notes(self):
        self.past('Earlier question', 'Earlier answer')
        conversation, opener, error = self.direct(reply(finish()), config=dict(self.config, gemini_conversation_seed_history_chars=0))
        self.assertEqual(opener.bodies()[0]['contents'][0]['parts'][0]['text'], session.HISTORY_NOTE)
        self.assertEqual(conversation.seeded['status'], 'disabled')
        with patch.object(gemini, 'partner_texts', side_effect=OSError('ingress unavailable')):
            conversation, opener, error = self.direct(reply(finish()))
        self.assertIsNone(error)
        self.assertEqual(opener.bodies()[0]['contents'][0]['parts'][0]['text'], session.SEED_FAILED_NOTE)
        self.assertEqual(conversation.seeded['status'], 'unavailable')

    # 9 ---------------------------------------------------------------------------------------------------------
    def test_finish_gate_applies_to_gemini(self):
        opener, row = self.turn(reply(finish('ก' * 1001, 'long')), reply(finish('ตกลง', 'short')))
        self.assertEqual(row['status'], 'READY')
        rejected = opener.bodies()[1]['contents'][2]['parts'][0]['functionResponse']
        self.assertTrue(rejected['response']['error'].startswith('FINISH_MESSAGE_TOO_LONG: 1001 characters; the limit is 1000.'))
        self.assertEqual(json.loads(row['result'])['message'], 'ตกลง')

    # 10 --------------------------------------------------------------------------------------------------------
    def test_provider_switch_codex_gemini_claude_keeps_each_providers_rows_apart(self):
        self.store.bind(self.binding, 'codex-thread-1')
        parent = self
        class FakeCodex:
            def __init__(self, config, binding, store, tools, call):
                parent.assertIs(tools, TOOLS)
                parent.assertEqual(store.thread(binding), 'codex-thread-1')
                self.call = call
            def run(self, instructions, request):
                self.call('finish', {'status': 'CLARIFY', 'message': 'codex reply', 'observations': []}, 'finish')
        self.config['conversation_provider'] = 'codex'
        with patch.object(partner_conversation, 'CodexConversation', FakeCodex):
            self.turn()
        self.config['conversation_provider'] = 'gemini'
        opener, row = self.turn(reply(finish()))
        self.assertIn('Assistant: codex reply', opener.bodies()[0]['contents'][0]['parts'][0]['text'])
        self.config['conversation_provider'] = 'claude'
        claude_finish = {'type': 'tool_use', 'id': 'toolu_f', 'name': 'finish',
                         'input': {'status': 'CLARIFY', 'message': 'claude reply', 'observations': []}}
        claude_reply = json.dumps({'type': 'message', 'role': 'assistant', 'content': [claude_finish], 'stop_reason': 'tool_use',
                                   'usage': {'input_tokens': 10}}).encode()
        opener, row = self.turn(claude_reply)
        self.assertEqual(row['status'], 'READY')
        messages = opener.bodies()[0]['messages']
        self.assertEqual(len(messages), 1)  # no Gemini rows are replayed to Claude: a new, seeded epoch
        self.assertIn('Assistant: Which borrower do you mean?', messages[0]['content'][0]['text'])
        self.config['conversation_provider'] = 'gemini'
        opener, row = self.turn(reply(finish(ident='f2')))
        self.assertEqual(len(opener.bodies()[0]['contents']), 1)  # nor Claude rows to Gemini
        self.assertEqual([(r['epoch'], r['provider']) for r in self.rows() if r['seq'] == 0],
                         [(0, 'gemini'), (1, 'claude'), (2, 'gemini')])
        self.assertEqual(self.store.thread(self.binding), 'codex-thread-1')

    def test_provider_selection(self):
        conversation, instructions, tools, limit = partner_conversation.provider({'conversation_provider': 'gemini'})
        self.assertEqual((conversation, instructions, tools, limit),
                         (gemini.GeminiConversation, claude.CLAUDE_INSTRUCTIONS, CLAUDE_TOOLS, 1000))
        self.assertIs(claude.CLAUDE_INSTRUCTIONS, session.ASSISTANT_INSTRUCTIONS)

    # 11 --------------------------------------------------------------------------------------------------------
    def example(self, **changes):
        config = load_json(ROOT / 'config.example.json')
        config.update(changes)
        return config

    def test_config_keys_defaults_bounds_and_scope(self):
        config = self.example()
        self.assertEqual((config['conversation_provider'], config['gemini_conversation_model'],
                          config['gemini_conversation_thinking_level']), ('codex', 'gemini-4-argon', 'HIGH'))
        self.assertEqual(gemini.settings({})['gemini_conversation_thinking_level'], 'HIGH')
        validate_config(self.example(conversation_provider='gemini'))
        bare = {k: v for k, v in config.items() if not k.startswith('gemini_conversation_') and k != 'gemini_model'}
        validate_config(dict(bare, conversation_provider='gemini'))  # receipt gemini_model not required
        bad = {'gemini_conversation_model': ['gemini-3.5-flash', None], 'gemini_conversation_thinking_level': ['low', 'XHIGH', 'NONE', '', None, 1],
               'gemini_conversation_request_timeout_seconds': [29, 601, 300.0],
               'gemini_conversation_max_tool_rounds': [3, 41], 'gemini_conversation_history_token_limit': [49999, 400001],
               'gemini_conversation_seed_history_chars': [-1, 200001, '1'], 'gemini_project': ['', 'Project'],
               'gemini_location': ['us east', '']}
        for key, values in bad.items():
            for value in values:
                with self.subTest(key=key, value=value), self.assertRaises(ConfigurationError):
                    validate_config(self.example(conversation_provider='gemini', **{key: value}))
        for key, value in (('gemini_conversation_thinking_level', 'LOW'), ('gemini_conversation_thinking_level', 'MEDIUM'),
                           ('gemini_conversation_thinking_level', 'HIGH'), ('gemini_conversation_thinking_level', 'MAX'),
                           ('gemini_conversation_seed_history_chars', 0), ('gemini_conversation_max_tool_rounds', 40)):
            validate_config(self.example(conversation_provider='gemini', **{key: value}))
        with self.assertRaisesRegex(ConfigurationError, 'must not exceed conversation_timeout_seconds'):
            validate_config(self.example(conversation_provider='gemini', conversation_timeout_seconds=120))
        validate_config(self.example(conversation_timeout_seconds=120, gemini_conversation_max_tool_rounds=99))  # codex
        with self.assertRaisesRegex(ConfigurationError, 'conversation_provider'):
            validate_config(self.example(conversation_provider='openai'))

    def test_catalogue_and_controls(self):
        catalogue = load_json(ROOT / 'service-catalogue.json')
        # Step 1 (deploy pin, R075 precedent): the validator knows the name; the key returns with revision 31.
        self.assertEqual(catalogue['revision'], 29)
        self.assertNotIn('gemini_partner_conversation', catalogue['services'])
        catalogue['services']['gemini_partner_conversation'] = {'enabled': True, 'implemented': True}
        validate_catalogue(catalogue)
        catalogue['services']['gemini_partner_conversation']['implemented'] = False
        with self.assertRaises(ConfigurationError):
            validate_catalogue(catalogue)
        base = {'partner_authentication', 'operational_data_read', 'database_connectivity', 'signed_webhook_ingress',
                'instagram_delivery'}
        def check(config, enabled):
            services = {'services': {name: {'enabled': True, 'implemented': True} for name in enabled}}
            with patch.object(partner_conversation, 'load_controls', return_value=(config, services)):
                return partner_conversation.controls('config', 'catalogue')
        config = {'partner_conversations_enabled': True, 'conversation_provider': 'gemini'}
        for wrong in ('persistent_codex_conversation', 'claude_partner_conversation'):
            with self.assertRaisesRegex(ConfigurationError, 'CONVERSATION_SERVICE_DISABLED'):
                check(config, base | {wrong})
        self.assertIs(check(config, base | {'gemini_partner_conversation'}), config)
        sql = dict(config, conversation_sql_read_enabled=True)
        with self.assertRaisesRegex(ConfigurationError, 'CONVERSATION_SERVICE_DISABLED'):
            check(sql, base | {'gemini_partner_conversation'})
        self.assertIs(check(sql, base | {'gemini_partner_conversation', 'conversation_sql_read'}), sql)

    def test_audit_plan(self):
        conversation = gemini.GeminiConversation(dict(self.config, gemini_conversation_thinking_level='LOW'),
                                                 self.binding, self.store, CLAUDE_TOOLS, lambda *_: None)
        self.assertEqual(gemini.plan(conversation, '', ''), {'provider': 'gemini', 'model': 'gemini-4-argon',
                                                             'thinking_level': 'LOW', 'max_rounds': 24})


if __name__ == '__main__':
    unittest.main()
