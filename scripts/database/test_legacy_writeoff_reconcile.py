import contextlib
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('legacy_reconcile',Path(__file__).with_name('Invoke-LegacyWriteoffReconcile.py'))
op=importlib.util.module_from_spec(spec);spec.loader.exec_module(op)
SECRET='synthetic-admin-secret'


class Runner:
    """Records psql calls and answers each with the next canned stdout."""
    def __init__(self,*outputs,code=0,stderr=''):self.outputs=list(outputs);self.calls=[];self.code=code;self.stderr=stderr
    def __call__(self,argv,input,env,capture_output,text):
        self.calls.append(SimpleNamespace(argv=argv,sql=input,env=env))
        return SimpleNamespace(returncode=self.code,stdout=self.outputs.pop(0) if self.outputs else '',stderr=self.stderr)


def args(**kw):
    base=dict(environment='dev',apply=False,dry_run=True,expected_count=None,actor=None,approval_reference=None)
    base.update(kw);return SimpleNamespace(**base)


class LegacyReconcileTests(unittest.TestCase):
    def setUp(self):
        self.tool=Path(__file__).resolve().parent/'_synthetic_bin';self.environ={'MW_PG_BIN':str(self.tool),'PGPASSWORD':'ambient','PATH':'/bin'}
        self.psql=patch.object(op,'psql_path',return_value=Path('/synthetic/psql'));self.psql.start();self.addCleanup(self.psql.stop)
        self.tunnels=[]
        @contextlib.contextmanager
        def tunnel(repo,environ):self.tunnels.append(repo);yield 15432
        self.tunnel=tunnel;self.secrets=[]
    def secret(self,argv):self.secrets.append(argv);return SECRET
    def invoke(self,a,runner):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):result=op.run(a,environ=self.environ,runner=runner,secrets=self.secret,tunnel_factory=self.tunnel)
        return result,out.getvalue()

    def test_dry_run_is_read_only_and_prints_ids_amounts_dates(self):
        runner=Runner('target\tloan_manager_dev\tpostgres\nrow\tL-1\t2026-08-26\t5000.00\t0\t5000.00\n')
        rows,printed=self.invoke(args(),runner)
        self.assertEqual(rows,[['L-1','2026-08-26','5000.00','0','5000.00']])
        call=runner.calls[0]
        self.assertTrue(call.sql.startswith('BEGIN READ ONLY;'));self.assertTrue(call.sql.rstrip().endswith('ROLLBACK;'))
        self.assertIn('reconcile_legacy_default_postings(NULL,false)',call.sql);self.assertNotIn(',true)',call.sql)
        self.assertEqual(call.argv[call.argv.index('-d')+1],'loan_manager_dev');self.assertEqual(call.argv[call.argv.index('-U')+1],'postgres')
        self.assertEqual(call.env['PGPASSWORD'],SECRET);self.assertNotIn(SECRET,printed);self.assertIn('L-1\t2026-08-26',printed)
        self.assertEqual(self.secrets[0][-2:],['--secret='+op.cloud.ADMIN_SECRET,'--project='+op.cloud.PROJECT])

    def test_wrong_database_or_identity_is_refused(self):
        for target in ('target\tloan_manager_prod\tpostgres\n','target\tloan_manager_dev\tmw_app_dev\n',''):
            with self.assertRaises(RuntimeError):self.invoke(args(),Runner(target))

    def test_apply_arguments_are_checked_before_any_connection(self):
        for bad in (dict(expected_count=None,actor='owner@example.invalid'),dict(expected_count=0,actor='owner@example.invalid'),
                    dict(expected_count=2,actor='not an email'),dict(environment='prod',expected_count=2,actor='owner@example.invalid')):
            runner=Runner()
            with self.assertRaises(ValueError):self.invoke(args(apply=True,dry_run=False,**bad),runner)
            self.assertEqual(runner.calls,[]);self.assertEqual(self.tunnels,[]);self.assertEqual(self.secrets,[])

    def test_apply_passes_values_as_variables_checks_count_and_reruns_the_dry_run(self):
        runner=Runner('target\tloan_manager_prod\tpostgres\nrow\tL-1\t2026-08-26\t5000.00\t0\t5000.00\tdf10:3:L-1:2026-08-26\n',
                      'target\tloan_manager_prod\tpostgres\n')
        posted,printed=self.invoke(args(environment='prod',apply=True,dry_run=False,expected_count=1,actor='owner@example.invalid',approval_reference='owner message 2 Nov'),runner)
        self.assertEqual(posted[0][-1],'df10:3:L-1:2026-08-26')
        apply=runner.calls[0]
        self.assertNotIn('owner@example.invalid',apply.sql);self.assertIn(":'actor'",apply.sql);self.assertIn(":'expected'",apply.sql)
        variables=[apply.argv[i+1] for i,a in enumerate(apply.argv) if a=='-v']
        self.assertIn('database=loan_manager_prod',variables);self.assertIn('expected=1',variables);self.assertIn('actor=owner@example.invalid',variables)
        self.assertLess(apply.sql.index("current_setting('r116.expected')"),apply.sql.index(":'actor',true"),'the count is checked before the apply')
        self.assertTrue(runner.calls[1].sql.startswith('BEGIN READ ONLY;'));self.assertIn('Post-apply dry run lists no loan.',printed)

    def test_a_remaining_loan_after_apply_or_a_failed_apply_is_reported(self):
        runner=Runner('target\tloan_manager_dev\tpostgres\nrow\tL-1\t2026-08-26\t5000.00\t0\t5000.00\tdf10:3:L-1:2026-08-26\n',
                      'target\tloan_manager_dev\tpostgres\nrow\tL-2\t2026-08-28\t1000.00\t0\t1000.00\n')
        with self.assertRaises(RuntimeError):self.invoke(args(apply=True,dry_run=False,expected_count=1,actor='owner@example.invalid'),runner)
        failed=Runner(code=3,stderr='psql:<stdin>:7: ERROR:  R116: the dry run does not list the expected number of loans\nCONTEXT:  PL/pgSQL\n')
        with contextlib.redirect_stderr(io.StringIO()) as err,self.assertRaises(RuntimeError) as raised:
            self.invoke(args(apply=True,dry_run=False,expected_count=1,actor='owner@example.invalid'),failed)
        self.assertIn('expected number of loans',str(raised.exception));self.assertIn('unknown',err.getvalue())
        self.assertNotIn('ambient',failed.calls[0].env.values())


if __name__=='__main__':unittest.main()
