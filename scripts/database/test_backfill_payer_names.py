"""R095 payer name backfill: reference rules, classification, collisions, decisions and the emitted SQL (synthetic data)."""
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('payer_backfill', Path(__file__).with_name('Backfill-PayerNames.py'))
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)

A64, B64 = 'a' * 64, 'b' * 64


def receipts(*names, outcome='name'):
    return [{'name': n, 'date': f'2026-10-{20 - i:02d}', 'outcome': outcome if n else 'no_payer_name'} for i, n in enumerate(names)]


class ClassifyTests(unittest.TestCase):
    def test_seven_matching_names_are_consistent_with_line_one_the_majority_upgraded_by_a_fuller_match(self):
        names = ['MR. SOMCHAI J***'] * 3 + ['Somchai Jaidee', 'SOMCHAI JAIDEE', 'MR SOMCHAI JAIDEE', 'Somchai J***']
        result = backfill.classify(receipts(*names))
        self.assertEqual(result['status'], 'CONSISTENT')
        self.assertEqual(result['lines'], ['MR SOMCHAI JAIDEE'])
        self.assertEqual(result['candidates'][0], {'name': 'MR. SOMCHAI J***', 'count': 3, 'latestDate': '2026-10-20'})

    def test_fewer_than_seven_readable_names(self):
        result = backfill.classify(receipts('นาย สมชาย ใจดี', None, 'สมชาย ใจดี', 'ส***'))
        self.assertEqual((result['status'], result['lines']), ('FEWER', ['นาย สมชาย ใจดี']))
        self.assertEqual(result['reasons'], {'no_payer_name': 2})

    def test_a_minority_payer_becomes_line_two_in_order_of_first_appearance(self):
        result = backfill.classify(receipts('สมชาย ใจดี', 'Alice Aaa', 'สมชาย ใจดี', 'สมศักดิ์ รักดี', 'สมชาย ใจดี'))
        self.assertEqual((result['status'], result['lines']), ('CONFLICT', ['สมชาย ใจดี', 'สมศักดิ์ รักดี', 'Alice Aaa']))
        self.assertEqual({c['name']: c['count'] for c in result['candidates']}, {'สมชาย ใจดี': 3, 'Alice Aaa': 1, 'สมศักดิ์ รักดี': 1})

    def test_a_tie_takes_the_latest_name_as_line_one(self):
        result = backfill.classify(receipts('สมศักดิ์ รักดี', 'สมชาย ใจดี'))
        self.assertEqual(result['lines'], ['สมศักดิ์ รักดี', 'สมชาย ใจดี'])

    def test_a_near_name_of_line_one_is_merged(self):
        result = backfill.classify(receipts(*['นาย นภัสสร พงษ์ดี'] * 4, 'นาย นกัสสร พงษ์ดี'))
        self.assertEqual((result['status'], result['lines']), ('FEWER', ['นาย นภัสสร พงษ์ดี']))

    def test_a_given_name_alone_is_appended_as_its_own_line(self):
        result = backfill.classify(receipts(*['น.ส. วรรณพร ทองดี'] * 6, 'น.ส. วรรณพร'))
        self.assertEqual((result['status'], result['lines']), ('CONFLICT', ['น.ส. วรรณพร ทองดี', 'น.ส. วรรณพร']))

    def test_no_readable_name_is_none_with_reason_counts(self):
        rows = receipts(None, None) + [{'name': None, 'date': '2026-10-01', 'outcome': 'image_unavailable'}]
        result = backfill.classify(rows)
        self.assertEqual((result['status'], result['lines']), ('NONE', []))
        self.assertEqual(result['reasons'], {'no_payer_name': 2, 'image_unavailable': 1})

    def test_collisions_on_any_line_and_stored_lines(self):
        rows = [{'id': 'b1', 'lines': ['Alice Aaa']}, {'id': 'b2', 'lines': ['Carl Ccc', 'MS. ALICE AAA']}, {'id': 'b3', 'lines': ['Bob Bbb']},
                {'id': 'b4', 'lines': []}]
        self.assertEqual(backfill.collisions(rows, {'b9': 'Dan Ddd\nBob Bbb', 'b3': 'Bob Bbb'}), {'b1': ['b2'], 'b2': ['b1'], 'b3': ['b9']})


