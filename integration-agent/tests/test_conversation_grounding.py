"""R088 numeric grounding: tokenizer, rules, limits, the finish gate in the bridge and the 21 Oct 2026 corpus."""
import contextlib
import io
import json
import random
import re
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import audit
from mw_integration_agent import conversation_grounding as grounding
from mw_integration_agent import conversation_session as session
from mw_integration_agent import gemini_conversation as gemini
from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.conversation_grounding import GroundingExceeded, candidates, check
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.conversation_tools import ASSISTANT_TOOLS, ConversationTools

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / 'tests/fixtures/grounding-corpus'


def rows(*items):
    return {'columns': list(items[0]) if items else [], 'rows': list(items), 'row_count': len(items), 'complete': True}


class FakeOpener:
    def __init__(self, *outcomes):
        self.outcomes, self.requests = list(outcomes), []

    def open(self, request, timeout):
        self.requests.append(json.loads(request.data))
        return Response(self.outcomes.pop(0))


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def obs(*values):
    return {f'observation-{i}': v for i, v in enumerate(values, 1)}


# Synthetic borrowers and amounts throughout (no borrower data in Git).
LOANS = obs(rows({'borrower_id': 'B-A', 'loan_id': 'L1', 'outstanding_principal': '21000.00', 'daily_interest': '2100.00', 'due_now': '23450.00'},
                 {'borrower_id': 'B-A', 'loan_id': 'L2', 'outstanding_principal': '7000.00', 'daily_interest': '700.00', 'due_now': '7700.00'},
                 {'borrower_id': 'B-B', 'loan_id': 'L3', 'outstanding_principal': '35000.00', 'daily_interest': '3500.00', 'due_now': '35000.00'}))


class TokenizerTests(unittest.TestCase):
    def found(self, text):
        return [(shown, str(value), cls) for shown, value, cls, *_ in candidates(text)]

    def test_classes(self):
        table = [
            ('Due now: ฿17,600', [('฿17,600', '17600', 'money')]),
            ('Default loss: -฿1,500', [('-฿1,500', '1500', 'money')]),
            ('Fee ฿12.50 only', [('฿12.50', '12.50', 'money')]),
            ('ยอด 12,345 บาท', [('12,345 บาท', '12345', 'money')]),
            ('paid 2,000 baht', [('2,000 baht', '2000', 'money')]),
            ('฿300/day and ฿350 /day', [('฿300/day', '300', 'rate'), ('฿350 /day', '350', 'rate')]),
            ('ดอกเบี้ย 300 บาท/วัน และ ฿200 ต่อวัน', [('300 บาท/วัน', '300', 'rate'), ('฿200 ต่อวัน', '200', 'rate')]),
            ('598.3% of principal lent', [('598.3%', '598.3', 'percent')]),
            ('คิดเป็นร้อยละ 16.2', [('ร้อยละ 16.2', '16.2', 'percent')]),
            ('ยอด ฿๑๒,๖๐๐', [('฿12,600', '12600', 'money')]),  # Thai digits normalised
        ]
        for text, expected in table:
            with self.subTest(text=text):
                self.assertEqual(self.found(text), expected)

    def test_formula_line_carries_its_day_count_and_rate(self):
        (_, _, rate_cls, _, formula, days, rates, _), (shown, value, cls, _, formula2, *_) = candidates('฿300/day × 2 days = ฿600')
        self.assertEqual((rate_cls, formula, days, rates), ('rate', True, [2], [Decimal(300)]))
        self.assertEqual((shown, value, cls, formula2), ('฿600', Decimal(600), 'money', True))

    def test_exemptions_are_removed_first(self):
        for text in ('As of 21-Oct-2026 22:44 Bangkok, live data', 'ข้อมูล ณ 21-ต.ค.-2569 14:05 น.', '2026-10-21T22:44:00+07:00',
                     'due 21/10 and 21/10/2026', 'Oct 21, 2026', 'in 2026 and 2569', '1. first\n2) second',
                     'loan 12345678', '700 characters, 12 lines', '75 charges on 8 loans', '16-Sep to 04-Oct-2026'):
            with self.subTest(text=text):
                self.assertEqual(self.found(text), [])
        self.assertEqual(self.found('due today 21-Oct-2026 ฿2,950 at 14:05'), [('฿2,950', '2950', 'money')])
        self.assertEqual(self.found('฿2,026 in 2026'), [('฿2,026', '2026', 'money')])  # a year is exempt only bare


