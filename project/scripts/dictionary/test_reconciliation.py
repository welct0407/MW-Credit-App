"""Synthetic safety checks for metadata reconciliation; no app/database access."""
import tempfile
import unittest
from pathlib import Path
from common import equal, dump, load_text
from appdoc_capture import html_tables, properties
from reconcile_captures import delta,apply_delta,postgres_objects,slug

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

if __name__=='__main__':unittest.main()