class ReferenceTests(unittest.TestCase):
    def test_manual_pwa_agent_and_other_environment(self):
        loc, reason = backfill.locate({'manual': 'manual-receipts/dev/pwa/' + '1' * 32 + '/' + '2' * 32 + '.png'}, 'dev')
        self.assertEqual((loc['kind'], loc['mimeType'], reason), ('pwa', 'image/png', None))
        self.assertTrue(loc['key'].startswith('appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/'))
        agent = f'//receipts/prod/2026/10/12/{A64}/{B64}.jpg'
        self.assertEqual(backfill.locate({'agent': agent}, 'dev'), (None, 'reference_other_environment'))
        self.assertEqual(backfill.locate({'agent': agent, 'agentReceiptId': 'c' * 64, 'agentReceivedAt': '2026-10-12 09:00:00'}, 'prod'),
                         (None, 'agent_projection_mismatch'))
        loc, _ = backfill.locate({'agent': agent, 'agentReceiptId': A64, 'agentReceivedAt': '2026-10-12 09:00:00'}, 'prod')
        self.assertEqual((loc['key'], loc['sha256'], loc['mimeType']), (agent[2:], B64, 'image/jpeg'))
        self.assertEqual(backfill.locate({'agent': f'//receipts/prod/2026/02/30/{A64}/{B64}.jpg', 'agentReceiptId': A64, 'agentReceivedAt': '2026-02-28 01:00:00'}, 'prod'),
                         (None, 'reference_unsupported'))
        self.assertEqual(backfill.locate({'manual': 'https://example.invalid/x.png'}, 'prod'), (None, 'reference_unsupported'))

    def test_appsheet_references_resolve_only_through_the_catalog(self):
        reference = 'manual-receipts/prod/2P8 synthetic.jpg'
        self.assertEqual(backfill.locate({'manual': reference}, 'prod'), (None, 'appsheet_reference_no_catalog'))
        key = 'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/synthetic.jpg'
        entry = {'referenceSha256': hashlib.sha256(reference.encode()).hexdigest(), 'keySha256': hashlib.sha256(key.encode()).hexdigest(),
                 'key': key, 'generation': '123', 'mimeType': 'image/jpeg', 'sizeBytes': 10, 'sha256': A64}
        raw = json.dumps({'schemaVersion': 1, 'environment': 'prod', 'bucket': backfill.BUCKET,
                          'objectRoot': 'appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/', 'entries': [entry]})
        catalog = backfill.parse_catalog(raw, 'prod')
        loc, _ = backfill.locate({'manual': reference}, 'prod', catalog)
        self.assertEqual((loc['key'], loc['generation'], loc['sha256']), (key, '123', A64))
        self.assertEqual(backfill.locate({'manual': 'manual-receipts/prod/other.jpg'}, 'prod', catalog), (None, 'appsheet_reference_not_in_catalog'))
        with self.assertRaises(ValueError):
            backfill.parse_catalog(raw, 'dev')
        with self.assertRaises(ValueError):
            backfill.parse_catalog(raw.replace(entry['keySha256'], B64), 'prod')

    def test_downloaded_object_must_be_the_referenced_one(self):
        data = b'synthetic'
        digest = hashlib.sha256(data).hexdigest()
        agent = {'kind': 'agent', 'mimeType': 'image/jpeg', 'sha256': digest}
        meta = {'contentType': 'image/jpeg', 'size': str(len(data)), 'generation': '7'}
        self.assertTrue(backfill.verify_object(agent, meta, data))
        self.assertFalse(backfill.verify_object(dict(agent, sha256=A64), meta, data))
        self.assertFalse(backfill.verify_object(agent, dict(meta, contentType='image/png'), data))
        pwa = {'kind': 'pwa', 'mimeType': 'image/jpeg', 'environment': 'dev'}
        self.assertTrue(backfill.verify_object(pwa, dict(meta, metadata={'environment': 'dev', 'sha256': digest}), data))
        self.assertFalse(backfill.verify_object(pwa, dict(meta, metadata={'environment': 'prod', 'sha256': digest}), data))
        self.assertFalse(backfill.verify_object(dict(agent, generation='8'), meta, data))


