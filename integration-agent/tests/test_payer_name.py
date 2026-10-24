import json
import unittest
from pathlib import Path

from mw_integration_agent.payer_name import LOOKALIKES, compare, display, hint_key, joined, learn, lines, payer_key, readable, script

# One vector file for this module and services/receipts/payer-name.mjs (parity).
CASES = json.loads((Path(__file__).resolve().parents[2] / 'tests/fixtures/payer-name-cases.json').read_text(encoding='utf-8'))


class PayerNameVectorTests(unittest.TestCase):
    def test_display_form(self):
        for case in CASES['display']:
            with self.subTest(case=case['input']):
                self.assertEqual(display(case['input']), case['expected'])

    def test_key_script_and_readability(self):
        for case in CASES['keys']:
            with self.subTest(case=case['input']):
                key = payer_key(case['input'])
                self.assertEqual(key, case['key'])
                self.assertEqual(script(key), case['script'])
                self.assertEqual(readable(case['input']), case['readable'])

    def test_compare(self):
        for case in CASES['compare']:
            with self.subTest(case=case):
                self.assertEqual(compare(case['stored'], case['slip']), case['result'])

    def test_compare_is_symmetric(self):
        for case in CASES['compare']:
            with self.subTest(case=case):
                self.assertEqual(compare(case['slip'], case['stored']), case['result'])

    def test_lookalike_table_is_the_fixture_table(self):
        self.assertEqual([list(pair) for pair in LOOKALIKES], CASES['lookalikes'])

    def test_learn(self):
        for case in CASES['learn']:
            with self.subTest(case=case):
                self.assertEqual(learn(case['lines'], case['slip']), case['after'])

    def test_hint_key(self):
        for case in CASES['hints']:
            with self.subTest(case=case['text']):
                self.assertEqual(hint_key(case['text']), case['key'])
        self.assertEqual(len({hint_key(v) for v in ('Mali', 'Mali2', 'Mali3')}), 3)

    def test_stored_lines_round_trip(self):
        self.assertEqual(lines(' นาย สมชาย ใจดี \n\n  น.ส. สมฤดี   เ\n'), ['นาย สมชาย ใจดี', 'น.ส. สมฤดี เ'])
        self.assertEqual(lines(None), [])
        self.assertEqual(joined(['a b', 'c d']), 'a b\nc d')

    def test_vectors_cover_the_design_cases(self):
        results = {case['result'] for case in CASES['compare']}
        self.assertEqual(results, {'match', 'near', 'mismatch', 'unknown'})
        self.assertTrue(any('*' in payer_key(c['stored']) and '*' in payer_key(c['slip']) for c in CASES['compare']))


if __name__ == '__main__':
    unittest.main()
