"""R112: the agent's schemaVersion 9 receipt command payload and its idempotent key (new file; Byte owns the code).
v7/v8 stay as they are (a slip that is due, the payer-lines learn). v9 = v8 keys + the chosen purpose + the explicit plan lines
(allocations, materialize, principal) exactly as the options message showed. """
import json
import unittest
from mw_integration_agent import receipt_api
from mw_integration_agent.config import ConfigurationError

CONFIG={'receipt_payment_api_enabled':True,'receipt_environment':'dev','database_name':'loan_manager_dev','receipt_archive_enabled':True,
        'receipt_archive_cutoff':'2026-01-01T00:00:00+00:00','receipt_payment_api_cutoff':'2026-01-01T00:00:00+00:00',
        'receipt_payment_api_origin':'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app','receipt_payment_api_audience':'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app'}
ASSET={'archive_state':'ARCHIVED','source':json.dumps({'captured_at':'1791695110'}),'receipt_id':'a'*64,'object_key':'receipts/dev/2026/11/03/'+'a'*64+'/'+'b'*64+'.png',
       'generation':'1','raw_sha256':'b'*64,'mime_type':'image/png','byte_size':100}
PLAN_FORWARD={'allocations':[{'chargeId':'c1','principal':'0','interest':'300','expectedPrincipalRemaining':'0','expectedInterestRemaining':'300','chargeDate':'2026-11-03'}],
              'materialize':[{'loanId':'L1','chargeId':'cg8:2:L1:2026-11-04','chargeDate':'2026-11-04','principalDue':'0','interestDue':'70'}],'principal':[]}


def proposal(action='Pay forward options'):
    return {'action':action,'borrower':{'id':'b'},'receipt':{'amount':'1500','date':'2026-11-03','time':'12:10','reference':'TESTREF','account_id':'a','account_label':'Test'},
            'facts':{},'options':{'planSha256':'a'*64}}