class DecisionTests(unittest.TestCase):
    def plan(self):
        return {'borrowers': [
            {'id': 'b1', 'nameTh': 'หนึ่ง', 'nameEn': 'Mali2', 'status': 'CONSISTENT', 'lines': ['Alice Aaa'], 'collisions': []},
            {'id': 'b2', 'nameTh': 'สอง', 'nameEn': 'Mali', 'status': 'FEWER', 'lines': ['Bob Bbb'], 'collisions': []},
            {'id': 'b3', 'nameTh': 'สาม', 'nameEn': 'Dara', 'status': 'CONFLICT', 'lines': ['Kate Kkk', 'Alice Aaa'], 'collisions': ['b1']},
            {'id': 'b4', 'nameTh': 'สี่', 'nameEn': 'Carl', 'status': 'CONSISTENT', 'lines': ['Carl Ccc'], 'collisions': ['b9']},
            {'id': 'b5', 'nameTh': 'ห้า', 'nameEn': 'Fon', 'status': 'NONE', 'lines': [], 'collisions': []}]}

    def base(self, **decisions):
        return {'schemaVersion': 1, 'planSha256': 'x', 'decisions': decisions}

    def test_consistent_and_fewer_apply_by_default_and_exceptions_need_a_choice(self):
        decisions = self.base(b3={'action': None, 'lines': None}, b4={'action': None, 'lines': None})
        self.assertEqual(backfill.decide(self.plan(), 'x', decisions), {'b1': ['Alice Aaa'], 'b2': ['Bob Bbb']})

    def test_decisions_override_the_plan_by_id_and_by_nickname_with_plan_line_placeholders(self):
        decisions = self.base(b1={'action': 'skip'})
        decisions['byName'] = {'dara': {'action': 'set', 'lines': [{'planLine': 1}, 'Alice Aaa']},
                               'พี่ Fon': {'action': 'set', 'lines': ['น?ัสสร พ***']}, 'Mali': {'action': 'set', 'lines': ['Bob Bbb', 'Alice Aaa']}}
        self.assertEqual(backfill.decide(self.plan(), 'x', decisions),
                         {'b2': ['Bob Bbb', 'Alice Aaa'], 'b3': ['Kate Kkk', 'Alice Aaa'], 'b5': ['น?ัสสร พ***']})

    def test_refusals(self):
        def by(nick, d):
            return dict(self.base(), byName={nick: d})
        for decisions in (dict(self.base(), planSha256='y'), self.base(zz={'action': 'skip'}),
                          self.base(b3={'action': 'set', 'lines': [' padded ']}),
                          self.base(b3={'action': 'set', 'lines': ['ส*']}),
                          self.base(b3={'action': 'set', 'lines': 'Alice Aaa'}),
                          self.base(b3={'action': 'set', 'lines': ['A Aaa', 'B Bbb', 'C Ccc', 'D Ddd', 'E Eee', 'F Fff']}),
                          self.base(b3={'action': 'set', 'lines': ['Alice Aaa', 'MS. ALICE AAA']}),
                          self.base(b5={'action': 'set', 'lines': [{'planLine': 1}, 'Alice Aaa']}),
                          self.base(b3={'action': 'set', 'lines': [{'planLine': 3}]}),
                          self.base(b3={'action': 'set', 'lines': [{'planLine': 2}, 'MS. ALICE AAA']}),
                          by('Bel', {'action': 'skip'}), by('nobody', {'action': 'skip'}),
                          dict(self.base(b2={'action': 'skip'}), byName={'Mali': {'action': 'skip'}})):
            with self.subTest(decisions=decisions), self.assertRaises(ValueError):
                backfill.decide(self.plan(), 'x', decisions)

    def test_shared_payer_lines_across_borrowers_are_allowed(self):
        decisions = self.base(b3={'action': 'set', 'lines': ['Kate Kkk', 'Alice Aaa']})
        self.assertEqual(backfill.decide(self.plan(), 'x', decisions)['b3'], ['Kate Kkk', 'Alice Aaa'])


