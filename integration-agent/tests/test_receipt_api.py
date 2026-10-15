import json
import unittest
from unittest.mock import patch
import test_review_cycle as existing_cycle
from mw_integration_agent import receipt_api
from mw_integration_agent.receipt_archive import Archive


class ContractTests(unittest.TestCase):
    def test_cross_language_identity_and_default_off(self):
        self.assertEqual(receipt_api.request_id('dev', 'synthetic-review-1'), '1da49312-d7f1-4948-85a6-b3bf3e61035c')
        self.assertEqual(receipt_api.request_id('prod', 'synthetic-review-1'), 'b8ffcf33-e1ea-439b-aba5-24b6c914918b')
        receipt_api.validate({})
        with self.assertRaises(ValueError):
            receipt_api.validate({'receipt_payment_api_enabled': True})
        with patch('urllib.request.build_opener') as opener:
            with self.assertRaises(ValueError):
                receipt_api.call({}, 'GET', request='1da49312-d7f1-4948-85a6-b3bf3e61035c')
            opener.assert_not_called()


    def test_catalogue_disabled_rejects_an_enabled_valid_api_configuration(self):
        from pathlib import Path
        from mw_integration_agent.receipt_run import controls
        config=json.loads(Path('config.example.json').read_text())
        config.update(receipt_payment_api_enabled=True,receipt_environment='dev',database_name='loan_manager_dev',
            receipt_archive_enabled=True,receipt_archive_cutoff='2026-01-01T00:00:00+00:00',
            receipt_payment_api_cutoff='2026-01-01T00:00:00+00:00',
            receipt_payment_api_origin='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',
            receipt_payment_api_audience='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app')
        catalogue=json.loads(Path('service-catalogue.json').read_text())
        with patch('mw_integration_agent.receipt_run.load_json',side_effect=[config,catalogue]):
            with self.assertRaisesRegex(ValueError,'SHARED_RECEIPT_PAYMENT_API_DISABLED'):
                controls('config','catalogue')


class RoutingTests(unittest.TestCase):
    setUp = existing_cycle.CycleTests.setUp
    run_cycle = existing_cycle.CycleTests.run_cycle

    def enable_api(self):
        self.payload.side_effect=existing_cycle.REAL_RECEIPT_PAYLOAD
        self.config.update(receipt_payment_api_enabled=True, receipt_environment='dev',
            database_name='loan_manager_dev', receipt_archive_enabled=True,
            receipt_archive_cutoff='2026-01-01T00:00:00+00:00',
            receipt_payment_api_cutoff='2026-01-01T00:00:00+00:00',
            receipt_bucket='mw-payment-receipts-prod-508610-n7',
            receipt_payment_api_origin='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',
            receipt_payment_api_audience='https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app')
        Archive(self.config, self.j, storage=object())
        self.j.db.execute('''INSERT INTO receipt_assets(receipt_id,job_id,source,archive_state,object_key,
            raw_sha256,mime_type,byte_size,generation) VALUES(?,?,?,?,?,?,?,?,?)''',
            ('a'*64,'job',json.dumps({'captured_at':1791766800.125}),'ARCHIVED',
             'receipts/dev/2026/10/12/'+'a'*64+'/'+'b'*64+'.jpg','b'*64,'image/jpeg',123,'456'))
        self.j.db.execute('UPDATE receipt_jobs SET created_at=1791766800')
        self.j.db.commit()
        return 'pwa:'+receipt_api.request_id('dev',self.key)

    def test_api_claim_precedes_network_and_posted_requires_existing_readback(self):
        key=self.enable_api()
        def submit(config,body):
            row=self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()
            self.assertEqual(tuple(row),('POSTING',key))
            self.assertEqual(body['command']['transferTime'],'12:10')
            self.assertEqual(body['command']['archiveEvidence']['capturedAt'],'1791766800.125')
            return {'kind':'recorded','reviewId':self.key,'financialMatch':True,
                    'originalOutcome':{'status':'posted','paymentId':key}}
        with patch('mw_integration_agent.receipt_api.submit',side_effect=submit):
            result=self.run_cycle()
        self.assertEqual(result['failures'],[])
        self.add_payment.assert_not_called()
        self.readback.assert_called_once_with(self.config,key,self.proposal)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')

    def test_uncertain_api_uses_status_only_and_never_legacy_fallback(self):
        key=self.enable_api()
        with patch('mw_integration_agent.receipt_api.submit',side_effect=TimeoutError()) as submit, \
             patch('mw_integration_agent.receipt_api.status',return_value={'kind':'unresolved'}) as status:
            self.run_cycle();self.run_cycle()
            self.assertEqual(submit.call_count,1)
            self.assertEqual(status.call_count,2)
        self.add_payment.assert_not_called();self.readback.assert_not_called()
        row=self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()
        self.assertEqual(tuple(row),('UNKNOWN',key))

    def test_enabling_api_does_not_reroute_old_unknown_review(self):
        self.enable_api()
        self.j.db.execute("UPDATE partner_reviews SET state='UNKNOWN',payment_id=NULL")
        self.j.db.commit()
        with patch('mw_integration_agent.receipt_api.status') as status,patch('mw_integration_agent.receipt_api.submit') as submit:
            self.run_cycle();status.assert_not_called();submit.assert_not_called()
        self.add_payment.assert_not_called()
        self.readback.assert_called_once_with(self.config,'igr:'+self.key[:48],self.proposal)

    def test_before_cutoff_unattempted_review_uses_native_after_fresh_checks(self):
        key=self.enable_api()
        self.j.db.execute('UPDATE receipt_jobs SET created_at=0')
        self.j.db.commit()
        self.run_cycle()
        self.submit.assert_called_once()
        self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT payment_id FROM partner_reviews').fetchone()[0],key)

    def test_disabled_native_transport_leaves_approved_review_unattempted(self):
        self.config['receipt_payment_api_enabled']=False
        self.run_cycle()
        self.submit.assert_not_called();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()[:],('APPROVED',None))

    def test_saved_identity_is_never_reselected_if_state_was_reset(self):
        self.enable_api()
        self.j.db.execute("UPDATE partner_reviews SET payment_id=?",('igr:'+self.key[:48],))
        self.j.db.commit()
        self.run_cycle()
        self.submit.assert_not_called();self.add_payment.assert_not_called()
        row=self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()
        self.assertEqual(tuple(row),('UNKNOWN','igr:'+self.key[:48]))

    def test_recorded_api_rejection_becomes_manual_handling_without_readback_or_retry(self):
        self.enable_api()
        with patch('mw_integration_agent.receipt_api.submit',return_value={'kind':'recorded','reviewId':self.key,'financialMatch':None,'originalOutcome':{'status':'rejected','paymentId':None,'code':'selection_unavailable'}}) as submit:
            self.run_cycle();self.run_cycle();self.assertEqual(submit.call_count,1)
        self.add_payment.assert_not_called();self.readback.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'MANUAL_REQUIRED')
