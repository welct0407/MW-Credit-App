"""R119 held-slip recheck: the hold codes a master change can fix, once per change, never a decided review."""
import json
import tempfile
import time
import unittest
from pathlib import Path

from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_recheck import DETAIL, recheck_held

EXTRACTION = {'is_payment_receipt': True, 'payer_name': 'Somchai', 'amount': '100.00'}


class RecheckHeldTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.journal = ReceiptJournal(Path(self.tmp.name) / 'receipt-processing.db'); self.addCleanup(self.journal.close)
        self.db = self.journal.db
        ReviewStore(self.db)
        self.db.execute('CREATE TABLE IF NOT EXISTS receipt_assets (job_id TEXT PRIMARY KEY, archive_state TEXT NOT NULL)')
        self.config = {'state_directory': self.tmp.name, 'receipt_archive_enabled': True,
                       'receipt_archive_cutoff': '2026-01-01T00:00:00+07:00'}
        self.now = time.time()
        self.written_at = self.now - 60

    def job(self, key, detail, created=None, archived=True, status='REVIEW'):
        result = {'extraction': EXTRACTION, 'borrower': None, 'payer_candidates': ['b1', 'b2']}
        self.db.execute('INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,attempts,detail,result,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
                        (key, 'm-' + key, '123', '', status, 1, detail, json.dumps(result), self.now - 600 if created is None else created))
        if archived:self.db.execute('INSERT INTO receipt_assets VALUES (?,?)', (key, 'ARCHIVED'))
        self.db.commit()

    def row(self, key):
        return dict(self.db.execute('SELECT status,detail,attempts,retry_after,result FROM receipt_jobs WHERE id=?', (key,)).fetchone())

    def recheck(self, grew=False, changed=False, written_at=None):
        return recheck_held(self.config, self.journal, grew, changed, self.written_at if written_at is None else written_at, now=self.now)

    def test_each_hold_code_requeues_on_its_own_change_keeping_the_extraction(self):
        self.job('payer', 'PAYER_UNRESOLVED'); self.job('recipient', 'RECIPIENT_UNKNOWN_OR_AMBIGUOUS')
        review = ReviewStore(self.db).reserve('payer', {'action': 'Lump Sum'})
        self.assertEqual(self.recheck(grew=True), {'held_requeued': 1, 'held_skipped': 0})
        payer = self.row('payer')
        self.assertEqual((payer['status'], payer['detail'], payer['attempts'], payer['retry_after']), ('PENDING', DETAIL, 0, 0))
        self.assertEqual(json.loads(payer['result'])['extraction'], EXTRACTION)  # no new OCR
        self.assertEqual(self.row('recipient')['status'], 'REVIEW')  # the wrong trigger leaves it
        self.assertEqual(tuple(self.db.execute('SELECT state,job_id FROM partner_reviews WHERE id=?', (review,)).fetchone()),
                         ('SUPERSEDED', 'payer:superseded:' + review))
        previous = json.loads(self.db.execute("SELECT previous FROM receipt_reconsiderations WHERE job_id='payer'").fetchone()[0])
        self.assertEqual((previous['status'], previous['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))
        self.assertEqual(self.recheck(changed=True), {'held_requeued': 1, 'held_skipped': 0})
        self.assertEqual(self.row('recipient')['status'], 'PENDING')

    def test_wrong_trigger_decided_review_old_or_unarchived_jobs_are_left(self):
        self.job('payer', 'PAYER_UNRESOLVED'); self.job('other', 'PAYER_NAME_UNREADABLE')
        self.assertEqual(self.recheck(changed=True), {'held_requeued': 0, 'held_skipped': 0})
        self.assertEqual(self.recheck(), {'held_requeued': 0, 'held_skipped': 0})
        review = ReviewStore(self.db).reserve('payer', {'action': 'Lump Sum'})
        self.db.execute("UPDATE partner_reviews SET state='APPROVED' WHERE id=?", (review,)); self.db.commit()
        self.job('old', 'PAYER_UNRESOLVED', created=self.now - 3 * 86400)
        self.job('lost', 'PAYER_UNRESOLVED', archived=False)
        self.assertEqual(self.recheck(grew=True), {'held_requeued': 0, 'held_skipped': 2})
        for key in ('payer', 'other', 'old', 'lost'):
            self.assertEqual(self.row(key)['status'], 'REVIEW', key)
        self.assertEqual(self.db.execute('SELECT count(*) FROM receipt_reconsiderations').fetchone()[0], 0)

    def test_a_rerun_against_the_same_snapshot_rechecks_nothing_again(self):
        self.job('payer', 'PAYER_UNRESOLVED')
        self.assertEqual(self.recheck(grew=True)['held_requeued'], 1)
        # The worker held it again with the same code; the same master change does not requeue it twice.
        self.db.execute("UPDATE receipt_jobs SET status='REVIEW',detail='PAYER_UNRESOLVED'"); self.db.commit()
        self.assertEqual(self.recheck(grew=True), {'held_requeued': 0, 'held_skipped': 1})
        # A later change (a snapshot written after that requeue) rechecks it once more.
        self.assertEqual(self.recheck(grew=True, written_at=time.time() + 1)['held_requeued'], 1)


if __name__ == '__main__':
    unittest.main()
