import tempfile
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

from mw_integration_agent.cash_statement import BANGKOK, period, summarize
from mw_integration_agent.config import ConfigurationError, validate_catalogue
from mw_integration_agent.instagram import InstagramAPIError
from mw_integration_agent.statement_delivery import DeliveryJournal, eligible, resolve_recipient


class StatementTests(unittest.TestCase):
    def test_midnight_period_boundaries(self):
        for hour,expected in [(0,'2026-09-19'),(5,'2026-09-19'),(6,'2026-09-19'),(20,'2026-09-19')]:
            start,end=period(now=datetime(2026,9,20,hour,tzinfo=BANGKOK))
            self.assertEqual(start.date().isoformat(),expected)
            self.assertEqual((end-start).total_seconds(),86400)
            self.assertEqual(start.hour,0)
            self.assertEqual(end.hour,0)
        start,end=period('2026-09-19',now=datetime(2026,9,20,0,tzinfo=BANGKOK))
        self.assertEqual(start.isoformat(),'2026-09-19T00:00:00+07:00')
        self.assertEqual(end.isoformat(),'2026-09-20T00:00:00+07:00')
        with self.assertRaises(ConfigurationError):
            period('2026-09-20',now=datetime(2026,9,20,23,tzinfo=BANGKOK))

    def test_running_balance_and_reversal(self):
        rows=[{'posted_at':f'2026-09-19T06:00:0{i}','ledger_id':str(i),'direction':'IN','amount':a}
              for i,a in enumerate(['0.10','-25.30','25.30'])]
        result=summarize({'opening':'100.00','initialized':True,'transactions':rows})
        self.assertEqual(result['closing'],Decimal('100.10'))
        self.assertEqual(result['money_in'],Decimal('25.40'))
        self.assertEqual(result['money_out'],Decimal('25.30'))
        self.assertEqual(rows[1]['balance'],Decimal('74.80'))

    def test_empty_and_uninitialized(self):
        self.assertEqual(summarize({'opening':0,'initialized':True,'transactions':[]})['closing'],0)
        with self.assertRaises(ConfigurationError):
            summarize({'opening':None,'initialized':False,'transactions':[]})

    def test_duplicate_effect_rejected(self):
        row={'posted_at':'2026-09-19T06:00:00','ledger_id':'1','direction':'IN','amount':1}
        with self.assertRaises(ConfigurationError):
            summarize({'opening':0,'initialized':True,'transactions':[row,row.copy()]})

    def test_partner_optin_language_and_duplicate(self):
        partner={'id':'a','username':'demo','language':'English','enabled':True}
        self.assertEqual(eligible([partner],'a'),partner)
        for update in [{'enabled':False},{'enabled':'true'},{'language':None},{'username':''}]:
            with self.assertRaises(ConfigurationError):
                eligible([dict(partner,**update)],'a')
        with self.assertRaises(ConfigurationError):
            eligible([partner,dict(partner,id='b',enabled=False)],'a')

    def test_recipient_requires_profile_match(self):
        api=Mock(config={'instagram_account_id':'999'})
        api.request.side_effect=[{'data':[{'participants':{'data':[{'id':'123','username':'demo'}]}}]},
                                 {'id':'123','username':'changed'}]
        with self.assertRaises(ConfigurationError):
            resolve_recipient(api,{'username':'demo'})

    def test_window_evidence_requires_provider_rejection_for_same_report_and_partner(self):
        import json
        with tempfile.TemporaryDirectory() as d:
            journal=DeliveryJournal(Path(d)/'send.db')
            api=Mock(config={'instagram_account_id':'999','sending_enabled':True})
            page=lambda partner,account,number:json.dumps(['2026-10-01T00:00:00+07:00','2026-10-02T00:00:00+07:00',partner,account,number])
            email=lambda partner:json.dumps(['2026-10-01T00:00:00+07:00','2026-10-02T00:00:00+07:00',partner,'email-fallback-v1'])
            # No local gate: the send is attempted and the provider's explicit window rejection is recorded.
            api.request.side_effect=InstagramAPIError(400,10,2534022,window_expired=True)
            self.assertEqual(journal.send_once(page('p','a',1),'123','English','hash','asset',api),'WINDOW_EXPIRED')
            self.assertEqual(journal.status(page('p','a',1)),'WINDOW_EXPIRED')
            self.assertTrue(journal.window_evidence(email('p'),'p'))
            self.assertFalse(journal.window_evidence(email('p'),'other'))
            self.assertFalse(journal.window_evidence(email('other'),'other'))
            self.assertFalse(journal.window_evidence('not-json','p'))
            # Any uncertain or definite non-window outcome in the same report blocks email.
            api.request.side_effect=InstagramAPIError(400,100)
            self.assertEqual(journal.send_once(page('p','a',2),'123','English','hash','asset',api),'REJECTED')
            self.assertFalse(journal.window_evidence(email('p'),'p'))
            journal.close()

    def test_window_evidence_accepts_mixed_accepted_and_expired_pages(self):
        import json
        with tempfile.TemporaryDirectory() as d:
            journal=DeliveryJournal(Path(d)/'send.db')
            api=Mock(config={'instagram_account_id':'999','sending_enabled':True})
            page=lambda number:json.dumps(['s','e','p','a',number])
            api.request.return_value={'message_id':'accepted'}
            self.assertEqual(journal.send_once(page(1),'123','English','hash','asset',api),'ACCEPTED')
            self.assertFalse(journal.window_evidence(json.dumps(['s','e','p','email-fallback-v1']),'p'))
            api.request.side_effect=InstagramAPIError(400,10,2534022,window_expired=True)
            self.assertEqual(journal.send_once(page(2),'123','English','hash','asset',api),'WINDOW_EXPIRED')
            self.assertTrue(journal.window_evidence(json.dumps(['s','e','p','email-fallback-v1']),'p'))
            journal.close()

    def test_unknown_send_survives_restart_never_replays(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'send.db'
            journal=DeliveryJournal(path)
            api=Mock(config={'instagram_account_id':'999','sending_enabled':True})
            api.request.side_effect=ConfigurationError('timeout')
            with self.assertRaises(ConfigurationError):
                journal.send_once('k','123','English','hash','asset',api)
            journal.close()
            journal=DeliveryJournal(path)
            self.assertEqual(journal.send_once('k','123','English','hash','asset',api),'UNKNOWN')
            self.assertEqual(api.request.call_count,1)
            journal.close()

    def test_accepted_duplicate_is_not_resent(self):
        with tempfile.TemporaryDirectory() as d:
            journal=DeliveryJournal(Path(d)/'send.db')
            api=Mock(config={'instagram_account_id':'999','sending_enabled':True})
            api.request.return_value={'message_id':'accepted'}
            for _ in range(2):
                self.assertEqual(journal.send_once('k','123','English','hash','asset',api),'ACCEPTED')
            self.assertEqual(api.request.call_count,1)
            journal.close()

    def test_unknown_catalogue_service_denied(self):
        with self.assertRaises(ConfigurationError):
            validate_catalogue({'default_policy':'deny','services':{'surprise':{'enabled':True,'implemented':True}}})


if __name__=='__main__':
    unittest.main()
