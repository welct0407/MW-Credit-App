import io
import json
import unittest
from unittest.mock import Mock,patch
from mw_integration_agent import conversation_api as api
from mw_integration_agent.config import ConfigurationError


class Response(io.BytesIO):
    status=200


class ConversationApiTests(unittest.TestCase):
    def setUp(self):
        origin='https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
        self.config={'conversation_api_enabled':True,'conversation_api_environment':'prod','database_name':'loan_manager_prod',
                     'conversation_api_origin':origin,'conversation_api_audience':origin,'conversation_api_manifest_sha256':'a'*64}

    def test_new_command_identity_is_stable_separate_and_environment_bound(self):
        from mw_integration_agent.receipt_api import request_id as receipt_id
        current=api.request_id('prod','full-message-identity','step_1')
        self.assertEqual(current,api.request_id('prod','full-message-identity','step_1'))
        self.assertNotEqual(current,api.request_id('dev','full-message-identity','step_1'))
        self.assertNotEqual(current,api.request_id('prod','different-message','step_1'))
        self.assertNotEqual(current,receipt_id('prod','full-message-identity'))
        self.assertRegex(current,r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')

    def test_default_off_and_exact_environment(self):
        api.validate({})
        for change in [{'conversation_api_enabled':False},{'conversation_api_origin':'https://www.appsheet.com'},
                       {'conversation_api_manifest_sha256':None},{'database_name':'loan_manager_dev'}]:
            opener=Mock()
            with self.assertRaises(ConfigurationError):api.call(dict(self.config,**change),'catalogue',{},opener=opener)
            opener.open.assert_not_called()

    def test_status_get_uses_exact_identity_once_and_never_posts_or_retries(self):
        opener=Mock();opener.open.side_effect=[Response(b'a.b.c'),Response(b'{"kind":"unresolved"}')]
        status,value=api.call(self.config,'status',request_id='11111111-1111-4111-8111-111111111111',opener=opener)
        self.assertEqual((status,value),(200,{'kind':'unresolved'}))
        request=opener.open.call_args_list[1].args[0]
        self.assertEqual(request.method,'GET');self.assertIsNone(request.data)
        self.assertNotIn('appsheet.com',request.full_url);self.assertEqual(opener.open.call_count,2)
        opener=Mock();opener.open.side_effect=[Response(b'a.b.c'),TimeoutError()]
        with self.assertRaises(ConfigurationError):api.call(self.config,'commands',{'version':1},opener=opener)
        self.assertEqual(opener.open.call_count,2)

    def test_probe_print_contract_contains_no_records_or_actor(self):
        with patch.object(api,'call',side_effect=[(200,{'manifestSha256':'a'*64}),(200,{'rows':[{'Row ID':'private-partner'}]})]) as call:
            result=api.probe(dict(self.config,conversation_api_probe_partner_id='private-actor'),'oltp')
        self.assertEqual(result,{'authenticated':True,'scope':'oltp','count':1,'targetVersion':'a'*64})
        self.assertNotIn('private',json.dumps(result))
        self.assertEqual(call.call_args.args[2]['columns'],['Row ID']);self.assertEqual(call.call_args.args[2]['limit'],1)


if __name__=='__main__':unittest.main()
