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

class SenderUnboundTests(unittest.TestCase):
    """R151: an id in no participants list is told apart from a conflict; `taken` lists every bound username."""
    def test_unbound_id_raises_sender_unbound_with_the_taken_usernames(self):
        from mw_integration_agent.receipt_rules import SenderUnbound
        with self.assertRaises(SenderUnbound) as caught:
            conversation_identity({'instagram_account_id':'999'},'555',API(page(('123','Noey'),('999','business'))))
        self.assertEqual((str(caught.exception),caught.exception.taken),('IG_CONVERSATION_IDENTITY_AMBIGUOUS',frozenset({'noey','business'})))
        self.assertIsInstance(caught.exception,ReceiptInvalid)
        # A conflict stays the plain ambiguity (never SenderUnbound).
        for peers in ([('123','Noey'),('123','other')],[('123','Noey'),('456','Noey')]):
            with self.subTest(peers=peers),self.assertRaises(ReceiptInvalid) as caught:
                conversation_identity({'instagram_account_id':'999'},'123',API(page(*peers)))
            self.assertNotIsInstance(caught.exception,SenderUnbound)


class SenderContextTests(unittest.TestCase):
    """R151 SENDER: the live borrower by evidence username, the identity bound to it, or unbound with the name free."""
    def setUp(self):
        import json
        import tempfile
        from mw_integration_agent.receipt_journal import ReceiptJournal
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        self.j=ReceiptJournal(tmp.name+'/receipt.db');self.addCleanup(self.j.close)
        self.j.db.executescript('''CREATE TABLE conversation_poll_messages (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
          event_time REAL NOT NULL, captured_at REAL NOT NULL, outcome TEXT NOT NULL);''')
        self.j.db.execute("INSERT INTO conversation_poll_messages VALUES ('m','group',1,1,'SENDER')");self.j.db.commit()
        self.config={'instagram_account_id':'999'}
        self.master={'borrowers':[{'id':'b-fahsai','username':'Fahsai','enabled':True},{'id':'b-other','username':'other','enabled':True}]}
        self.job={'id':'j','message_id':'m','sender_id':'555','created_at':1,
                  'result':json.dumps({'sender_borrower_id':'b-fahsai','sender_username':'fahsai'})}

    def context(self,reader):
        from mw_integration_agent.receipt_identity import receipt_context
        return receipt_context(self.config,self.job,self.j,self.master,reader)

    def unbound(self,*taken):
        from mw_integration_agent.receipt_rules import SenderUnbound
        def reader(*_):raise SenderUnbound(taken)
        return reader

    def test_bound_or_unbound_free_username_is_a_strong_sender(self):
        for reader in (lambda *_:{'id':'555','username':'fahsai'},self.unbound('other','business')):
            context=self.context(reader)
            self.assertEqual((context['kind'],context['borrower']['id'],context['candidates']),('sender','b-fahsai',[]))

    def test_taken_username_mismatch_or_changed_borrower_never_resolves(self):
        with self.assertRaisesRegex(ReceiptInvalid,'IG_CONVERSATION_IDENTITY_AMBIGUOUS'):self.context(self.unbound('fahsai'))
        with self.assertRaisesRegex(ReceiptInvalid,'IG_CONVERSATION_IDENTITY_AMBIGUOUS'):self.context(lambda *_:{'id':'555','username':'other'})
        def ambiguous(*_):raise ReceiptInvalid('IG_CONVERSATION_IDENTITY_AMBIGUOUS')
        with self.assertRaisesRegex(ReceiptInvalid,'IG_CONVERSATION_IDENTITY_AMBIGUOUS'):self.context(ambiguous)
        self.master['borrowers'][0]['id']='b-new'
        with self.assertRaisesRegex(ReceiptInvalid,'BORROWER_CHANGED'):self.context(lambda *_:{'id':'555','username':'fahsai'})
        self.master['borrowers'][0].update(id='b-fahsai',enabled=False)
        with self.assertRaisesRegex(ReceiptInvalid,'BORROWER_NOT_UNIQUELY_ENABLED'):self.context(lambda *_:{'id':'555','username':'fahsai'})

    def test_the_poll_row_is_read_with_forwarding_off_and_a_missing_table_is_no_row(self):
        from mw_integration_agent.receipt_identity import poll_row
        self.assertEqual(self.context(lambda *_:{'id':'555','username':'fahsai'})['kind'],'sender')
        import tempfile
        from mw_integration_agent.receipt_journal import ReceiptJournal
        with tempfile.TemporaryDirectory() as temp:
            empty=ReceiptJournal(temp+'/r.db')
            try:self.assertIsNone(poll_row(empty,'m'))
            finally:empty.close()


if __name__=='__main__': unittest.main()
