import unittest
from mw_integration_agent.receipt_health import assess
from mw_integration_agent.receipt_hold import event_key


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.now=10000
        self.job={'id':'j','status':'PENDING','detail':'','created_at':9990}
        self.review={'id':'r','job_id':'j','state':'PENDING','created_at':9990}
    def notice(self,event,ig='ACCEPTED',email='PENDING'):
        return dict(event_key=event,ig_status=ig,email_status=email,detail='')
    def test_empty_and_recent_queue_is_healthy(self):
        self.assertEqual(assess([],[],[],self.now)['status'],1)
        self.assertEqual(assess([self.job],[],[],self.now)['status'],1)
    def test_activity_counts_do_not_make_normal_waiting_unhealthy(self):
        health=assess([self.job],[self.review],[],self.now)
        self.assertEqual((health['status'],health['pending_images'],health['pending_reviews']),(1,1,1))
        self.assertEqual(health['oldest_pending_seconds'],10)
    def test_stalled_queue_and_missing_review_are_degraded(self):
        for status in ('PENDING','VALIDATED','REVIEW_REQUESTED'):
            j=dict(self.job,status=status,created_at=9000)
            self.assertEqual(assess([j],[],[],self.now)['stalled_jobs'],1)
    def test_hold_requires_delivered_alert_including_historical_hold(self):
        j=dict(self.job,status='REVIEW',detail='AMOUNT_UNREADABLE',created_at=1)
        self.assertEqual(assess([j],[],[],self.now)['unnotified_holds'],1)
        for notice in (self.notice(event_key(j)),self.notice(event_key(j),'UNAVAILABLE','SENT')):
            self.assertEqual(assess([j],[],[notice],self.now)['status'],1)
    def test_pending_review_delivery_and_overdue_thresholds(self):
        r=dict(self.review,created_at=9000)
        self.assertEqual(assess([],[r],[],self.now)['undelivered_reviews'],1)
        self.assertEqual(assess([],[r],[self.notice('review:r')],self.now)['status'],1)
        r['created_at']=1
        self.assertEqual(assess([],[r],[self.notice('review:r')],self.now)['overdue_reviews'],1)
    def test_unknown_posting_stays_degraded_even_after_notification(self):
        for state in ('POSTING','UNKNOWN'):
            r=dict(self.review,state=state)
            self.assertEqual(assess([],[r],[self.notice('review-result:r:UNKNOWN')],self.now)['unconfirmed_postings'],1)
    def test_failed_partner_result_is_detected_despite_other_success(self):
        r=dict(self.review,state='POSTED',created_at=9000)
        notices=[self.notice('review-result:r:POSTED'),self.notice('review-result:r:POSTED','UNKNOWN','UNKNOWN')]
        self.assertGreater(assess([],[r],notices,self.now)['failed_notifications'],0)
        notices[1]['email_status']='SENT'
        self.assertEqual(assess([],[r],notices,self.now)['status'],1)
    def test_superseded_error_notice_does_not_mask_completed_payment(self):
        r=dict(self.review,state='POSTED',created_at=9000)
        notices=[self.notice('review-result:r:UNKNOWN','UNKNOWN','UNKNOWN'),self.notice('review-result:r:POSTED')]
        self.assertEqual(assess([],[r],notices,self.now)['status'],1)

    def test_resend_delivery_counts_without_resetting_overdue_clock(self):
        r=dict(self.review,created_at=1)
        n=self.notice('review:r:resend:'+'a'*64)
        health=assess([],[r],[n],self.now)
        self.assertEqual(health['undelivered_reviews'],0)
        self.assertEqual(health['overdue_reviews'],1)
