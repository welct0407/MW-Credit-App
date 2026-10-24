import json
import os
import tempfile
import time
import unittest
from pathlib import Path

from mw_integration_agent import receipt_wake
from mw_integration_agent.receipt_wake import EXTRA_PASSES,rerun,wake,wakes,woken


class ReceiptWakeTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);self.root=Path(tmp.name)
        self.config={'state_directory':str(self.root)}
        self.path=self.root/'config.json';self.path.write_text(json.dumps(self.config))
        self.file=self.root/'receipt-wake'

    def runner(self,results,touch=()):
        calls=[]
        def run(config_path,catalogue_path):
            calls.append(config_path)
            if len(calls) in touch:wake(self.config)
            return results[len(calls)-1]
        return calls,run

    def test_capture_during_run_reruns_at_most_twice(self):
        calls,run=self.runner([{'failures':[]}]*4,touch=(1,2,3))
        self.assertEqual(rerun(run,str(self.path),'catalogue'),{'failures':[]})
        self.assertEqual(len(calls),1+EXTRA_PASSES)

    def test_no_capture_or_older_wake_runs_once(self):
        wake(self.config);old=time.time()-60;os.utime(self.file,(old,old))
        calls,run=self.runner([{'failures':[]}]*3)
        rerun(run,str(self.path),'catalogue');self.assertEqual(len(calls),1)

    def test_failed_or_locked_run_is_not_repeated(self):
        for first in ({'failures':[{'stage':'execution'}]},{'status':'already_running'}):
            with self.subTest(first=first):
                calls,run=self.runner([first,{'failures':[]}],touch=(1,))
                self.assertEqual(rerun(run,str(self.path),'catalogue'),first);self.assertEqual(len(calls),1)

    def test_wake_failure_is_swallowed_and_actionable_messages(self):
        self.assertFalse(wake({'state_directory':str(self.root/'missing')}))
        self.assertFalse(woken({'state_directory':str(self.root/'missing')},0))
        self.assertTrue(wake(self.config));self.assertTrue(woken(self.config,time.time()-1))
        self.assertTrue(wakes({'attachments':[{'url':'https://cdn.invalid/x'}]}))
        self.assertTrue(wakes({'reply_to':'out','text':'yes'}));self.assertTrue(wakes({'text':' Review '}))
        self.assertFalse(wakes({'text':'hello','attachments':[]}))
        self.assertFalse(wakes({'quarantine':'LATE','attachments':[{'url':'https://cdn.invalid/x'}]}))


class RetiredConversationWakeTests(unittest.TestCase):
    """R091: the R086 conversation wake left with the Instagram Partner conversation; only the receipt wake remains."""
    def test_only_the_receipt_wake_remains(self):
        for name in ('CONVERSATION','converses','more_turns'):
            with self.subTest(name=name):
                self.assertFalse(hasattr(receipt_wake,name))
        self.assertEqual(receipt_wake.RECEIPT,'receipt-wake')

if __name__=='__main__':unittest.main()
