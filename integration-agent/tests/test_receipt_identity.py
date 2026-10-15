import unittest

from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.receipt_rules import ReceiptInvalid,borrower_for
from mw_integration_agent.receipt_run import conversation_identity


def page(*peers,more=False):
    result={'data':[{'participants':{'data':[{'id':i,'username':n} for i,n in peers]}}]}
    if more: result['paging']={'next':'unused','cursors':{'after':'cursor'}}
    return result


class API:
    def __init__(self,*pages): self.pages=list(pages);self.calls=[]
    def request(self,path,query):
        # A profile call would fail this assertion, reproducing Noey's consent restriction.
        assert path=='999/conversations'
        self.calls.append(query)
        return self.pages.pop(0)


class ReceiptIdentityTests(unittest.TestCase):
    def test_sender_binding_without_profile_permission(self):
        api=API(page(('123','Noey'),('999','business')))
        result=conversation_identity({'instagram_account_id':'999'},'123',api)
        self.assertEqual(result,{'id':'123','username':'noey'})
        self.assertEqual(borrower_for(result,[{'id':'b','username':'@NOEY','enabled':True}])['id'],'b')

    def test_pagination_and_repeated_same_group_member(self):
        api=API(page(('123','Noey'),more=True),page(('123','Noey')))
        self.assertEqual(conversation_identity({'instagram_account_id':'999'},'123',api)['username'],'noey')
        self.assertEqual(api.calls[1]['after'],'cursor')

    def test_missing_or_conflicting_bindings_rejected(self):
        for peers in ([],[('456','Noey')],[('123','Noey'),('123','other')],
                      [('123','Noey'),('456','Noey')]):
            with self.subTest(peers=peers),self.assertRaises(ReceiptInvalid):
                conversation_identity({'instagram_account_id':'999'},'123',API(page(*peers)))

    def test_incomplete_directory_rejected(self):
        p=page(('123','Noey'));p['data'][0]['participants']['paging']={'next':'more'}
        with self.assertRaises(ConfigurationError):
            conversation_identity({'instagram_account_id':'999'},'123',API(p))


if __name__=='__main__': unittest.main()
