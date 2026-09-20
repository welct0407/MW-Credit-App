import json
import tempfile
import unittest
from pathlib import Path

from mw_integration_agent.config import ConfigurationError, validate_config
from mw_integration_agent.graph_email import EmailRejected, GraphEmail
from mw_integration_agent.statement_delivery import DeliveryJournal
from mw_integration_agent.statement_run import delivery_authorized


class EmailFallbackTests(unittest.TestCase):
    def test_schedule_has_separate_authorization(self):
        controls={'sending_enabled':False,'cash_statement_schedule_enabled':True}
        self.assertTrue(delivery_authorized(controls,True))
        self.assertFalse(delivery_authorized(controls,False))

    def test_invalid_email_is_definitely_unsent(self):
        client=GraphEmail({'email_oauth_file':'/tmp/no','secrets_directory':'/tmp','email_sender':'a@example.com'})
        with self.assertRaises(EmailRejected):
            client.send('bad address','subject','body',[],'key')

    def test_email_reservation_survives_restart_and_due_retry_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'journal.db'
            payload={'recipient':'partner@example.com','language':'English','subject':'s','body':'b','attachments':[]}
            journal=DeliveryJournal(path)
            self.assertEqual(journal.reserve_email('key','partner',payload),(True,'EMAIL_UNKNOWN'))
            journal.mark_email('key','EMAIL_REJECTED',attempts=1,retry_after=0,detail='definitely unsent')
            journal.close()
            journal=DeliveryJournal(path)
            due=journal.due_emails(now=1)
            self.assertEqual(len(due),1)
            self.assertEqual(due[0]['attempts'],1)
            self.assertTrue(journal.begin_email_retry('key',2))
            self.assertFalse(journal.begin_email_retry('key',2))
            journal.mark_email('key','EMAIL_UNKNOWN',detail='uncertain')
            self.assertEqual(journal.due_emails(now=999),[])
            journal.close()

    def test_enabled_schedule_requires_email_configuration(self):
        from mw_integration_agent.config import load_json
        root=Path(__file__).resolve().parents[1]
        config=load_json(root/'config.example.json')
        config['cash_statement_schedule_enabled']=True
        config['email_sender']=''
        with self.assertRaises(ConfigurationError):
            validate_config(config)


if __name__=='__main__':
    unittest.main()
