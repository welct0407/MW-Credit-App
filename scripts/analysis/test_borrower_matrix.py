"""Synthetic behavioral tests, no connection to production."""
import copy
import datetime as dt
import unittest
from borrower_matrix_simulate import quadrant, late_score, condition_score, weighted_score, repayment_timing, revised_at, RECOMMENDED

DAY=dt.date(2026,9,24)

def charge(day="2026-09-20",principal=100,interest=10):
    return {"Row ID":"c1","Ref Loans":"l1","Charge Date":day,"Principal Due":principal,"Interest Due":interest}

def payment(day="2026-09-20",principal=100,interest=10):
    return {"Row ID":"r1","Ref Loans":"l1","Ref Charges":"c1","Payment Date":day,"Principal Paid":principal,"Interest Paid":interest}

def fixture():
    return {"rows":{"Loans":[{"Row ID":"l1","Ref Borrowers":"b1","Loan Date":"2026-08-01","Close Date":None,"Defaulted":False}],
      "olap_borrowers_analytics":[{"Row ID":"b1","Description":"Synthetic","Has Active Loan":True,"Total Outstanding Principal":100,"Matrix Quadrant":"Star","Matrix Stability Score":100}],
      "Charges":[charge()],"Repayments":[payment()]}}

class MatrixTests(unittest.TestCase):
    def test_four_quadrants(self):
        self.assertEqual([quadrant(True,True),quadrant(False,True),quadrant(True,False),quadrant(False,False)],["Star","Cash Cow","Question Mark","Dog"])
    def test_missing_history_renormalized(self):
        self.assertAlmostEqual(weighted_score(80,None,70,100),(80*.45+70*.20+100*.15)/.8)
    def test_delay_bins(self):
        self.assertEqual([late_score(d) for d in [0,1,2,3,4,7,8]],[100,90,70,70,40,40,10])
    def test_current_bins(self):
        self.assertEqual([condition_score(d) for d in [0,1,2,3,4]],[100,60,40,40,20])
        self.assertEqual(condition_score(0,True),0)
    def test_exact_due_date_payment(self):
        r=repayment_timing(charge(),[payment()],DAY)
        self.assertTrue(r["on_time"]); self.assertEqual(r["late_days"],0)
    def test_partial_then_late_completion(self):
        r=repayment_timing(charge(),[payment(principal=50),payment("2026-09-22",50,0)],DAY)
        self.assertFalse(r["on_time"]);self.assertEqual(r["late_days"],2);self.assertEqual(r["remaining"],0)
    def test_early_payment(self):
        self.assertTrue(repayment_timing(charge(),[payment("2026-09-19")],DAY)["on_time"])
    def test_future_cannot_cure(self):
        r=repayment_timing(charge(),[payment("2026-09-25")],DAY)
        self.assertEqual(r["remaining"],110);self.assertEqual(r["late_days"],4)
    def test_reversal_reopens(self):
        r=repayment_timing(charge(),[payment(),payment("2026-09-22",-100,-10)],DAY)
        self.assertFalse(r["settled"]);self.assertEqual(r["remaining"],110)
    def test_components_not_cross_net(self):
        r=repayment_timing(charge(),[payment(principal=110,interest=0)],DAY)
        self.assertFalse(r["on_time"]);self.assertEqual(r["remaining"],10)
    def test_today_due_is_not_mature(self):
        data=fixture();data["rows"]["Charges"].append({**charge("2026-09-24"),"Row ID":"c2"})
        r=revised_at(data,DAY,current_day=True)[0]
        self.assertEqual(r["counts"]["observations"],1);self.assertEqual(r["components"]["current"],100)
    def test_today_payment_cures_current_not_history(self):
        data=fixture();data["rows"]["Repayments"]=[payment("2026-09-24")]
        r=revised_at(data,DAY,current_day=True)[0]
        self.assertEqual(r["components"]["current"],100);self.assertEqual(r["components"]["recent"],0)
    def test_zero_or_non_cash_obligation_excluded(self):
        data=fixture();data["rows"]["Charges"] += [{**charge(principal=0,interest=0),"Row ID":"c2"},{**charge(principal=100,interest=-100),"Row ID":"c3"}]
        self.assertEqual(revised_at(data,DAY,current_day=True)[0]["counts"]["observations"],1)
    def test_no_recent_obligations_unclassified(self):
        data=fixture();data["rows"]["Charges"]=[]
        self.assertEqual(revised_at(data,DAY,current_day=True)[0]["category"],"Unclassified")
    def test_confidence_not_fabricated(self):
        r=revised_at(fixture(),DAY,current_day=True)[0]
        self.assertFalse(r["sufficient"])
    def test_distinct_due_days_required(self):
        data=fixture();data["rows"]["Charges"]=[{**charge("2026-08-01"),"Row ID":"c"+str(i)} for i in range(3)]
        self.assertFalse(revised_at(data,DAY,current_day=True)[0]["sufficient"])
    def test_history_30_day_boundary(self):
        data=fixture();data["rows"]["Charges"]=[{**charge(str(DAY-dt.timedelta(days=n))),"Row ID":"c"+str(n)} for n in [30,2,1]]
        self.assertTrue(revised_at(data,DAY,current_day=True)[0]["sufficient"])
        data["rows"]["Charges"][0]["Charge Date"]=str(DAY-dt.timedelta(days=29))
        self.assertFalse(revised_at(data,DAY,current_day=True)[0]["sufficient"])
    def test_no_positive_portfolio_contribution(self):
        data=fixture();data["rows"]["Repayments"]=[payment(interest=0)]
        self.assertEqual(revised_at(data,DAY,current_day=True)[0]["category"],"Unclassified")
    def test_recent_default_overrides_high_score(self):
        data=fixture();data["rows"]["Loans"].append({"Row ID":"l2","Ref Borrowers":"b1","Loan Date":"2026-08-01","Close Date":"2026-09-10","Defaulted":True})
        r=revised_at(data,DAY,current_day=True)[0]
        self.assertTrue(r["override"]);self.assertFalse(r["reliable"])
    def test_equal_value_and_score_are_high(self):
        r=revised_at(fixture(),DAY,current_day=True,cutoff=100)[0]
        self.assertEqual(r["value_multiple"],1);self.assertEqual(r["category"],"Star")
    def test_old_debt_cannot_hide_outside_windows(self):
        data=fixture();data["rows"]["Charges"].append({**charge("2025-01-01"),"Row ID":"old"})
        r=revised_at(data,DAY,current_day=True)[0]
        self.assertTrue(r["override"]);self.assertFalse(r["reliable"])
    def test_separate_history_does_not_double_count_recent(self):
        r=revised_at(fixture(),DAY,current_day=True)[0]
        self.assertEqual(r["counts"]["historical"],0);self.assertIsNone(r["components"]["historical"])
    def test_recommended_weights_sum_one(self):
        self.assertAlmostEqual(sum(RECOMMENDED['weights']),1)
    def test_recommended_missing_history(self):
        self.assertAlmostEqual(weighted_score(80,None,90,100,RECOMMENDED['weights']),(80*.45+90*.15+100*.25)/.85)
    def test_current_deterioration_monotonic(self):
        scores=[weighted_score(90,90,90,condition_score(d),RECOMMENDED['weights']) for d in [0,1,2,4]]
        self.assertEqual(scores,sorted(scores,reverse=True))
    def test_recommended_does_not_raise_on_late_payment(self):
        data=fixture();paid=revised_at(data,DAY,current_day=True,**RECOMMENDED)[0]['score']
        data['rows']['Repayments']=[payment('2026-09-22')]
        late=revised_at(data,DAY,current_day=True,**RECOMMENDED)[0]['score']
        self.assertLess(late,paid)
    def test_resolved_outlier_not_entire_delay_component(self):
        data=fixture()
        data['rows']['Charges']=[{**charge('2026-09-01'), 'Row ID':'c'+str(i)} for i in range(10)]
        data['rows']['Repayments']=[{**payment('2026-09-09' if i==0 else '2026-09-01'),'Row ID':'r'+str(i),'Ref Charges':'c'+str(i)} for i in range(10)]
        r=revised_at(data,DAY,current_day=True,**RECOMMENDED)[0]
        self.assertAlmostEqual(r['components']['delay'],91)
        self.assertEqual(r['components']['current'],100)
    def test_severe_guard_matches_displayed_axis(self):
        data=fixture();data['rows']['Charges'].append({**charge('2025-01-01'),'Row ID':'old'})
        r=revised_at(data,DAY,current_day=True,**RECOMMENDED)[0]
        self.assertLessEqual(r['score'],60);self.assertFalse(r['reliable'])

if __name__=="__main__":
    unittest.main()
