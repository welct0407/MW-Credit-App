import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('cloud_flyway',Path(__file__).with_name('Invoke-CloudFlyway.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)

class CloudFlywayTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.repo=Path(t.name)
        (self.repo/'database/migrations').mkdir(parents=True)
        (self.repo/'database/migrations/V58__approved.sql').write_text('SELECT 1;')
        (self.repo/'database/flyway.conf').write_text('flyway.cleanDisabled=true')
        targets={n:dict(instance='appsheet-pg-prod-20260914',host='34.21.174.215',database=db,user='postgres') for n,db in [('development','loan_manager_dev'),('production','loan_manager_prod')]}
        (self.repo/'database/environments.json').write_text(json.dumps(targets))
        self.release=dict(commit='pinned',environment='development',validationReference='actual DEV checks',migrations=f.manifest(self.repo))
        self.git=patch.object(f,'git',side_effect=lambda repo,*args:'' if args[0]=='status' else 'pinned');self.git.start();self.addCleanup(self.git.stop)
    def test_complete_pin_manifest_approval_backup_gate(self):
        f.guard(self.repo,self.release,'approval','verified backup',{})
        for bad in [dict(self.release,commit='other'),dict(self.release,migrations=[]),dict(self.release,environment='production'),dict(self.release,validationReference='')]:
            with self.assertRaises(ValueError):f.guard(self.repo,bad,'approval','backup',{})
        for approval,backup in [('', 'backup'),('approval','')]:
            with self.assertRaises(ValueError):f.guard(self.repo,self.release,approval,backup,{})
    def test_dirty_and_ambient_overrides_fail_closed(self):
        with patch.object(f,'git',return_value='dirty'),self.assertRaises(ValueError):f.guard(self.repo,self.release,'a','b',{})
        with self.assertRaises(ValueError):f.guard(self.repo,self.release,'a','b',{'FLYWAY_INIT_SQL':'bad'})
    def test_mutated_sql_and_target_identity_fail_closed(self):
        (self.repo/'database/migrations/V58__approved.sql').write_text('SELECT 2;')
        with self.assertRaisesRegex(ValueError,'hashes'):f.guard(self.repo,self.release,'a','b',{})
        self.release['migrations']=f.manifest(self.repo)
        (self.repo/'database/environments.json').write_text('{}')
        with self.assertRaises((KeyError,ValueError)):f.guard(self.repo,self.release,'a','b',{})
    def test_duplicate_normalized_versions_fail(self):
        (self.repo/'database/migrations/V58_0__duplicate.sql').write_text('SELECT 1;')
        with self.assertRaisesRegex(ValueError,'Duplicate'):f.manifest(self.repo)
    def test_dispatch_reuses_owned_tunnel_and_isolates_password(self):
        helper=SimpleNamespace(WRAPPER='/fixed/cloud-run');original=Mock()
        argv=['/fixed/cloud-run','psql','-h','127.0.0.1','-p','12345','-U','postgres','-d','loan_manager_prod','-c','SELECT 1']
        env={'PGPASSWORD':'FAKE-PASSWORD','PGOPTIONS':'anything','PATH':'/bin'}
        f.dispatch(helper,original,'session',argv,env,['iap','sql'],True,None,['FAKE-PASSWORD'],'SQL PROD',self.repo,'prod','migrate')
        args=original.call_args.args;command=args[1];child=args[2]
        self.assertIn('flyway',command);self.assertIn('-outputType=json',command)
        self.assertTrue(any('127.0.0.1:12345/loan_manager_prod?sslmode=prefer' in x for x in command))
        self.assertNotIn('FAKE-PASSWORD',' '.join(command));self.assertEqual(child['FLYWAY_PASSWORD'],'FAKE-PASSWORD')
        self.assertNotIn('PGPASSWORD',child);self.assertNotIn('PGOPTIONS',child);self.assertEqual(args[3],['iap','sql'])
        self.assertEqual(env['PGPASSWORD'],'FAKE-PASSWORD')
    def test_unexpected_transport_or_secret_configuration_fails(self):
        helper=SimpleNamespace(WRAPPER='/fixed/cloud-run');original=Mock()
        bad=['/fixed/cloud-run','psql','-p','12345','-U','postgres','-d','wrong','-c','SELECT 1']
        with self.assertRaises(ValueError):f.dispatch(helper,original,None,bad,{},[],True,None,[],'SQL PROD',self.repo,'prod','migrate')
        self.assertFalse(original.called)
        bad[bad.index('wrong')]='loan_manager_prod';(self.repo/'database/flyway.conf').write_text('FAKE-SECRET')
        with self.assertRaises(ValueError):f.dispatch(helper,original,None,bad,{'PGPASSWORD':'FAKE-SECRET'},[],True,None,['FAKE-SECRET'],'SQL PROD',self.repo,'prod','migrate')
        self.assertFalse(original.called)
    def test_only_exact_v58_pending_and_no_invalid_states(self):
        f.pending({'migrations':[{'state':'Success','version':'57'},{'state':'Pending','version':'58'}]},'58')
        for rows in [[],[{'state':'Pending','version':'59'}],[{'state':'Failed','version':'58'}],[{'state':'Pending','version':'58'},{'state':'Pending','version':'59'}]]:
            with self.assertRaises(ValueError):f.pending({'migrations':rows},'58')
        with self.assertRaises(ValueError):f.pending({'migrations':[{'state':'Pending','version':'58'}]},None)
    def test_modified_transport_never_connects(self):
        with patch.object(f,'HELPER_SHA','0'*64),self.assertRaisesRegex(ValueError,'transport changed'):
            f.run(self.repo,'prod','migrate',{})

    def test_public_host_or_unowned_tunnel_cannot_use_exception(self):
        helper=SimpleNamespace(WRAPPER='/fixed/cloud-run');original=Mock()
        argv=['/fixed/cloud-run','psql','-h','34.21.174.215','-p','12345','-U','postgres','-d','loan_manager_prod','-c','SELECT 1']
        with self.assertRaises(ValueError):f.dispatch(helper,original,None,argv,{},['iap','sql'],True,None,[],'SQL PROD',self.repo,'prod','validate')
        argv[3]='127.0.0.1'
        with self.assertRaises(ValueError):f.dispatch(helper,original,None,argv,{},[],True,None,[],'SQL PROD',self.repo,'prod','validate')
        self.assertFalse(original.called)

    def test_pending_validation_exception_never_reaches_migrate(self):
        helper=SimpleNamespace(WRAPPER='/fixed/cloud-run');original=Mock()
        argv=['/fixed/cloud-run','psql','-h','127.0.0.1','-p','12345','-U','postgres','-d','loan_manager_prod','-c','SELECT 1']
        for target,action in [('prod','migrate'),('dev','validate')]:
            with self.assertRaises(ValueError):f.dispatch(helper,original,None,argv,{'PGPASSWORD':'fake'},['iap','sql'],True,None,[],'SQL '+target.upper(),self.repo,target,action,True)
        self.assertFalse(original.called)
        f.dispatch(helper,original,None,argv,{'PGPASSWORD':'fake'},['iap','sql'],True,None,[],'SQL PROD',self.repo,'prod','validate',True)
        self.assertIn('-ignoreMigrationPatterns=*:pending',original.call_args.args[1])
