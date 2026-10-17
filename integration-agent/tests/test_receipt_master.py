"""Receipt masters are one fixed SELECT (AGT-TEST-03); rows pass through untouched.

Inside a job the read is a summarised reference read (V6): no READ operation of its own."""
import re
import unittest
from unittest.mock import patch

from mw_integration_agent import audit
from mw_integration_agent.receipt_master import masters


class ReceiptMasterTests(unittest.TestCase):
    def test_single_select_over_the_three_masters_filtered_to_current_reviewers(self):
        sentinel = {'borrowers': [], 'accounts': [], 'reviewer_ids': ['p'], 'partners': []}
        with patch('mw_integration_agent.receipt_master.read_query', return_value=sentinel) as query:
            self.assertIs(masters({'database_enabled': True}), sentinel)
        config, sql = query.call_args.args
        self.assertEqual(config, {'database_enabled': True})
        statements = [s for s in sql.split(';') if s.strip()]
        self.assertEqual(len(statements), 1)
        self.assertTrue(statements[0].lstrip().upper().startswith('SELECT'))
        self.assertIsNone(re.search(r'\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT)\b', sql, re.I))
        for table in ('public."Borrowers"', 'public."Cash Accounts"', 'public."Partners"'):
            self.assertIn(table, sql)
        self.assertIn('"AI Reviewer" IS TRUE', sql)
        self.assertNotIn('Login Email', sql)  # partner logins stay out of the receipt master

    def test_inside_a_job_the_read_is_summarised_not_audited(self):
        """The audited wrapper (READ operation + events) is bypassed; the job collects digest and row counts."""
        rows = {'borrowers': [{'id': 'b'}], 'accounts': [], 'reviewer_ids': ['p'], 'partners': [{'id': 'p'}, {'id': 'q'}]}
        inner = unittest.mock.Mock(return_value=rows)
        wrapper = unittest.mock.Mock(side_effect=AssertionError('audited READ written inside a job'))
        wrapper.__wrapped__ = inner
        run = {'op': 'job', 'reads': []}
        token = audit.JOB.set(run)
        try:
            with patch('mw_integration_agent.receipt_master.read_query', wrapper):
                self.assertIs(masters({'database_enabled': True}), rows)
                inner.side_effect = RuntimeError('database unavailable')
                with self.assertRaises(RuntimeError):
                    masters({'database_enabled': True})
        finally:
            audit.JOB.reset(token)
        self.assertEqual(inner.call_args.args[0], {'database_enabled': True})
        wrapper.assert_not_called()
        first, second = run['reads']
        self.assertEqual((first['name'], first['result_sha256'], first['result_count'], first['rows']),
                         ('receipt_masters', audit.digest(rows), 4, {'borrowers': 1, 'accounts': 0, 'reviewer_ids': 1, 'partners': 2}))
        self.assertEqual((second['name'], second['exception_type'], 'result_sha256' in second), ('receipt_masters', 'RuntimeError', False))
        # Children begun after each read reference the prefix they saw.
        self.assertEqual(audit.reads_reference(run['reads'][:1]), {'reference_reads': 1, 'reference_reads_sha256': audit.digest([first])})
        self.assertEqual(audit.reads_reference([]), {})

    def test_outside_a_job_the_audited_read_runs_as_before(self):
        wrapper = unittest.mock.Mock(return_value={'borrowers': []})
        wrapper.__wrapped__ = unittest.mock.Mock(side_effect=AssertionError('audit bypassed outside a job'))
        with patch('mw_integration_agent.receipt_master.read_query', wrapper):
            self.assertEqual(masters({'database_enabled': True}), {'borrowers': []})
        wrapper.assert_called_once()


if __name__ == '__main__':
    unittest.main()