class RuleTests(unittest.TestCase):
    def verdict(self, message, observations=LOANS, instruction=''):
        return check(message, observations, instruction)

    def test_rule_1_observed_value(self):
        self.assertTrue(self.verdict('Payoff ฿23,450').ok)
        self.assertEqual(self.verdict('Payoff ฿23,451').ungrounded, ['฿23,451'])

    def test_rule_2_sum_and_difference_of_observed_amounts(self):
        self.assertEqual(self.verdict('Payoff ฿44,450').rules, {'sum': 1})       # 21,000 + 23,450
        self.assertEqual(self.verdict('Gap ฿15,750').rules, {'sum': 1})          # 23,450 - 7,700
        self.assertFalse(self.verdict('Payoff ฿44,451').ok)

    def test_rule_3_column_prefix_suffix_and_group_totals(self):
        self.assertEqual(self.verdict('Total due ฿66,150').rules, {'total': 1})         # column total
        self.assertEqual(self.verdict('Borrower A due ฿31,150').rules, {'total': 1})    # grouped by borrower_id
        self.assertEqual(self.verdict('Outstanding ฿63,000').rules, {'total': 1})
        payoffs = obs(*[{'loan_id': k, 'eligible': True, 'calculation': {'amount': a}} for k, a in (('L1', '44450'), ('L2', '14700'))])
        self.assertEqual(self.verdict('Both ฿59,150', payoffs).rules, {'total': 1})     # sum of loan_payoff amounts
        totals = obs({'totals': {'B-A': '31150', 'B-B': '35000'}, 'source': 'observation-1', 'complete': True})
        self.assertEqual(self.verdict('All ฿66,150', totals).rules, {'total': 1})       # sum of a sum_field totals
        self.assertFalse(self.verdict('Total due ฿66,151').ok)

    def test_rule_4_subset_sums_of_a_short_column(self):
        charges = obs(rows(*[{'Ref Loans': 'L1', 'Amount Remaining': str(v)} for v in (200, 350, 425, 610)]))
        self.assertEqual(self.verdict('Two of them ฿625', charges).rules, {'subset': 1})  # 200 + 425
        self.assertFalse(self.verdict('Two of them ฿626', charges).ok)

    def test_rule_5_products_only_in_formula_lines(self):
        daily = obs(rows({'loan_id': 'L9', 'daily_interest': '450.00'}))
        self.assertEqual(self.verdict('Gap: ฿450/day × 3 days = ฿1,350', daily).rules, {'observed': 1, 'product': 1})
        self.assertEqual(self.verdict('Gap: ฿450 × 4 = ฿1,800', daily).rules, {'observed': 1, 'product': 1})
        self.assertFalse(self.verdict('Gap: ฿450/day × 3 days = ฿1,400', daily).ok)
        self.assertFalse(self.verdict('Gap: ฿450/day × 3 days = ฿4,500', daily).ok)   # n must be written in the line
        self.assertFalse(self.verdict('Interest so far ฿1,350', daily).ok)            # not a formula line
        self.assertEqual(self.verdict('Gap: ฿451/day × 1 day = ฿451', daily).ungrounded, ['฿451/day', '฿451'])

    def test_rule_6_observed_amount_plus_a_derived_total(self):
        self.assertEqual(self.verdict('Owed ฿87,150').rules, {'chain': 1})            # 21,000 + 66,150 (column total)
        self.assertFalse(self.verdict('Owed ฿87,151').ok)

    def test_counts_never_add_to_an_amount(self):
        counted = obs(rows({'loan_id': 'L1', 'amount': '6000.00', 'charges': 40}, {'loan_id': 'L2', 'amount': '1000.00', 'charges': 2}))
        self.assertEqual(self.verdict('Paid ฿6,040', counted).ungrounded, ['฿6,040'])

    def test_percent_via_ratio_and_via_an_observed_column(self):
        roi = obs(rows({'Row ID': 'B1', 'Total Interest Earned': '12600.00', 'Total Amount Loaned': '1900.00', 'return_ratio': '0.162'},
                       {'Row ID': 'B2', 'Total Interest Earned': '48300.00', 'Total Amount Loaned': '21000.00', 'return_ratio': '0.5'}))
        self.assertEqual(self.verdict('663.2% of principal lent', roi).rules, {'ratio': 1})   # 12,600 / 1,900
        self.assertEqual(self.verdict('230.0% of principal lent', roi).rules, {'ratio': 1})   # 48,300 / 21,000
        self.assertEqual(self.verdict('16.2% return', roi).rules, {'observed': 1})            # ratio column × 100
        self.assertEqual(self.verdict('663.3% of principal lent', roi).ungrounded, ['663.3%'])

    def test_whole_baht_rounding_and_negatives(self):
        decimals = obs(rows({'loan_id': 'L1', 'interest': '2318.40'}, {'loan_id': 'L2', 'interest': '-2700.00'}))
        self.assertTrue(self.verdict('Interest ฿2,318', decimals).ok)
        self.assertTrue(self.verdict('Interest ฿2,318.40', decimals).ok)
        self.assertFalse(self.verdict('Interest ฿2,318.41', decimals).ok)
        self.assertTrue(self.verdict('Default loss: -฿2,700', decimals).ok)
        self.assertTrue(self.verdict('Nothing due today: ฿0', decimals).ok)

    def test_request_numbers_ground(self):
        self.assertEqual(self.verdict('After ฿25,000 paid', instruction='If Borrower A pays 25000 today, how much is left?').rules,
                         {'observed': 1})
        self.assertEqual(self.verdict('After ฿25,000 paid').ungrounded, ['฿25,000'])
        self.assertEqual(self.verdict('After ฿70,000 paid').rules, {'sum': 1})  # 35,000 + 35,000 is a sum of observed amounts

    def test_seeded_transcript_amounts_never_ground(self):
        # Only this turn's observations and the partner's message are inputs. A figure observed in an earlier turn,
        # seeded into the prompt as "Earlier conversation", is not: the model must read it again.
        self.assertTrue(check('Payoff ฿61,370', obs(rows({'loan_id': 'L4', 'payoff': '61370.00'})), '').ok)  # earlier turn
        self.assertEqual(check('Payoff ฿61,370', LOANS, 'and the 20-Sep loan?').ungrounded, ['฿61,370'])    # this turn

    def test_performance_on_a_500_row_observation(self):
        generator = random.Random(7)
        big = obs(rows(*[{'Row ID': f'C-{i}', 'Ref Loans': f'L-{i % 40}', 'Charge Date': f'2026-10-{i % 28 + 1:02d}',
                          **{c: f'{generator.randint(0, 3900)}.00' for c in ('Principal Due', 'Interest Due', 'Principal Paid',
                                                                           'Interest Paid', 'Amount Remaining', 'Interest Remaining')},
                          'Payment Count': generator.randint(0, 3), 'Payment Status': 'ชำระแล้ว', 'Notes': 'cycle 3 days'}
                        for i in range(500)]))
        message = ('Due now: ฿17,600\n• Overdue (19-Oct-2026): ฿1,000\n• ฿300/day × 2 days = ฿600\n• 16.2% of principal lent\n'
                   'As of 21-Oct-2026 22:44 Bangkok, live data')
        best = min(check(message, big, '').elapsed_ms for _ in range(5))
        self.assertLess(best, 50)

    def test_truncation_is_flagged(self):
        with patch.object(grounding, 'G_CAP', 50):
            result = check('฿1', obs(rows(*[{'loan_id': f'L{i}', 'amount': f'{1000 + i}.00'} for i in range(100)])), '')
        self.assertTrue(result.truncated)
        self.assertLess(result.grounding_values, 200)

    def test_rejection_text(self):
        result = check('Interest ฿52,300 (incl. ฿4,180 first-day charges)', obs(rows({'x_id': '1', 'interest': '52300.00'})), '')
        self.assertEqual(grounding.rejection(result, 2),
                         "UNGROUNDED_AMOUNTS: ฿4,180 are not in this turn's observations. Remove them, or re-check the data "
                         'with a tool and quote the observed figure. Attempt 2 of 3.')