class V9PayloadTests(unittest.TestCase):
    def plan(self,purpose,principal=None):
        # The chosen plan dict the cycle passes (server plan lines plus the purpose); payload never reads the purpose from review['detail'].
        return {**PLAN_FORWARD,'principal':principal or [],'purpose':purpose}

    def test_v9_carries_the_purpose_and_the_explicit_plan(self):
        purpose={'forward':True,'principal':[],'loans':None}
        body=receipt_api.payload(CONFIG,{'id':'r1','deciding_partner':'p','detail':''},proposal(),ASSET,False,plan=self.plan(purpose))['command']
        self.assertEqual(body['schemaVersion'],9);self.assertEqual(body['purpose'],purpose)
        self.assertEqual(body['allocations'],PLAN_FORWARD['allocations']);self.assertEqual(body['materialize'],PLAN_FORWARD['materialize']);self.assertEqual(body['principal'],[])
        for key in ('requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence'):self.assertIn(key,body)
        self.assertEqual(body['mode'],'reviewed')
        self.assertEqual(list(body)[-2:],['proposalSha256','archiveEvidence'],'the canonical order ends with the hash and the evidence')

    def test_one_slip_one_request_id_whatever_the_purpose(self):
        review={'id':'r1','deciding_partner':'p','detail':''}
        entry={'loanId':'L1','kind':'raise','chargeId':'c1','chargeDate':'2026-11-03','amount':'1200','accruedInterest':'0','principalDue':'1200'}
        a=receipt_api.payload(CONFIG,review,proposal(),ASSET,False,plan=self.plan({'forward':True,'principal':[],'loans':None}))['command']
        b=receipt_api.payload(CONFIG,review,proposal(),ASSET,False,plan=self.plan({'forward':False,'principal':[{'loanId':'L1','amount':'1200'}],'loans':None},[entry]))['command']
        self.assertEqual(a['requestId'],b['requestId']);self.assertEqual(a['requestId'],receipt_api.request_id('dev','r1'))
        self.assertEqual(b['principal'],[entry]);self.assertNotEqual(a['purpose'],b['purpose'])

    def test_a_split_names_the_principal_part(self):
        entry={'loanId':'L1','kind':'raise','chargeId':'c1','chargeDate':'2026-11-03','amount':'800','accruedInterest':'0','principalDue':'800'}
        body=receipt_api.payload(CONFIG,{'id':'r1','deciding_partner':'p','detail':''},proposal(),ASSET,False,plan=self.plan({'forward':True,'principal':[{'loanId':'L1','amount':'800'}],'loans':None},[entry]))['command']
        self.assertEqual(body['purpose']['principal'],[{'loanId':'L1','amount':'800'}]);self.assertTrue(body['purpose']['forward'])

    def test_the_plan_is_required_for_options_and_refused_otherwise(self):
        review={'id':'r1','deciding_partner':'p','detail':''}
        with self.assertRaisesRegex(ConfigurationError,'PAY_FORWARD_PLAN_REQUIRED'):receipt_api.payload(CONFIG,review,proposal(),ASSET,False)
        with self.assertRaisesRegex(ConfigurationError,'PAY_FORWARD_PLAN_REQUIRED'):receipt_api.payload(CONFIG,review,proposal(),ASSET,True,plan=self.plan({'forward':True,'principal':[],'loans':None}))   # never automatic
        due={'action':'Lump Sum','borrower':{'id':'b'},'receipt':proposal()['receipt'],'facts':{}}
        with self.assertRaisesRegex(ConfigurationError,'PAY_FORWARD_PLAN_UNEXPECTED'):receipt_api.payload(CONFIG,review,due,ASSET,False,plan=self.plan({'forward':True,'principal':[],'loans':None}))

    def test_a_slip_that_is_due_stays_version_7_and_payer_lines_stay_version_8(self):
        due={'action':'Lump Sum','borrower':{'id':'b'},'receipt':proposal()['receipt'],'facts':{}}
        body=receipt_api.payload(CONFIG,{'id':'r2','deciding_partner':'p','detail':''},due,ASSET,True)['command']
        self.assertEqual(body['schemaVersion'],7);self.assertNotIn('purpose',body)
        learn=dict(due,receipt=dict(due['receipt'],payer_lines={'before':None,'after':'Manee'}))
        self.assertEqual(receipt_api.payload(CONFIG,{'id':'r3','deciding_partner':'p','detail':''},learn,ASSET,True)['command']['schemaVersion'],8)

    def test_a_whole_baht_slip_is_required(self):
        bad=proposal();bad['receipt']=dict(bad['receipt'],amount='1500.5')
        with self.assertRaisesRegex(ConfigurationError,'WHOLE_RECEIPT_AMOUNT_REQUIRED'):
            receipt_api.payload(CONFIG,{'id':'r1','deciding_partner':'p','detail':''},bad,ASSET,False,plan=self.plan({'forward':True,'principal':[],'loans':None}))

    def test_an_uncertain_post_is_reconciled_by_status_never_resent(self):
        # After a POST that may have left the host the caller reads the status (GET by the same request id); call() never re-POSTs on its own.
        import io
        import urllib.error
        from unittest.mock import patch
        calls=[]
        class Opener:
            def open(self,request,timeout=None):
                calls.append(request.get_method());raise urllib.error.HTTPError(CONFIG['receipt_payment_api_origin'],500,'err',{},io.BytesIO(b'{}'))
        with patch('mw_integration_agent.receipt_api.identity_token',return_value='a.b.c'),patch('mw_integration_agent.receipt_api.http_opener',return_value=Opener()):
            with self.assertRaisesRegex(ValueError,'RECEIPT_API_OUTCOME_UNCERTAIN'):receipt_api.call(CONFIG,'POST',body={'command':{}})
        self.assertEqual(calls,['POST'],'one POST only')


if __name__=='__main__':unittest.main()
