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


    def test_directory_snapshot_reads_once_and_keeps_fail_closed_checks(self):
        from mw_integration_agent.receipt_run import Directory
        from mw_integration_agent.statement_delivery import InstagramDeliveryError
        api=API(page(('123','Noey'),('456','partner'),('456','other')))
        directory=Directory({'instagram_account_id':'999'},api)
        self.assertEqual(directory.identity({'instagram_account_id':'999'},'123')['username'],'noey')
        with self.assertRaises(ReceiptInvalid):directory.identity({'instagram_account_id':'999'},'456')
        with self.assertRaises(InstagramDeliveryError):directory.recipient(None,{'username':'noey2'})
        self.assertEqual(len(api.calls),1)

    def test_directory_failure_is_not_cached(self):
        from mw_integration_agent.receipt_run import Directory
        class Flaky(API):
            def request(self,path,query):
                if not self.calls:self.calls.append(query);raise ConfigurationError('IG_UNAVAILABLE')
                return super().request(path,query)
        api=Flaky(page(('123','Noey')))
        directory=Directory({'instagram_account_id':'999'},api)
        with self.assertRaises(ConfigurationError):directory.identity({'instagram_account_id':'999'},'123')
        self.assertEqual(directory.identity({'instagram_account_id':'999'},'123')['username'],'noey')
        directory.identity({'instagram_account_id':'999'},'123')
        self.assertEqual(len(api.calls),2)  # failure, then one cached success

if __name__=='__main__': unittest.main()