class BypassTests(unittest.TestCase):
    """Chase's bypasses: each written amount is a candidate, rejected when ungrounded, accepted when observed."""
    FORMATS = [('9,999฿', 9999), ('THB 9,999', 9999), ('THB9,999', 9999), ('9,999 THB', 9999), ('9,999 บ.', 9999),
               ('9.9K baht', 9900), ('฿9k', 9000), ('1.2 ล้านบาท', 1200000), ('9 999 baht', 9999), ('฿1.5M', 1500000),
               ('3 หมื่นบาท', 30000), ('2 แสนบาท', 200000), ('5 พันบาท', 5000)]

    def test_a_month_word_after_an_amount_does_not_hide_it(self):  # B1
        for text, value in (('฿20 Oct fee', '฿20'), ('฿40 Dec charge', '฿40'), ('฿25 Mar', '฿25'), ('฿5 March', '฿5')):
            with self.subTest(text=text):
                self.assertEqual(check(text, LOANS, '').ungrounded, [value])

    def test_an_amount_is_never_a_year_or_an_id(self):  # B2
        for text in ('฿ 2569', '2569 บาท', '2026 baht', '฿12345678', '12345678 บาท'):
            with self.subTest(text=text):
                result = check(text, LOANS, '')
                self.assertEqual((result.candidates, result.ok), (1, False))

    def test_an_as_of_line_keeps_its_amounts(self):  # B3
        for text in ('As of today Borrower A owes ฿99,999', 'Snapshot 14:05: ฿99,999 due', 'ณ วันนี้ ค้าง ฿99,999',
                     'ข้อมูล ณ 21-ต.ค.-2569 14:05 น. ยอด ฿99,999'):
            with self.subTest(text=text):
                self.assertEqual(check(text, LOANS, '').ungrounded, ['฿99,999'])
        self.assertEqual(check('As of 21-Oct-2026 22:44 Bangkok, live data', LOANS, '').candidates, 0)

    def test_every_written_format_is_a_candidate(self):  # B4
        for text, value in self.FORMATS:
            with self.subTest(text=text):
                self.assertEqual(check(f'Owed {text}', LOANS, '').ungrounded, [text])
                self.assertTrue(check(f'Owed {text}', obs(rows({'loan_id': 'L9', 'owed': f'{value}.00'})), '').ok)
        self.assertEqual([str(v) for _, v, *_ in candidates('9 999 baht')], ['9999'])  # not 999

    def test_dates_next_to_amounts_are_still_exempt(self):
        found = [(shown, str(value)) for shown, value, *_ in candidates('due 21-Oct-2026 ฿2,950 at 14:05; 9,999฿ 21-Oct-2026')]
        self.assertEqual(found, [('฿2,950', '2950'), ('9,999฿', '9999')])


class BridgeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = ConversationStore(Path(temp.name) / 'partner-conversations.db')
        self.addCleanup(self.store.close)
        self.config = {'conversation_grounding': 'enforce'}
        self.events = []

    def bridge(self, instruction='How much has Borrower C paid so far?'):
        bridge = ConversationTools(lambda: dict(self.config), self.store, 'm1', instruction, tools=ASSISTANT_TOOLS, finish_limit=1000)
        self.observation = bridge.observe(rows({'borrower_id': 'B-C', 'interest_received': '52300.00', 'principal_received': '7450.00'}))
        return bridge

    def finish(self, bridge, message):
        args = {'status': 'VERIFIED', 'message': message, 'observations': [self.observation['observation']]}
        with patch('mw_integration_agent.state.enabled', return_value=True), \
                patch('mw_integration_agent.state.transaction', return_value=contextlib.nullcontext(None)), \
                patch('mw_integration_agent.audit.event', side_effect=lambda conn, op, kind, payload, *a, **k: self.events.append((kind, payload))):
            token = audit.PARENT.set('finish-operation')
            try:
                return bridge.dispatch('finish', args)
            finally:
                audit.PARENT.reset(token)

    def test_rejected_naming_the_amounts_then_accepted_after_removal(self):
        bridge = self.bridge()
        with self.assertRaises(ConfigurationError) as caught:
            self.finish(bridge, 'Paid so far: ฿59,750\n• Interest: ฿52,300 (incl. ฿4,180 first-day charges)\n• Principal: ฿7,450')
        self.assertTrue(str(caught.exception).startswith('UNGROUNDED_AMOUNTS: ฿4,180 are not'))
        self.assertIn('Attempt 1 of 3.', str(caught.exception))
        self.assertIsNone(bridge.result)
        self.assertEqual(self.finish(bridge, 'Paid so far: ฿59,750\n• Interest: ฿52,300\n• Principal: ฿7,450'), {'accepted': True})
        (kind, rejected), (kind2, passed) = self.events
        self.assertEqual(kind, 'ungrounded_amounts')
        self.assertEqual({k: rejected[k] for k in ('attempt', 'amounts', 'classes', 'observation_count', 'mode')},
                         {'attempt': 1, 'amounts': ['฿4,180'], 'classes': ['money'], 'observation_count': 1, 'mode': 'enforce'})
        self.assertIn('grounding_values', rejected)
        self.assertIn('elapsed_ms', rejected)
        self.assertEqual(kind2, 'grounding_passed')
        self.assertEqual(passed['candidates'], 3)

    def test_third_rejection_fails_the_turn_and_blocks_later_finishes(self):
        bridge = self.bridge()
        for attempt in (1, 2):
            with self.assertRaisesRegex(ConfigurationError, f'Attempt {attempt} of 3'):
                self.finish(bridge, 'Interest ฿4,180')
        with self.assertRaises(GroundingExceeded) as caught:
            self.finish(bridge, 'Interest ฿4,181')
        self.assertEqual(str(caught.exception),
                         "FINISH_UNGROUNDED_EXCEEDED: ฿4,181 are not in this turn's observations. That was the final attempt "
                         '(3 of 3); this turn ends without your reply. Do not call finish again.')
        with self.assertRaises(GroundingExceeded):
            self.finish(bridge, 'Interest ฿52,300')  # grounded, but the turn already failed
        self.assertIsNone(bridge.result)
        self.assertEqual([e[1]['attempt'] for e in self.events], [1, 2, 3])

    def test_audit_mode_logs_and_passes_off_mode_skips(self):
        self.config['conversation_grounding'] = 'audit'
        self.assertEqual(self.finish(self.bridge(), 'Interest ฿4,180'), {'accepted': True})
        self.assertEqual([(k, p['mode'], p['amounts']) for k, p in self.events], [('ungrounded_amounts', 'audit', ['฿4,180'])])
        self.events.clear()
        self.config['conversation_grounding'] = 'off'
        self.assertEqual(self.finish(self.bridge(), 'Interest ฿4,180'), {'accepted': True})
        self.assertEqual(self.events, [])

    def test_clarify_and_refuse_are_not_checked(self):
        bridge = self.bridge()
        for status in ('CLARIFY', 'REFUSE'):
            with self.subTest(status=status):
                bridge.result = None
                args = {'status': status, 'message': 'Did you mean the ฿4,180 charge from last week?', 'observations': []}
                with patch('mw_integration_agent.state.enabled', return_value=True), \
                        patch('mw_integration_agent.state.transaction', return_value=contextlib.nullcontext(None)), \
                        patch('mw_integration_agent.audit.event',
                              side_effect=lambda conn, op, kind, payload, *a, **k: self.events.append((kind, payload))):
                    token = audit.PARENT.set('finish-operation')
                    try:
                        self.assertEqual(bridge.dispatch('finish', args), {'accepted': True})
                    finally:
                        audit.PARENT.reset(token)
        self.assertEqual(self.events, [('grounding_passed', {'mode': 'enforce', 'skipped': 'status', 'status': 'CLARIFY'}),
                                       ('grounding_passed', {'mode': 'enforce', 'skipped': 'status', 'status': 'REFUSE'})])
        self.assertEqual(bridge.grounding_rejections, 0)

    def test_partner_request_grounds_its_own_amount(self):
        bridge = self.bridge('If Borrower A pays 10000 today, how much balance is left?')
        self.assertEqual(self.finish(bridge, 'After ฿10,000: interest ฿52,300 is unchanged'), {'accepted': True})

    def test_session_fails_the_turn_on_the_third_rejection(self):
        from mw_integration_agent.partner_conversation import execute
        partner = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English', 'email': 'test@example.com',
                   'enabled': True}
        config = {'conversation_sql_read_enabled': True, 'database_enabled': True, 'state_directory': '/nonexistent',
                  'instagram_account_id': '100', 'partner_conversations_enabled': True, 'conversation_timeout_seconds': 600,
                  'conversation_provider': 'claude', 'claude_project': 'clever-oasis-508610-n7', 'conversation_grounding': 'enforce'}
        ungrounded = {'status': 'VERIFIED', 'message': 'Interest ฿4,180', 'observations': []}
        opener = FakeOpener(*[json.dumps({'type': 'message', 'role': 'assistant', 'stop_reason': 'tool_use',
                                          'content': [{'type': 'tool_use', 'id': f'f{i}', 'name': 'finish', 'input': ungrounded}],
                                          'usage': {'input_tokens': 100, 'output_tokens': 5}}).encode() for i in range(3)])
        event = {'message_id': 'event1', 'sender_id': '999', 'text': 'How much?', 'attachments': '[]'}
        with patch.object(session.http, 'opener', return_value=opener), patch.object(session.http, 'access_token', return_value='t'), \
                patch.object(session.time, 'sleep'):
            execute(event, partner, self.store, lambda: dict(config), None, lambda *_: partner)
        status, detail, result = self.store.db.execute('SELECT status,detail,result FROM turns WHERE message_id=?', ('event1',)).fetchone()
        self.assertEqual((status, detail), ('FAILED', 'FINISH_UNGROUNDED_EXCEEDED'))
        self.assertIn('could not complete this request', json.loads(result)['message'])
        self.assertEqual(len(opener.requests), 3)


