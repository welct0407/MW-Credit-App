"""Owner-requested reconsideration (AGT-TEST-03): eligibility, superseded reviews, no replay of writes."""
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import receipt_reconsider
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.receipt_journal import ReceiptJournal

RECEIPT = {'amount': '100.00', 'date': '2026-10-01', 'time': '12:10', 'reference': 'REF1', 'account_id': 'a', 'account_label': 'Test'}


class ReconsiderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = {'state_directory': str(self.root), 'instagram_account_id': '100'}
        controls = patch('mw_integration_agent.receipt_reconsider.controls', return_value=self.config)
        controls.start(); self.addCleanup(controls.stop)

    def journal(self):
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        ReviewStore(journal.db)
        return journal

    def job(self, journal, status, result, detail='SOMETHING', attempts=2):
        journal.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,attempts,detail,result,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                           ('job-1', 'message-1', '123', '', status, attempts, detail, json.dumps(result) if result is not None else None, time.time()))
        journal.db.commit()

    def test_review_job_with_receipt_requeues_and_supersedes_the_pending_review(self):
        journal = self.journal()
        self.job(journal, 'REVIEW', {'receipt': RECEIPT, 'borrower': {'id': 'b'}, 'extraction': {'raw': True}})
        key = ReviewStore(journal.db).reserve('job-1', {'action': 'Lump Sum'})
        journal.close()
        result = receipt_reconsider.run('config', 'catalogue', 'job-1')
        self.assertEqual(result, {'status': 'RECONSIDERATION_QUEUED', 'prior_review_superseded': True})
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        job = journal.db.execute('SELECT status,detail,attempts,retry_after,url,result FROM receipt_jobs WHERE id=?', ('job-1',)).fetchone()
        self.assertEqual(tuple(job)[:5], ('VALIDATED', 'OWNER_REQUESTED_RECONSIDERATION', 0, 0, ''))
        self.assertIn('extraction', json.loads(job['result']))  # a receipt decision keeps its extraction
        self.assertEqual(journal.db.execute('SELECT state,job_id FROM partner_reviews WHERE id=?', (key,)).fetchone()[:],
                         ('SUPERSEDED', 'job-1:superseded:' + key))
        rows = journal.db.execute('SELECT job_id,previous FROM receipt_reconsiderations').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0][0], json.loads(rows[0][1])['status'], json.loads(rows[0][1])['detail']), ('job-1', 'REVIEW', 'SOMETHING'))

    def test_posted_job_and_decided_review_are_not_reopened(self):
        journal = self.journal()
        self.job(journal, 'POSTED', {'receipt': RECEIPT})
        journal.close()
        with self.assertRaisesRegex(ConfigurationError, 'RECONSIDERATION_NOT_ELIGIBLE'):
            receipt_reconsider.run('config', 'catalogue', 'job-1')
        journal = ReceiptJournal(self.root / 'receipt-processing.db')
        journal.db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED'")
        key = ReviewStore(journal.db).reserve('job-1', {'action': 'Lump Sum'})
        journal.db.execute("UPDATE partner_reviews SET state='APPROVED' WHERE id=?", (key,)); journal.db.commit(); journal.close()
        with self.assertRaisesRegex(ConfigurationError, 'DECIDED_REVIEW_CANNOT_BE_REOPENED'):
            receipt_reconsider.run('config', 'catalogue', 'job-1')
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        self.assertEqual(journal.db.execute('SELECT status FROM receipt_jobs').fetchone()[0], 'REVIEW_REQUESTED')
        self.assertIsNone(journal.db.execute("SELECT name FROM sqlite_master WHERE name='receipt_reconsiderations'").fetchone())

    def test_missing_original_image_blocks_a_fresh_extraction(self):
        journal = self.journal()
        self.job(journal, 'REVIEW', {'extraction': {'is_payment_receipt': False}})
        journal.close()
        pages = patch('mw_integration_agent.receipt_reconsider.pages',
                      return_value=[[{'messages': {'data': [{'id': 'other', 'attachments': {'data': [{'image_data': {'url': 'https://x'}}]}}]}}]])
        with pages, self.assertRaisesRegex(ConfigurationError, 'ORIGINAL_IMAGE_UNAVAILABLE'):
            receipt_reconsider.run('config', 'catalogue', 'job-1')
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        self.assertEqual(tuple(journal.db.execute('SELECT status,attempts FROM receipt_jobs').fetchone()), ('REVIEW', 2))


if __name__ == '__main__':
    unittest.main()
