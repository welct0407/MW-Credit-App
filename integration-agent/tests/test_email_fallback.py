import json
import tempfile
import unittest
from pathlib import Path

from mw_integration_agent.config import ConfigurationError, validate_config
from mw_integration_agent.graph_email import EmailRejected, GraphEmail
from mw_integration_agent.statement_delivery import DeliveryJournal
from mw_integration_agent.statement_run import delivery_authorized


class EmailFallbackTests(unittest.TestCase):
    @unittest.skipUnless(__import__('os').name=='posix','POSIX credential lock')
    def test_busy_oauth_lock_is_definitely_unsent_without_waiting(self):
        import fcntl
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'oauth.json';path.write_text('{}')
            client=GraphEmail({'email_oauth_file':str(path),'secrets_directory':directory})
            with path.open('r+') as held,patch.object(client,'_token_locked') as refresh:
                fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(EmailRejected):client.token()
                refresh.assert_not_called()
            with patch.object(client,'_token_locked',return_value='synthetic'):
                self.assertEqual(client.token(),'synthetic')

    def test_refresh_token_rotation_backs_up_previous_credential_first(self):
        import contextlib
        import io
        import stat
        from unittest.mock import Mock
        class Response:
            def __init__(self, refresh):self.refresh=refresh
            def read(self):return json.dumps({'access_token':'synthetic-access','refresh_token':self.refresh}).encode()
            def __enter__(self):return self
            def __exit__(self,*args):return False
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'oauth.json';backup=Path(directory)/'oauth.json.bak'
            original={'client_id':'synthetic','refresh_token':'first','tenant':'consumers'}
            path.write_text(json.dumps(original));path.chmod(0o600)
            opener=Mock();opener.open.return_value=Response('second')
            client=GraphEmail({'email_oauth_file':str(path),'secrets_directory':directory},opener=opener)
            self.assertEqual(client.token(),'synthetic-access')
            self.assertEqual(json.loads(backup.read_text()),original)
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode),0o600)
            self.assertEqual(json.loads(path.read_text())['refresh_token'],'second')
            # An unchanged refresh token rewrites nothing and leaves the backup alone.
            self.assertEqual(client.token(),'synthetic-access')
            self.assertEqual(json.loads(backup.read_text())['refresh_token'],'first')
            # The next rotation backs up the then-current file.
            opener.open.return_value=Response('third')
            client.token()
            self.assertEqual(json.loads(backup.read_text())['refresh_token'],'second')
            self.assertEqual(json.loads(path.read_text())['refresh_token'],'third')
            # A backup that cannot be written is reported, and the rotation is still persisted.
            backup.unlink();backup.mkdir()
            opener.open.return_value=Response('fourth')
            stderr=io.StringIO()
            with contextlib.redirect_stderr(stderr):
                self.assertEqual(client.token(),'synthetic-access')
            self.assertIn('credential_backup_failed',stderr.getvalue())
            self.assertNotIn('fourth',stderr.getvalue())
            self.assertEqual(json.loads(path.read_text())['refresh_token'],'fourth')

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
            key=json.dumps(['s','e','partner','email-fallback-v1'])
            journal=DeliveryJournal(path)
            self.assertEqual(journal.reserve_email(key,'partner',payload),(True,'EMAIL_UNKNOWN'))
            journal.mark_email(key,'EMAIL_REJECTED',attempts=1,retry_after=0,detail='definitely unsent')
            # R058: a rejected email is retried only with durable provider window-expiry evidence.
            self.assertEqual(journal.due_emails(now=1),[])
            self.assertFalse(journal.begin_email_retry(key,2))
            with journal.db:
                journal.db.execute('INSERT INTO cash_statement_sends VALUES (?,?,?,?,?,?,NULL,0)',
                                   (json.dumps(['s','e','partner','a',1]),'123','English','h','asset','WINDOW_EXPIRED'))
            journal.close()
            journal=DeliveryJournal(path)
            due=journal.due_emails(now=1)
            self.assertEqual(len(due),1)
            self.assertEqual(due[0]['attempts'],1)
            self.assertTrue(journal.begin_email_retry(key,2))
            self.assertFalse(journal.begin_email_retry(key,2))
            journal.mark_email(key,'EMAIL_UNKNOWN',detail='uncertain')
            self.assertEqual(journal.due_emails(now=999),[])
            journal.close()

    def test_send_email_once_refuses_without_provider_window_rejection(self):
        from mw_integration_agent.statement_run import send_email_once
        with tempfile.TemporaryDirectory() as directory:
            journal=DeliveryJournal(Path(directory)/'journal.db')
            key=json.dumps(['s','e','partner','email-fallback-v1'])
            with self.assertRaisesRegex(ConfigurationError,'EMAIL_REQUIRES_PROVIDER_WINDOW_REJECTION'):
                send_email_once(journal,key,{'id':'partner'},{},{})
            self.assertIsNone(journal.email_status(key))
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