class CorpusTests(unittest.TestCase):
    """The 12 replies of the 21 Oct 2026 argon/flash comparison against synthetic source rows."""

    def documents(self):
        return [json.loads(p.read_text(encoding='utf-8')) for p in sorted(CORPUS.glob('*.json'))]

    def test_verdicts(self):
        verdicts = {}
        for doc in self.documents():
            for model, reply in doc['replies'].items():
                result = check(reply['text'], doc['observations'], doc['request'])
                verdicts[(doc['question'], model)] = (result.ok, result.ungrounded)
                self.assertEqual((result.ok, result.ungrounded), (reply['expected']['ok'], reply['expected']['ungrounded']),
                                 (doc['question'], model))
        self.assertEqual(len(verdicts), 12)
        self.assertEqual([k for k, (ok, _) in verdicts.items() if not ok], [('Q2', 'argon')])
        self.assertEqual(verdicts[('Q2', 'argon')][1], ['฿35,210'])  # the invented first-day amount (× 7 like the rest)

    def mutations(self):
        """(question, model, label, original, new value, grounding rule or None) for each money amount × (+1, ×10)."""
        for doc in self.documents():
            table = grounding.Grounding(doc['observations'], doc['request'])
            for model, reply in doc['replies'].items():
                text = reply['text']
                for m in grounding.MONEY.finditer(text):
                    value = Decimal(m.group('num').replace(',', ''))
                    if value == 0 or m.group(0).strip() in reply['expected']['ungrounded']:
                        continue
                    for label, new in (('+1', value + 1), ('x10', value * 10)):
                        mutated = text[:m.start('num')] + f'{new:,.0f}' + text[m.end('num'):]
                        result = check(mutated, doc['observations'], doc['request'])
                        line = mutated[:m.start('num')].count('\n')
                        found = next(c for c in candidates(mutated) if c[3] == line and c[1] == new)
                        rule = table.money(new, found[4], found[5], found[6], found[2], found[7])
                        self.assertEqual(result.ok and not reply['expected']['ungrounded'], rule is not None and result.ok)
                        yield doc['question'], model, label, m.group(0).strip(), new, rule

    def test_mutated_amounts_are_rejected_unless_they_land_on_an_observed_or_summed_figure(self):
        accepted = {'+1': [], 'x10': []}
        total = {'+1': 0, 'x10': 0}
        for question, model, label, original, new, rule in self.mutations():
            total[label] += 1
            if rule:
                accepted[label].append((question, model, original, str(new), rule))
        self.assertEqual(total, {'+1': 256, 'x10': 256})
        # +1: none. (Before anonymisation, near-equal recorded charges one baht apart made 13 neighbours
        # observable or summable; the per-question scaling of the fixtures moved them apart.)
        self.assertEqual(accepted['+1'], [])
        # x10 of a round amount often IS another observed figure or an exact total; it is never a product or a ratio.
        self.assertLessEqual(len(accepted['x10']), 103)
        self.assertTrue(all(rule in ('observed', 'total', 'subset', 'sum', 'chain') for *_, rule in accepted['x10']))

    def test_changed_dates_and_times_do_not_change_a_verdict(self):
        for doc in self.documents():
            for model, reply in doc['replies'].items():
                text = re.sub(r'(\d{2})-(Oct|Sep|Aug)-2026', lambda m: f'{int(m.group(1)) % 28 + 1:02d}-{m.group(2)}-2026', reply['text'])
                text = re.sub(r'(\d{2}):(\d{2})', lambda m: f'{m.group(1)}:{(int(m.group(2)) + 7) % 60:02d}', text)
                self.assertNotEqual(text, reply['text'])
                self.assertEqual(check(text, doc['observations'], doc['request']).ok, reply['expected']['ok'], (doc['question'], model))

    def test_corpus_checks_are_fast(self):
        for doc in self.documents():
            for reply in doc['replies'].values():
                self.assertLess(min(check(reply['text'], doc['observations'], doc['request']).elapsed_ms for _ in range(3)), 50)


