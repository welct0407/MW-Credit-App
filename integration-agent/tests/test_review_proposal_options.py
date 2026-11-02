"""R112 Release 3: the receipt agent's pay-forward options proposal (new file; Byte owns the code).
Config switch (default off): config['pay_forward_options_enabled']=True (flat, like the other *_enabled switches). With the switch off the proposal is today's
'Overpayment review' hold. With it on, a slip above what is due (or with nothing due) that passed payer, amount and account
becomes the action 'Pay forward options' whose numbers come from pwa_pay_forward_plan_v1 (read_query is mocked here; the real
SQL runs in scripts/database/Test-AgentReceiptPayForward.sql and the integration test). """
import json
import unittest
from unittest.mock import patch
from mw_integration_agent.review_proposal import plan

ON={'pay_forward_options_enabled':True,'partner_review_execution_enabled':True,'database_enabled':True}
DAY='2026-11-03'
B={'id':'b','username':'borrower','enabled':True,'name_en':'Manee','name_th':'มาณี'}
LOAN={'id':'L1','status':'ยังไม่ปิดยอด','type':'ดอกเบี้ยรายวัน','auto':True,'principal':'2333','daily':'70','date':'2026-10-25','loan_key':'L-0398'}


def receipt(amount):return {'amount':str(amount),'date':DAY,'time':'12:10','reference':'TESTREF','account_id':'a','account_label':'Test'}
def facts(due):
    charges=[{'id':'c1','loan':'L1','date':DAY,'principal':'0','interest':str(due)}] if due else []
    return {'loans':[dict(LOAN)],'charges':charges}
def forward_plan(rows,covered_through='2026-11-05',uncovered='0',settles=()):
    return {'dueTotal':'300','remainder':'1200','uncovered':uncovered,'settles':list(settles),'blocked':[],
            'paidThrough':{'L1':covered_through},'forward':[{'loanId':'L1','chargeDate':f'2026-11-0{4+i}','interestDue':'70','principalDue':'0','partial':False} for i in range(rows)],
            'allocations':[],'materialize':[],'principal':[],'options':[{'kind':'raise','loanId':'L1','dailyBefore':'70','outstanding':'2333','accruedInterest':'0'}]}
def principal_plan(settles=()):
    return {'dueTotal':'300','remainder':'1200','uncovered':'0','settles':list(settles),'blocked':[],'paidThrough':{},'forward':[],'allocations':[],'materialize':[],
            'principal':[] if settles else [{'loanId':'L1','kind':'raise','amount':'1200','outstandingBefore':'2333','outstandingAfter':'1133','dailyAfter':'66','nextChargeDate':'2026-11-04','nextChargeAmount':'66'}]}


def planner(forward,principal):
    def read(config,sql,variables=None):
        # The SQL text is constant; the purpose travels in the variables (compact JSON), a principal purpose names an amount.
        return principal if '"amount"' in (variables or {}).get('purpose','') else forward
    return read


class OptionsProposalTests(unittest.TestCase):
    def test_switch_off_keeps_todays_overpayment_review_hold(self):
        proposal=plan(receipt(1500),B,facts(300),DAY)
        self.assertEqual(proposal['action'],'Overpayment review');self.assertEqual(proposal['approved_allocation_method'],'Lump Sum')
        self.assertNotIn('options',proposal)
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=AssertionError('no plan read while the switch is off')):
            self.assertEqual(plan(receipt(1500),B,facts(300),DAY)['action'],'Overpayment review')

    def test_switch_on_above_due_offers_options_from_the_plan(self):
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(4),principal_plan())):
            proposal=plan(receipt(1500),B,facts(300),DAY,config=ON)
        self.assertEqual(proposal['action'],'Pay forward options')
        text=json.dumps(proposal,ensure_ascii=False)
        self.assertIn('planSha256',text);self.assertIn('2026-11-05',text);self.assertIn('66',text)

    def test_nothing_due_still_offers_options(self):
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(4),principal_plan())):
            proposal=plan(receipt(1500),B,facts(0),DAY,config=ON)
        self.assertEqual(proposal['action'],'Pay forward options')

    def test_a_slip_that_matches_what_is_due_posts_without_a_question(self):
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=AssertionError('no plan read for a slip that is due')):
            proposal=plan(receipt(300),B,facts(300),DAY,config=ON)
        self.assertEqual(proposal['action'],'Lump Sum');self.assertNotIn('options',proposal)

    def test_a_refused_option_is_left_out_with_the_reason(self):
        # The remainder would settle the loan: no principal option, the text points to Loan Close.
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(4),principal_plan(settles=['L1']))):
            proposal=plan(receipt(1500),B,facts(300),DAY,config=ON)
        text=json.dumps(proposal,ensure_ascii=False)
        self.assertNotIn('"kind": "raise"',text);self.assertIn('settles',text.lower())
        # Beyond the 93-day horizon the forward option states what is left and points to Loan Close.
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(93,uncovered='400'),principal_plan())):
            proposal=plan(receipt(1500),B,facts(300),DAY,config=ON)
        self.assertIn('400',json.dumps(proposal))

    def test_the_options_are_deterministic_so_the_hash_detects_a_changed_plan(self):
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(4),principal_plan())):
            first=plan(receipt(1500),B,facts(300),DAY,config=ON);second=plan(receipt(1500),B,facts(300),DAY,config=ON)
        with patch('mw_integration_agent.review_proposal.read_query',side_effect=planner(forward_plan(3,covered_through='2026-11-04'),principal_plan())):
            changed=plan(receipt(1500),B,facts(300),DAY,config=ON)
        self.assertEqual(first,second);self.assertNotEqual(first,changed)


if __name__=='__main__':unittest.main()
