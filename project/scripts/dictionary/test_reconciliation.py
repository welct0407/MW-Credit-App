"""Synthetic safety checks for metadata reconciliation; no app/database access."""
import tempfile
import unittest
from pathlib import Path
from common import equal, dump, load_text
from appdoc_capture import html_tables, properties
import json
from unittest import mock
import reconcile_captures
from reconcile_captures import delta,apply_delta,postgres_objects,slug,parse_only

class ReconciliationTests(unittest.TestCase):
    def test_exact_states_and_order(self):
        before={'null':None,'blank':'','false':False,'zero':0,'items':['a','b'],'formula':'IF([X], "ไทย", "")\n'}
        after={'null':'','blank':None,'false':0,'zero':False,'items':['b','a'],'new':None,'formula':'IF([X], "ไทย", "x")\n'}
        changes=delta(before,after)
        self.assertEqual(len(changes),7)
        self.assertTrue(equal(apply_delta(before,changes),after))
        self.assertTrue(equal(load_text(dump(after)),after))
    def test_stale_guard(self):
        changes=delta({'value':'old'},{'value':'new'})
        with self.assertRaises(ValueError):apply_delta({'value':'someone else'},changes)
    def test_removed_and_dev_only(self):
        self.assertIsNone(apply_delta({'x':1},[{'pointer':'','before':{'state':'value','value':{'x':1}},'after':{'state':'absent'}}]))
        self.assertEqual(apply_delta(None,[{'pointer':'','before':{'state':'absent'},'after':{'state':'value','value':{'x':1}}}]),{'x':1})
    def test_missing_property_detected(self):
        self.assertEqual(delta({'required':''},{}),[{'pointer':'/required','before':{'state':'value','value':''},'after':{'state':'absent'}}])
    def test_pointer_escaping(self):
        a={'x/y':{'~z':'a'}};b={'x/y':{'~z':'b'}}
        self.assertEqual(delta(a,b)[0]['pointer'],'/x~1y/~0z')
        self.assertEqual(apply_delta(a,delta(a,b)),b)
    def test_overloads_are_distinct(self):
        sections={k:[] for k in ['relations','columns','constraints','indexes','triggers','policies','routines','schemas','sequences','types','view_dependencies']}
        sections['routines']=[dict(schema='public',name='f',arguments='x text'),dict(schema='public',name='f',arguments='x integer')]
        result=postgres_objects({'sections':sections})
        self.assertIn(('routine','public.f(x text)'),result)
        self.assertIn(('routine','public.f(x integer)'),result)
    def test_name_collisions(self):
        self.assertNotEqual(slug('A B'),slug('A-B'))
    def test_independent_html_preserves_values(self):
        html='<table data-type="SchemaField" data-index="0"><tbody><tr><td>Formula</td><td>IF([x]&gt;0, &quot;ไทย&quot;, &quot;&quot;)\nnext</td></tr><tr><td>Items</td><td><ol><li>b</li><li>a</li></ol></td></tr><tr><td>Empty</td><td></td></tr></tbody></table>'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'capture.html';path.write_text(html,encoding='utf8')
            data=properties(html_tables(path)[0])
        self.assertEqual(data,{'Formula':'IF([x]>0, "ไทย", "")\nnext','Items':['b','a'],'Empty':''})
    def test_duplicate_properties_fail(self):
        with self.assertRaises(ValueError):properties({'ordinal':1,'rows':[['x','a'],['x','b']]})
    def test_missing_object_and_wrong_environment_detectable(self):
        before={'public.A':{'database':'prod'},'public.B':{}}
        after={'public.A':{'database':'dev'}}
        paths={c['pointer'] for c in delta(before,after)}
        self.assertEqual(paths,{'/public.A/database','/public.B'})


def pg_capture(view_text, routine_body, extra_relation=False):
    """A minimal format-1 capture: one view, one table, one routine."""
    sections={k:[] for k in ['schemas','relations','columns','constraints','indexes','routines','triggers','sequences','types','policies','extensions','view_dependencies']}
    sections['relations']=[dict(schema='public',name='v',kind='v',view_definition=view_text),dict(schema='public',name='t',kind='r',view_definition=None)]
    if extra_relation:sections['relations'].append(dict(schema='public',name='u',kind='r',view_definition=None))
    sections['routines']=[dict(schema='public',name='f',arguments='a integer, b text',definition=routine_body)]
    return {'format':1,'environment':'production','captured_utc':'2026-10-28T00:00:00+00:00','target':{'instance':'mw-credit-pg-20261017','database':'loan_manager_prod'},'sections':sections,'metadata_sha256':'0'*64}


class TargetedPlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        base=Path(self.tmp.name);self.repo=base/'project';self.root=self.repo/'Documents/Data Dictionary';self.private=base/'private'
        (self.root/'systems/postgresql/relations').mkdir(parents=True);self.private.mkdir()
        self.existing=self.root/'systems/postgresql/relations/public-v-old.yaml'
        self.existing.write_text(dump({'format':1,'identity':{'system':'postgresql','component':'loan_manager_prod','kind':'relation','name':'public.v','scope':'production'},'verification':{'status':'documented','source':'old'},'content':{}}),encoding='utf8')
        for target in ('ROOT','REPO'):self.enterContext(mock.patch.object(reconcile_captures,target,self.root if target=='ROOT' else self.repo))
        self.enterContext(mock.patch.object(reconcile_captures.subprocess,'check_output',return_value='abc123\n'))
        (self.private/'production-complete.json').write_text(json.dumps(pg_capture("SELECT 'Long Overdue'",'BEGIN new END')),encoding='utf8')

    def plan(self,*only,dev=None):
        if dev:(self.private/'development-complete.json').write_text(json.dumps(dev),encoding='utf8')
        out=self.repo/'outputs/dictionary-r103-test'
        with mock.patch('builtins.print'):reconcile_captures.plan(self.private,out,list(only),True)
        return json.loads((out/'plan.json').read_text(encoding='utf8')),out

    def test_only_proposes_exactly_the_named_objects_without_appsheet_or_catalog(self):
        plan,out=self.plan('relation:public.v,routine:public.f(a integer, b text)')
        self.assertEqual(sorted((w['document']['identity']['kind'],w['document']['identity']['name']) for w in plan['writes']),[('relation','public.v'),('routine','public.f(a integer, b text)')])
        view=next(w for w in plan['writes'] if w['document']['identity']['kind']=='relation')
        self.assertEqual(view['path'],self.existing.relative_to(self.repo).as_posix())  # the existing record is replaced in place
        self.assertEqual(view['document']['content']['definition']['view_definition'],"SELECT 'Long Overdue'")
        self.assertEqual(view['document']['verification']['source'],'outputs/dictionary-r103-test/production-postgresql-observations.json')
        self.assertEqual(view['document']['verification']['previous_record']['commit'],'abc123')
        self.assertTrue(view['expected_sha256'])
        self.assertFalse(any('catalog.yaml' in w['path'] or 'development' in w['path'] for w in plan['writes']))
        self.assertEqual(sorted(p.name for p in out.iterdir()),['coverage.json','plan.json','production-postgresql-observations.json'])
        self.assertEqual(set(plan['sources']),{'postgresql-production'})

    def test_development_capture_adds_only_the_named_deltas(self):
        dev=pg_capture("SELECT 'Overdue'",'BEGIN new END',extra_relation=True)
        plan,_=self.plan('relation:public.v',dev=dev)
        paths=sorted(w['path'] for w in plan['writes'])
        self.assertEqual(len(paths),2)
        delta_doc=next(w for w in plan['writes'] if w['path'].startswith('Documents/Data Dictionary/development/'))
        self.assertEqual(delta_doc['document']['content']['changes'][0]['after']['value'],"SELECT 'Overdue'")

    def test_unknown_names_and_malformed_only_refuse(self):
        with self.assertRaisesRegex(ValueError,'Not in the production capture: relation:public.missing'):self.plan('relation:public.missing')
        for bad in ('public.v','table:x','routine:public.f(a'):
            with self.subTest(bad=bad),self.assertRaises(ValueError):parse_only([bad])
        with self.assertRaisesRegex(ValueError,'needs --postgres-only'):
            reconcile_captures.plan(self.private,self.repo/'outputs/x',['relation:public.v'],False)

    def test_parse_only_keeps_commas_inside_arguments(self):
        self.assertEqual(parse_only(['relation:public.a, routine:public.f(a integer, b text)','schema:public']),
                         {('relation','public.a'),('routine','public.f(a integer, b text)'),('schema','public')})

if __name__=='__main__':unittest.main()
