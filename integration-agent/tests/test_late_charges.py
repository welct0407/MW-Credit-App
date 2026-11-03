"""R118: the receipt agent's late-charge sums and wording (synthetic facts only)."""
import unittest
from mw_integration_agent import partner_review, review_proposal


class LateChargeTests(unittest.TestCase):
    def test_a_charge_owes_principal_interest_and_late_charge(self):
        charge={'principal':'0','interest':'100','late':'50','date':'2026-11-03'}
        self.assertEqual(str(review_proposal.owed(charge)),'150')
        self.assertEqual(str(review_proposal.owed({'principal':'0','interest':'100','date':'2026-11-03'})),'100','facts before V132')
        self.assertEqual(review_proposal.due_charges({'charges':[{'principal':'0','interest':'0','late':'50','date':'2026-11-02'}]},'2026-11-03')[0]['late'],'50',
                         'a late-charge-only charge is due')

    def test_the_request_names_interest_and_late_charge(self):
        options={'dueTotal':'150','duePrincipal':'0','dueInterest':'100','dueLate':'50'}
        self.assertEqual(partner_review.due_parts(options,False),' (Interest ฿100 + Late charge ฿50)')
        self.assertEqual(partner_review.due_parts(options,True),' (ดอกเบี้ย ฿100 + ค่าปรับล่าช้า ฿50)')
        self.assertEqual(partner_review.due_parts({'dueTotal':'100'},False),'','no late charge: the request reads as before')
        self.assertEqual(partner_review.due_parts({**options,'duePrincipal':'200'},False),' (Principal ฿200 + Interest ฿100 + Late charge ฿50)')


if __name__=='__main__':
    unittest.main()
