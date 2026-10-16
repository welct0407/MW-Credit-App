"""Receipt masters are one fixed SELECT (AGT-TEST-03); rows pass through untouched."""
import re
import unittest
from unittest.mock import patch

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


if __name__ == '__main__':
    unittest.main()
