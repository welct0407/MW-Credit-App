import unittest
from unittest.mock import patch
from mw_integration_agent.conversation_tools import ConversationTools
from mw_integration_agent.config import ConfigurationError

class DeleteCompatibility(unittest.TestCase):
    def setUp(self):
        self.bridge=ConversationTools(lambda:{},None,'synthetic','Delete this row')
        self.args={'app':'appsheet_delete','table':'Borrowers','action':'Edit','row_id':'b1',
                   'row_json':'{"owning_app":"oltp"}','expected_final_json':'{}',
                   'operation_key':'delete-1','observation':'before','instruction_quote':'Delete this row'}

    def test_old_thread_alias_preserves_current_turn_verification(self):
        with patch('mw_integration_agent.conversation_write.api_action',return_value={'state':'VERIFIED','operation':'synthetic'}) as action:
            result=self.bridge.dispatch('api_action',self.args)
        sent=action.call_args.args[1]
        self.assertEqual((sent['app'],sent['action'],sent['row_json']),('oltp','Delete','{}'))
        self.assertEqual(self.bridge.observations[result['observation']]['state'],'VERIFIED')

    def test_alias_cannot_smuggle_fields(self):
        with self.assertRaises(ConfigurationError):
            self.bridge.dispatch('api_action',{**self.args,'row_json':'{"owning_app":"oltp","City":"unsafe"}'})
