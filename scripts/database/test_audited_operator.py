import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('operator_runner',Path(__file__).with_name('Invoke-AuditedInterestReallocation.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)


class AuditedCloudOperatorTests(unittest.TestCase):
    def setUp(self):
        self.value={'kind':'interest-reallocation-v2','operation_id':'00000000-0058-4000-8000-000000000001',
            'database':'loan_manager_prod','payment':'synthetic','receipt':{},'moves':[{}],
            'reason':'synthetic owner request','code_version':'synthetic','actor_id':'operator-label',
            'actor_login':'operator-label','authorization_reference':'synthetic-approval'}
        self.digest=hashlib.sha256(runner.canonical(self.value).encode()).hexdigest()
    def output(self,value):return subprocess.CompletedProcess([],0,json.dumps(value),'')
    def prepared(self):return self.output({'prepared':True,'operation_id':self.value['operation_id'],
        'plan_sha256':self.digest,'business_writes':0})
    def observed(self,state='COMMITTED'):return self.output({'operation_id':self.value['operation_id'],'state':state,'replay_permitted':False})
    def test_missing_intent_and_duplicate_attempt_never_reach_sql(self):
        run=Mock(return_value=subprocess.CompletedProcess([],1,'','private failure'))
        with self.assertRaises(RuntimeError):runner.execute(self.value,'synthetic-approval',run)
        self.assertEqual(run.call_count,1)
        self.assertNotIn('sql',run.call_args.args[0])
    def test_hash_mismatch_prohibits_business_dispatch(self):
        p=json.loads(self.prepared().stdout);p['plan_sha256']='0'*64
        run=Mock(return_value=self.output(p))
        with self.assertRaises(RuntimeError):runner.execute(self.value,'synthetic-approval',run)
        self.assertEqual(run.call_count,1)
    def test_prepare_precedes_exactly_one_sql_and_independent_observation(self):
        stages=[]
        def run(argv,**kw):
            stages.append('sql' if 'sql' in argv else ('prepare' if 'import prepare' in argv[-1] else 'observe'))
            if stages[-1]=='sql':
                path=Path(argv[-1]);self.assertEqual(path.stat().st_mode&0o777,0o600)
                self.assertIn('reallocate_payment_interest_audited',path.read_text())
                return subprocess.CompletedProcess(argv,0,'applied','')
            return self.prepared() if stages[-1]=='prepare' else self.observed()
        self.assertEqual(runner.execute(self.value,'synthetic-approval',run)['state'],'COMMITTED')
        self.assertEqual(stages,['prepare','sql','observe'])
    def test_lost_sql_ack_observes_commit_without_replay(self):
        run=Mock(side_effect=[self.prepared(),TimeoutError(),self.observed()])
        self.assertEqual(runner.execute(self.value,'synthetic-approval',run)['state'],'COMMITTED')
        self.assertEqual(run.call_count,3)
    def test_absent_marker_stays_unknown_without_retry(self):
        run=Mock(side_effect=[self.prepared(),subprocess.CompletedProcess([],1,'','private failure'),self.observed('UNKNOWN')])
        self.assertEqual(runner.execute(self.value,'synthetic-approval',run)['state'],'UNKNOWN')
        self.assertEqual(run.call_count,3)
    def test_wrong_approval_and_wrong_target_never_connect(self):
        run=Mock()
        with self.assertRaises(ValueError):runner.execute(self.value,'different-approval',run)
        with self.assertRaises(ValueError):runner.execute(dict(self.value,database='loan_manager_dev'),'synthetic-approval',run)
        run.assert_not_called()

    def test_observation_of_different_operation_never_reports_success(self):
        bad=json.loads(self.observed().stdout);bad['operation_id']='00000000-0058-4000-8000-000000000002'
        run=Mock(side_effect=[self.prepared(),subprocess.CompletedProcess([],0,'',''),self.output(bad)])
        with self.assertRaisesRegex(RuntimeError,'Invalid outcome evidence'):
            runner.execute(self.value,'synthetic-approval',run)
        self.assertEqual(run.call_count,3)