class ConfigAndGuidanceTests(unittest.TestCase):
    def test_grounding_mode_is_validated_and_defaults_to_enforce(self):
        config = load_json(ROOT / 'config.example.json')
        self.assertEqual(config['conversation_grounding'], 'enforce')
        self.assertEqual(config['gemini_conversation_model'], 'gemini-4-argon')
        for mode in grounding.MODES:
            validate_config(dict(config, conversation_grounding=mode))
        with self.assertRaisesRegex(ConfigurationError, 'conversation_grounding must be enforce, audit or off'):
            validate_config(dict(config, conversation_grounding='strict'))

    def test_gemini_flash_is_allow_listed(self):
        self.assertIn('gemini-3.8-flash', gemini.MODELS)
        base = {'gemini_project': 'clever-oasis-508610-n7'}
        gemini.validate(dict(base, gemini_conversation_model='gemini-3.8-flash'))
        with self.assertRaises(ConfigurationError):
            gemini.validate(dict(base, gemini_conversation_model='gemini-3.8-flash-lite'))

    def test_guidance_lines(self):
        text = ' '.join(session.ASSISTANT_INSTRUCTIONS.split())
        for line in ('aim for about 600 characters and at most 12 lines',
                     'Offer more only when you had to cut the answer: one line, send "<words>" as a new message (not a reply). '
                     'Otherwise no menu or offer lines.',
                     'Never add received, charged and scheduled or forecast amounts together. Label a future charge by its "Basis": '
                     'Recorded = "scheduled"/"กำหนดแล้ว", Projected = "forecast"/"ประมาณการ"; never call a recorded charge a forecast.',
                     '• Scheduled/forecast charges: one line per future charge from the upcoming view and "Charges" dated after today',
                     'List every one; when there are more than 5, list the first 5 and add one line with the count and total of the rest.',
                     '(mention a first-day charge deducted at disbursement only when a charge dated on the loan date exists in the '
                     'observations; never assume one)',
                     'Every amount you state must come from this turn\'s tool results or be a sum, difference or rate × days of them; '
                     'the host rejects a finish with any other amount. Never estimate, recall or reuse a figure from memory or from '
                     'the earlier transcript.',
                     'Use only column names that appear in the schema digest, spelled exactly; check the digest entry before writing '
                     'a query and never guess a column. A column error costs a round.'):
            with self.subTest(line=line[:40]):
                self.assertIn(line, text)
        for gone in ('next 1-2 charges', 'aim for about 700', 'To offer more, write', 'label forecasts "forecast"'):
            self.assertNotIn(gone, text)
        rules = ' '.join((ROOT / 'src/mw_integration_agent/assets/conversation-business-rules.md').read_text(encoding='utf-8').split())
        self.assertIn('never call a recorded charge a forecast', rules)
        self.assertIn('never assume one', rules)


if __name__ == '__main__':
    unittest.main()
