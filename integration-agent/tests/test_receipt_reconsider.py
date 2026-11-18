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

    # R119: a PREPARED job from receipt-prepare (source kind operator-selected) goes back to PENDING through the same
    # requeue; its candidate file stays as it is; a decided review is still refused.
    def prepared(self, journal, kind='operator-selected'):
        import hashlib
        from mw_integration_agent.receipt_archive import source
        key = hashlib.sha256(b'message-1:0').hexdigest()
        journal.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,source) VALUES (?,?,?,?,?,?,?)",
                           (key, 'message-1', '123', 'https://old', 'PREPARED', time.time(), source(kind, 'message-1', 0, '123', time.time(), time.time())))
        journal.db.commit()
        return key

    def history(self):
        return patch('mw_integration_agent.receipt_reconsider.pages',
                     return_value=[[{'messages': {'data': [{'id': 'message-1', 'attachments': {'data': [{'image_data': {'url': 'https://fresh'}}]}}]}}]])

    def test_prepared_operator_selected_job_returns_to_pending(self):
        journal = self.journal(); key = self.prepared(journal); journal.close()
        candidate = self.root / 'receipt-candidates'; candidate.mkdir(); (candidate / (key + '.json')).write_text('{"kept": true}')
        with self.history():
            self.assertEqual(receipt_reconsider.run('config', 'catalogue', key), {'status': 'RECONSIDERATION_QUEUED', 'prior_review_superseded': False})
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        self.assertEqual(tuple(journal.db.execute('SELECT status,detail,url,attempts FROM receipt_jobs WHERE id=?', (key,)).fetchone()),
                         ('PENDING', 'OWNER_REQUESTED_RECONSIDERATION', 'https://fresh', 0))
        self.assertEqual(json.loads(journal.db.execute('SELECT previous FROM receipt_reconsiderations').fetchone()[0])['status'], 'PREPARED')
        self.assertEqual((candidate / (key + '.json')).read_text(), '{"kept": true}')

    def test_prepared_job_of_another_source_or_with_a_decided_review_is_refused(self):
        journal = self.journal(); key = self.prepared(journal, kind='poll'); journal.close()
        with self.history(), self.assertRaisesRegex(ConfigurationError, 'RECONSIDERATION_NOT_ELIGIBLE'):
            receipt_reconsider.run('config', 'catalogue', key)
        journal = ReceiptJournal(self.root / 'receipt-processing.db')
        journal.db.execute('DELETE FROM receipt_jobs'); journal.db.commit(); key = self.prepared(journal)
        review = ReviewStore(journal.db).reserve(key, {'action': 'Lump Sum'})
        journal.db.execute("UPDATE partner_reviews SET state='APPROVED' WHERE id=?", (review,)); journal.db.commit(); journal.close()
        with self.history(), self.assertRaisesRegex(ConfigurationError, 'DECIDED_REVIEW_CANNOT_BE_REOPENED'):
            receipt_reconsider.run('config', 'catalogue', key)
        journal = ReceiptJournal(self.root / 'receipt-processing.db'); self.addCleanup(journal.close)
        self.assertEqual(journal.db.execute('SELECT status FROM receipt_jobs').fetchone()[0], 'PREPARED')

    # R174: requeue guards its own writes. A review decided, or a job moved, after the caller's checks rolls the whole
    # transaction back: no reconsideration row, the review keeps its state and job_id, the job is unchanged.
    def snapshot(self, db):
        return ([tuple(r) for r in db.execute('SELECT id,job_id,state FROM partner_reviews ORDER BY id')],
                [tuple(r) for r in db.execute('SELECT id,status,detail,attempts,url,result FROM receipt_jobs ORDER BY id')],
                db.execute('SELECT count(*) FROM receipt_reconsiderations').fetchone()[0])

    def reset(self, journal):
        for table in ('partner_reviews', 'receipt_jobs', 'receipt_reconsiderations'):journal.db.execute('DELETE FROM ' + table)
        journal.db.commit(); journal.close()

    def checked(self, status='REVIEW_REQUESTED', result=None):
        """The job and its PENDING review as the caller read them before the transaction."""
        journal = self.journal()
        self.job(journal, status, {'receipt': RECEIPT} if result is None else result)
        key = ReviewStore(journal.db).reserve('job-1', {'action': 'Lump Sum'})
        job = journal.db.execute("SELECT * FROM receipt_jobs WHERE id='job-1'").fetchone()
        review = journal.db.execute('SELECT * FROM partner_reviews WHERE id=?', (key,)).fetchone()
        journal.db.execute('CREATE TABLE IF NOT EXISTS receipt_reconsiderations (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)')
        journal.db.commit()
        return journal, job, review

    def test_r174_a_review_decided_after_the_check_is_not_superseded(self):
        for state in ('APPROVED', 'POSTING', 'POSTED', 'REJECTED', 'SUPERSEDED'):
            with self.subTest(state=state):
                journal, job, review = self.checked()
                journal.db.execute('UPDATE partner_reviews SET state=? WHERE id=?', (state, review['id'])); journal.db.commit()
                before = self.snapshot(journal.db)
                with self.assertRaisesRegex(ConfigurationError, 'DECIDED_REVIEW_CANNOT_BE_REOPENED'):
                    receipt_reconsider.requeue(journal.db, job, 'OWNER_REQUESTED_RECONSIDERATION', review)
                self.assertEqual(self.snapshot(journal.db), before)
                self.assertEqual(before[0], [(review['id'], 'job-1', state)])
                # A later reserve finds the job's decided review: no new generation (no new payment request id).
                self.assertEqual(ReviewStore(journal.db).reserve('job-1', {'action': 'Lump Sum'}), review['id'])
                self.reset(journal)

    def test_r174_a_review_no_longer_the_jobs_is_not_superseded(self):
        journal, job, review = self.checked()
        journal.db.execute("UPDATE partner_reviews SET job_id='job-1:superseded:'||id WHERE id=?", (review['id'],)); journal.db.commit()
        before = self.snapshot(journal.db)
        with self.assertRaisesRegex(ConfigurationError, 'DECIDED_REVIEW_CANNOT_BE_REOPENED'):
            receipt_reconsider.requeue(journal.db, job, 'OWNER_REQUESTED_RECONSIDERATION', review)
        self.assertEqual(self.snapshot(journal.db), before)

    def test_r174_a_job_moved_after_the_check_is_left(self):
        for moved in ('POSTED', 'PENDING', 'REVIEW'):
            with self.subTest(moved=moved):
                journal, job, review = self.checked(result={'extraction': {'raw': True}})
                journal.db.execute('UPDATE receipt_jobs SET status=?', (moved,)); journal.db.commit()
                before = self.snapshot(journal.db)
                with self.assertRaisesRegex(ConfigurationError, 'RECONSIDERATION_NOT_ELIGIBLE'):
                    receipt_reconsider.requeue(journal.db, job, 'OWNER_REQUESTED_RECONSIDERATION', review)
                self.assertEqual(self.snapshot(journal.db), before)  # the review stays PENDING, the extraction stays
                self.assertEqual(before[0][0][2], 'PENDING')
                self.reset(journal)

    def test_r174_an_ineligible_status_read_by_the_caller_is_refused(self):
        journal, job, review = self.checked(status='POSTED')
        before = self.snapshot(journal.db)
        with self.assertRaisesRegex(ConfigurationError, 'RECONSIDERATION_NOT_ELIGIBLE'):
            receipt_reconsider.requeue(journal.db, job, 'OWNER_REQUESTED_RECONSIDERATION', review)
        self.assertEqual(self.snapshot(journal.db), before)

    def test_r174_an_undecided_review_is_still_superseded(self):
        for state in ('PENDING', 'STALE', 'EXPIRED'):
            with self.subTest(state=state):
                journal, job, review = self.checked()
                journal.db.execute('UPDATE partner_reviews SET state=? WHERE id=?', (state, review['id'])); journal.db.commit()
                self.assertEqual(receipt_reconsider.requeue(journal.db, job, 'OWNER_REQUESTED_RECONSIDERATION', review), 'VALIDATED')
                reviews, jobs, count = self.snapshot(journal.db)
                self.assertEqual(reviews, [(review['id'], 'job-1:superseded:' + review['id'], 'SUPERSEDED')])
                self.assertEqual(jobs[0][1:4], ('VALIDATED', 'OWNER_REQUESTED_RECONSIDERATION', 0))
                self.assertEqual(count, 1)
                self.reset(journal)


if __name__ == '__main__':
    unittest.main()
