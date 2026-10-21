import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent.receipt_wake import CONVERSATION,EXTRA_PASSES,converses,rerun,wake,wakes,woken


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


class ConversationWakeTests(unittest.TestCase):
    """R086: the same file mechanics under state/conversation-wake for mw-partner-conversation.service."""
    setUp=ReceiptWakeTests.setUp

    def test_messages_that_can_need_a_turn(self):
        self.assertTrue(converses({'text':'how much has Somchai paid?'}))
        self.assertTrue(converses({'text':'see slip','attachments':[{'url':'https://cdn.invalid/x'}]}))
        self.assertFalse(converses({'text':'  ','attachments':[{'url':'https://cdn.invalid/x'}]}))
        self.assertFalse(converses({'text':'yes','reply_to':'out'}))  # receipt review owns replies
        self.assertFalse(converses({'text':' Review '}))  # and standalone commands
        self.assertFalse(converses({'text':'hello','quarantine':'LATE'}))
        from mw_integration_agent.partner_conversation import is_receipt_reply
        for message in ({'text':'hello'},{'text':'yes','reply_to':'out'},{'text':'review'}):
            with self.subTest(message=message):  # the wake classifier matches the cycle's own reply rule
                self.assertEqual(converses(message),not is_receipt_reply(self.root,message))

    def test_named_wake_files_are_separate(self):
        self.assertTrue(wake(self.config,CONVERSATION))
        self.assertTrue((self.root/'conversation-wake').is_file());self.assertFalse(self.file.exists())
        self.assertTrue(woken(self.config,time.time()-1,CONVERSATION));self.assertFalse(woken(self.config,0))

    def test_conversation_capture_during_a_run_reruns_and_receipt_wakes_do_not(self):
        # A path change while the oneshot runs does not start it again; the touch after a committed capture is
        # seen here instead, and the 15 s timer catches anything else, because each pass rereads every unhandled message.
        calls=[]
        def run(config_path,catalogue_path):
            calls.append(1)
            wake(self.config,CONVERSATION if len(calls)==1 else 'receipt-wake')
            return {'status':'ok','turns_attempted':1}
        self.assertEqual(rerun(run,str(self.path),'catalogue',CONVERSATION),{'status':'ok','turns_attempted':1})
        self.assertEqual(len(calls),2)

    def cli(self,results):
        from mw_integration_agent.cli import build_parser,execute
        args=build_parser().parse_args(['partner-conversation-cycle','--config',str(self.path),'--catalogue','unused'])
        calls=[]
        def run(config_path,catalogue_path):
            calls.append(1);return results[len(calls)-1]
        with patch('mw_integration_agent.partner_conversation.run',run),patch('builtins.print') as printed:
            self.assertEqual(execute(args),0)
        return len(calls),printed.call_args.args[0]

    def test_cli_reruns_after_a_turn_until_an_empty_pass_within_the_cap(self):
        # Two questions captured together: pass 1 answers one, pass 2 the other, pass 3 is the one empty run.
        turn,empty={'status':'ok','turns_attempted':1},{'status':'ok','turns_attempted':0}
        self.assertEqual(self.cli([turn,turn,empty,empty]),(3,json.dumps(empty)))
        self.assertEqual(self.cli([turn]*4)[0],1+EXTRA_PASSES)  # the cap holds; the timer takes the rest
        self.assertEqual(self.cli([empty,turn])[0],1)  # no turn and no wake: one pass
        self.assertEqual(self.cli([{'status':'already_running'},turn])[0],1)


if __name__=='__main__':unittest.main()
