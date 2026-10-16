import contextlib
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('cloud_flyway',Path(__file__).with_name('Invoke-CloudFlyway.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)


def rows(*pairs):
    return {'migrations':[{'version':v,'state':s} for v,s in pairs]}


class CloudFlywayTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.repo=Path(t.name)
        (self.repo/'database/migrations').mkdir(parents=True)
        for n in (92,93,94):(self.repo/f'database/migrations/V{n}__synthetic.sql').write_text(f'SELECT {n};')
        (self.repo/'database/flyway.conf').write_text('flyway.cleanDisabled=true')
        (self.repo/'database/toolchain.json').write_text(json.dumps({'flywayVersion':'13.6.0'}))
        flyway=self.repo/'tools/flyway-13.6.0/flyway';flyway.parent.mkdir(parents=True);flyway.write_text('')
        self.environ={'MW_DB_TOOL_ROOT':str(self.repo/'tools'),'PATH':'/bin','PGPASSWORD':'ambient-should-not-pass'}
        targets={n:dict(instance='mw-credit-pg-20261017',host='136.85.127.134',database=db,user='postgres') for n,db in [('development','loan_manager_dev'),('production','loan_manager_prod')]}
        (self.repo/'database/environments.json').write_text(json.dumps(targets))
        self.release=dict(commit='pinned',environment='development',validationReference='actual DEV checks',migrations=f.manifest(self.repo))
        self.git=patch.object(f,'git',side_effect=lambda repo,*args:'' if args[0]=='status' else 'pinned');self.git.start();self.addCleanup(self.git.stop)

    # Release guard (unchanged behaviour)
    def test_complete_pin_manifest_approval_backup_gate(self):
        f.guard(self.repo,self.release,'approval','verified backup',{})
        for bad in [dict(self.release,commit='other'),dict(self.release,migrations=[]),dict(self.release,environment='production'),dict(self.release,validationReference='')]:
            with self.assertRaises(ValueError):f.guard(self.repo,bad,'approval','backup',{})
        for approval,backup in [('', 'backup'),('approval','')]:
            with self.assertRaises(ValueError):f.guard(self.repo,self.release,approval,backup,{})
    def test_dirty_and_ambient_overrides_fail_closed(self):
        with patch.object(f,'git',return_value='dirty'),self.assertRaises(ValueError):f.guard(self.repo,self.release,'a','b',{})
        with self.assertRaises(ValueError):f.guard(self.repo,self.release,'a','b',{'FLYWAY_INIT_SQL':'bad'})
        with self.assertRaises(ValueError):f.run(self.repo,'dev','validate',{'FLYWAY_URL':'jdbc:postgresql://elsewhere/db'})
    def test_mutated_sql_and_target_identity_fail_closed(self):
        (self.repo/'database/migrations/V94__synthetic.sql').write_text('SELECT 2;')
        with self.assertRaisesRegex(ValueError,'hashes'):f.guard(self.repo,self.release,'a','b',{})
        self.release['migrations']=f.manifest(self.repo)
        (self.repo/'database/environments.json').write_text('{}')
        with self.assertRaises((KeyError,ValueError)):f.guard(self.repo,self.release,'a','b',{})
    def test_duplicate_normalized_versions_fail(self):
        (self.repo/'database/migrations/V94_0__duplicate.sql').write_text('SELECT 1;')
        with self.assertRaisesRegex(ValueError,'Duplicate'):f.manifest(self.repo)

    # DB-BACKUP-04: manifest-driven pending set (the old pending() accepted only V58)
    def test_manifest_driven_pending_set(self):
        info=rows(('1','Baseline'),('92','Success'),('93','Pending'),('94','Pending'))
        self.assertEqual(f.pending(info,self.release['migrations']),['93','94'])
        self.assertEqual(f.pending(rows(('92','Success'),('93','Success'),('94','Pending')),self.release['migrations']),['94'])
    def test_pending_outside_manifest_or_missing_from_info_fails(self):
        with self.assertRaises(ValueError):f.pending(rows(('92','Success'),('93','Pending'),('94','Pending'),('95','Pending')),self.release['migrations'])
        with self.assertRaises(ValueError):f.pending(rows(('92','Success'),('94','Pending')),self.release['migrations'])
        with self.assertRaises(ValueError):f.pending(rows(('92','Success'),('94','Pending'),('93','Pending')),self.release['migrations'])
    def test_failed_outdated_or_missing_states_fail(self):
        for state in ('Failed','Outdated','Missing','Future','Ignored'):
            with self.assertRaises(ValueError):f.pending(rows(('92','Success'),('93',state),('94','Pending')),self.release['migrations'])
    def test_nothing_pending_check(self):
        self.assertEqual(f.pending(rows(('1','Ignored (Baseline)'),('92','Success'),('93','Success'),('94','Success')),None),[])
        self.assertEqual(f.pending(rows(('92','Success'),('93','Success'),('94','Success')),self.release['migrations']),[])
        with self.assertRaises(ValueError):f.pending(rows(('92','Success'),('93','Pending')),None)

    # Transport and identity (DB-ACCESS-03: read identity by default)
    def run_with(self,target,action,stdout,**kw):
        calls=[];secrets=Mock(side_effect=lambda argv:'TOKEN' if 'generate-login-token' in argv else 'ADMIN-SECRET')
        def execute(argv,**opts):
            calls.append((argv,opts));return SimpleNamespace(returncode=0,stdout=json.dumps(stdout))
        @contextlib.contextmanager
        def tunnel(repo,environ):yield 15432
        result=f.run(self.repo,target,action,self.environ,execute=execute,secrets=secrets,tunnel_factory=tunnel,**kw)
        return result,calls,secrets
    def test_reads_use_read_identity_token_and_read_only_session(self):
        result,calls,secrets=self.run_with('dev','validate',{'validationSuccessful':True})
        argv,opts=calls[0]
        self.assertEqual(result['_identity'],'codex-cloud-read@clever-oasis-508610-n7.iam')
        self.assertIn('-user=codex-cloud-read@clever-oasis-508610-n7.iam',argv)
        self.assertIn('--impersonate-service-account=codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com',secrets.call_args.args[0])
        self.assertTrue(any('127.0.0.1:15432/loan_manager_dev?sslmode=disable' in x for x in argv))
        self.assertTrue(any('default_transaction_read_only=on' in x for x in argv))
        self.assertEqual(opts['env']['FLYWAY_PASSWORD'],'TOKEN');self.assertNotIn('PGPASSWORD',opts['env'])
        self.assertNotIn('TOKEN',' '.join(argv));self.assertEqual(argv[-1],'validate')
    def test_admin_credential_only_for_grouped_production_migrate(self):
        with self.assertRaisesRegex(ValueError,'grouped'):self.run_with('prod','migrate',{'success':True})
        result,calls,secrets=self.run_with('prod','migrate',{'success':True},transaction=f.GROUPED)
        argv,opts=calls[0]
        self.assertEqual(result['_identity'],'postgres');self.assertIn('-user=postgres',argv)
        self.assertIn('--secret=mw-credit-ops-cloudsql-postgres-admin',secrets.call_args.args[0])
        self.assertEqual(argv[-4:],f.GROUPED+['migrate']);self.assertNotIn('ADMIN-SECRET',' '.join(argv))
        self.assertFalse(any('default_transaction_read_only' in x for x in argv))
        with self.assertRaises(ValueError):self.run_with('prod','validate',{'validationSuccessful':True},transaction=f.GROUPED)
    def test_pending_validation_exception_never_reaches_migrate(self):
        for target,action in [('prod','migrate'),('dev','validate')]:
            with self.assertRaises(ValueError):f.command(self.repo,'flyway',15432,target,action,'u',True,f.GROUPED if action=='migrate' else ())
        argv=f.command(self.repo,'flyway',15432,'prod','validate','u',True)
        self.assertIn('-ignoreMigrationPatterns=*:pending',argv)
    def test_failed_or_wrong_database_results_fail(self):
        with self.assertRaises(ValueError):self.run_with('dev','validate',{'validationSuccessful':False})
        with self.assertRaises(ValueError):self.run_with('dev','info',{'database':'loan_manager_prod','migrations':[]})
        with self.assertRaises(ValueError):self.run_with('dev','info',{'error':{'message':'x'}})
    def test_tunnel_closes_only_what_it_opened(self):
        opener=Mock();closer=Mock()
        with f.tunnel(self.repo,{},opener=opener,closer=closer,probe=lambda port:True) as port:self.assertEqual(port,15432)
        opener.assert_not_called();closer.assert_not_called()
        with f.tunnel(self.repo,{'MW_DB_TUNNEL_PORT':'15999'},opener=opener,closer=closer,probe=lambda port:False):pass
        self.assertIn('cloud-db-tunnel.sh',opener.call_args.args[0][1])
        self.assertEqual(closer.call_args.args[0],['pkill','-f','127.0.0.1:15999:127.0.0.1:5432'])
    def test_production_package_requires_pinned_grouped_release_and_preflight(self):
        preflight=self.repo/'preflight.json';preflight.write_text('{}')
        pin={'group':True,'mixed':False,'executeInTransaction':True,'callbacks':[],'baselineVersion':92,'targetVersion':94,'connectPreflightSha256':hashlib.sha256(b'{}').hexdigest()}
        ok=Mock(return_value=SimpleNamespace(returncode=0,stdout='-group=true -mixed=false -executeInTransaction=true\n'))
        args,baseline=f.transaction_arguments(self.repo,{**self.release,'productionTransaction':pin,'_path':'r.json'},preflight,execute=ok)
        self.assertEqual((args,baseline),(f.GROUPED,(92,)));self.assertIn('Assert-ProductionTransactionPackage',ok.call_args.args[0][-1])
        for bad in [dict(pin,group=False),dict(pin,callbacks=['x']),dict(pin,connectPreflightSha256='0'*64)]:
            with self.assertRaises(ValueError):f.transaction_arguments(self.repo,{**self.release,'productionTransaction':bad,'_path':'r.json'},preflight,execute=ok)
        with self.assertRaises(ValueError):f.transaction_arguments(self.repo,{**self.release,'_path':'r.json'},preflight,execute=ok)
        refused=Mock(return_value=SimpleNamespace(returncode=1,stdout=''))
        with self.assertRaises(ValueError):f.transaction_arguments(self.repo,{**self.release,'productionTransaction':pin,'_path':'r.json'},preflight,execute=refused)


if __name__=='__main__':
    unittest.main()
