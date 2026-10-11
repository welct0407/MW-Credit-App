import json
import unittest
from unittest.mock import patch
import test_receipt_archive as fixtures
from mw_integration_agent.receipt_api import request_id
from mw_integration_agent.receipt_projection import reconcile


class PwaProjectionTests(unittest.TestCase):
    setUp = fixtures.ReceiptArchiveTests.setUp
    tearDown = fixtures.ReceiptArchiveTests.tearDown
    capture = fixtures.ReceiptArchiveTests.capture

    def test_archived_pwa_identity_preserves_original_evidence_and_retries_attachment_only(self):
        self.capture()
        payment = 'pwa:' + request_id('dev', 'synthetic-projector-review')
        proposal = {'borrower': {'id': 'synthetic-borrower'}, 'receipt': {
            'amount': '25', 'date': '2026-09-27', 'time': '18:23',
            'reference': 'synthetic-ref', 'account_id': 'synthetic-account'}}
        self.journal.db.execute('CREATE TABLE partner_reviews(id TEXT,job_id TEXT,state TEXT,payment_id TEXT,proposal TEXT)')
        with self.journal.db:
            self.journal.db.execute('INSERT INTO partner_reviews VALUES(?,?,?,?,?)',
                                   ('review', self.key, 'POSTED', payment, json.dumps(proposal)))
        before = dict(self.archive.get(self.key))
        attempts, verified = [], []

        def verify(config, key, facts):
            verified.append((key, facts))
            return key == payment and facts == proposal

        def attach(config, link, asset):
            self.assertEqual(link['payment_id'], payment)
            for key in ('object_key', 'generation', 'raw_sha256', 'mime_type', 'byte_size', 'source'):
                self.assertEqual(asset[key], before[key])
            attempts.append(link['link_id'])
            if len(attempts) == 1:
                raise TimeoutError('attachment acknowledgement lost')
            return 'already_applied'

        with patch('mw_integration_agent.receipt_api.submit') as financial:
            self.assertEqual(reconcile(self.config, self.journal, attach, verify, self.storage)['pending'], 1)
            with self.journal.db:
                self.journal.db.execute('UPDATE receipt_payment_links SET next_attempt_at=0')
            self.assertEqual(reconcile(self.config, self.journal, attach, verify, self.storage)['applied'], 1)
            self.assertEqual(reconcile(self.config, self.journal, attach, verify, self.storage)['applied'], 0)
            financial.assert_not_called()
        self.assertEqual(len(attempts), 2)
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(verified, [(payment, proposal), (payment, proposal)])
        self.assertEqual(dict(self.archive.get(self.key)), before)
        self.assertEqual(self.journal.db.execute('SELECT state FROM partner_reviews').fetchone()[0], 'POSTED')
