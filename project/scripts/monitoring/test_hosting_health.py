import importlib.util,json,pathlib,unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('health',pathlib.Path(__file__).with_name('debian-health.py'))
health=importlib.util.module_from_spec(spec);spec.loader.exec_module(health)
class HostingTests(unittest.TestCase):
 def fixture(self,environment='prod',**marker):
  value={'schemaVersion':1,'version':'a'*24,'entry':'/assets/index-proof.js',**marker}
  title='MW Credit' if environment=='prod' else 'MW Credit Development'
  return Mock(side_effect=[f'<title>{title}</title><div id="root"></div><script type="module" crossorigin src="/assets/index-proof.js"></script>',json.dumps(value)])
 def test_exact_both_origins_and_read_only_bounds(self):
  for environment in ('dev','prod'):
   reader=self.fixture(environment);self.assertEqual(health.hosting_status(environment,reader),1)
   self.assertEqual([c.args[0] for c in reader.call_args_list],[health.HOSTING_ORIGINS[environment]+'/',health.HOSTING_ORIGINS[environment]+'/build-version.json'])
   self.assertTrue(all(0<c.args[1]<=10 for c in reader.call_args_list))
 def test_wrong_marker_shell_or_env_down(self):
  for marker in [{'version':'bad'},{'entry':'https://foreign.invalid/a.js'},{'entry':'/assets/other.js'},{'schemaVersion':2}]:
   self.assertEqual(health.hosting_status('prod',self.fixture(**marker)),0)
  self.assertEqual(health.hosting_status('prod',self.fixture('dev')),0)
 def test_failure_timeout_malformed_and_unknown_environment(self):
  for reader in [Mock(side_effect=TimeoutError()),Mock(side_effect=['<html>','not-json']),Mock(side_effect=['<html>','[]'])]:self.assertEqual(health.hosting_status('prod',reader),0)
  reader=Mock()
  with self.assertRaises(ValueError):health.hosting_status('other',reader)
  reader.assert_not_called()
 def test_fixed_child_deadline_and_failed_child(self):
  with patch.object(health.subprocess,'run',return_value=Mock(returncode=0,stdout='{"status":1}')) as run:
   self.assertEqual(health.hosting_status('prod'),1);self.assertEqual(run.call_args.kwargs['timeout'],10);self.assertEqual(run.call_args.args[0][-2:],['--hosting-probe','prod'])
  with patch.object(health.subprocess,'run',side_effect=TimeoutError()):self.assertEqual(health.hosting_status('prod'),0)
 def test_comment_placeholder_is_not_shell(self):
  reader=self.fixture();reader.side_effect=['<!--<title>MW Credit</title><div id="root"></div><script type="module" src="/assets/index-proof.js"></script>-->',json.dumps({'schemaVersion':1,'version':'a'*24,'entry':'/assets/index-proof.js'})]
  self.assertEqual(health.hosting_status('prod',reader),0)
 def test_no_redirect_and_total_deadline(self):
  self.assertIsNone(health.NoHostingRedirect().redirect_request(None,None,302,'',{},'https://foreign.invalid'))
  reader=self.fixture();self.assertEqual(health.hosting_status('prod',reader,Mock(side_effect=[0,1,11])),0);self.assertEqual(reader.call_count,1)
if __name__=='__main__':unittest.main()