class SqlTests(unittest.TestCase):
    def test_emitted_transaction_guards_v111_locks_and_writes_joined_lines_only_where_empty(self):
        sql = backfill.apply_sql('prod', {'b2': ["O'Brien Bbb"], 'b1': ['นาย สมชาย ใจดี', 'Alice Aaa']}, 2)
        self.assertIn("IF current_database()<>'loan_manager_prod'", sql)
        self.assertIn('<111 THEN', sql)
        self.assertIn('FOR UPDATE OF b', sql)
        self.assertIn("""AND coalesce(b."Communication Name",'') IS NOT DISTINCT FROM '';""", sql)
        self.assertIn("('b1','นาย สมชาย ใจดี\nAlice Aaa'),\n('b2','O''Brien Bbb')", sql)
        self.assertIn("IF locked<>2 THEN RAISE EXCEPTION", sql)
        self.assertIn("IF actual<>2 THEN RAISE EXCEPTION", sql)
        self.assertNotIn('actual>', sql)
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))

    def test_expected_four_with_only_three_still_empty_aborts(self):
        values = {f'b{i}': [f'Payer Name{chr(65 + i)}'] for i in range(4)}
        sql = backfill.apply_sql('dev', values, 4)
        guard = sql[sql.index('GET DIAGNOSTICS'):sql.index('COMMIT;')]
        self.assertIn("IF actual<>4 THEN RAISE EXCEPTION", guard)
        self.assertIn("IF locked<>4 THEN RAISE EXCEPTION", guard)
        # The raise sits inside the DO block before COMMIT, so a 3-row update aborts the transaction (ON_ERROR_STOP).
        self.assertLess(sql.index('\\set ON_ERROR_STOP on'), sql.index('BEGIN;'))
        self.assertLess(sql.index("IF actual<>4"), sql.index('COMMIT;'))

    def test_report_lists_exceptions_first_with_a_choice_column(self):
        rows = [{'id': 'b1', 'nameTh': 'ไทย', 'nameEn': 'One', 'status': 'FEWER', 'lines': ['Alice Aaa'], 'collisions': [],
                 'candidates': [{'name': 'Alice Aaa', 'count': 5, 'latestDate': '2026-10-20'}], 'reasons': {}},
                {'id': 'b2', 'nameTh': 'สอง', 'nameEn': 'Two', 'status': 'NONE', 'lines': [], 'collisions': [], 'candidates': [],
                 'reasons': {'appsheet_reference_no_catalog': 3}}]
        text = backfill.report({'environment': 'dev', 'database': 'loan_manager_dev', 'flywayVersion': 111, 'model': 'm', 'generatedAt': 't', 'borrowers': rows})
        self.assertLess(text.index('| b2 |'), text.index('| b1 |'))
        self.assertIn('appsheet_reference_no_catalog 3 | ____ |', text)
        self.assertIn('| FEWER | Alice Aaa ×5 (2026-10-20) | 1. Alice Aaa |', text)

    def test_private_dir_must_be_outside_the_repository(self):
        with self.assertRaises(ValueError):
            backfill.private_dir(str(backfill.REPO / 'tmp'))


if __name__ == '__main__':
    unittest.main()
