"""Tests for editor-evidence boundaries, with synthetic data only."""
import unittest
from reconcile_editor import fields, panel_snapshot, sanitize
from validate_dependencies import provider_relation

class EditorTests(unittest.TestCase):
    def test_excludes_preview_and_test_data_keeps_actual_task(self):
        sample='\n'.join(['- banner:','  - textbox: User identity','  - navigation:',
          '    - treeitem: Bot','  - paragraph: Bot','  - checkbox [checked]',
          '  - button "Close right panel":','  - generic: private preview row',
          '  - heading "Settings" [level=6]','  - textbox: Exact task formula',
          '  - heading "Test step" [level=6]','  - textbox: private test row'])
        got=panel_snapshot(sample)
        self.assertIn('Exact task formula',got)
        self.assertIn('checkbox [checked]',got)
        self.assertNotIn('private',got)
        self.assertNotIn('User identity',got)
    def test_maintains_field_order_and_exact_types(self):
        rows=[{'label':'Formula','controls':[{'value':'a\nb\n'}]},
          {'label':'Enabled','controls':[{'value':False}]},
          {'label':'Test step','controls':[]},{'label':'Input','controls':[{'value':'private'}]}]
        self.assertEqual(fields(rows),rows[:2])
    def test_no_configuration_does_not_become_verified_values(self):
        self.assertEqual(panel_snapshot('- banner:\n  - textbox: foo'),'')
    def test_private_identifiers_and_signatures_are_removed(self):
        value=sanitize({'value':'person@example.net https://example.org/logo?signature=secret&x=1 owner@mw-credit.com'})['value']
        self.assertNotIn('person@example.net',value)
        self.assertNotIn('secret',value)
        self.assertIn('&x=1',value)
        self.assertIn('owner@mw-credit.com',value)
    def test_provider_id_requires_both_exact_halves(self):
        self.assertEqual(provider_relation(r'public.loan\_data__loan\_data'),'public.loan_data')
        with self.assertRaises(ValueError):provider_relation('public.Loans__Payments')
        with self.assertRaises(ValueError):provider_relation('public.Loans')

if __name__=='__main__':unittest.main()
