import importlib.util, pathlib, unittest, urllib.request
spec=importlib.util.spec_from_file_location('manage',pathlib.Path(__file__).resolve().parents[2]/'scripts/grafana/manage.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def plan(actions=['no-op']):
    return {'format_version':'1.2','terraform_version':'1.16.5','complete':True,'errored':False,'planned_values':{'root_module':{}},'resource_changes':[{'address':'grafana_folder.existing["synthetic"]','change':{'actions':actions}}]}
class Guards(unittest.TestCase):
    def test_noop(self): m.check_adoption(plan())
    def test_mutation_rejected(self):
        for action in ('create','update','delete','read'):
            with self.assertRaises(ValueError): m.check_adoption(plan([action]))
    def test_malformed_rejected(self):
        for value in ({},[],{'resource_changes':[]},dict(plan(),complete=False),dict(plan(),errored=True),dict(plan(),resource_changes=[])):
            with self.assertRaises(ValueError): m.check_adoption(value)
    def test_repo_path_rejected(self):
        with self.assertRaises(ValueError): m.private_path(str(m.ROOT/'token.txt'))
    def test_foreign_path_rejected(self):
        with self.assertRaises(ValueError): m.request('//foreign.invalid', 'synthetic')
    def test_redirect_blocked(self):
        with self.assertRaises(ValueError): m.NoRedirect().redirect_request(urllib.request.Request(m.ORIGIN),None,302,'redirect',{},'https://foreign.invalid')
    def test_unsafe_tf_args(self):
        for args in (['destroy'],['plan','-out=C:/GitHub/secret.tfplan'],['init','-backend-config=bad'],['apply','C:/GitHub/secret.tfplan'],['state','pull'],['plan','-chdir=other']):
            with self.assertRaises(ValueError): m.validated_tf_args(args)
    def test_import_scope(self):
        m.validated_tf_args(['import','grafana_folder.existing["actual-uid"]','actual-uid'])
        with self.assertRaises(ValueError): m.validated_tf_args(['import','google_project.unrelated','other'])
if __name__=='__main__': unittest.main()
