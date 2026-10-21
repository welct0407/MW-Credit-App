"""The packaged schema digest and business rules the Claude provider sends as its cached system block."""
import importlib.resources
import importlib.util
import json
import unittest
from pathlib import Path

from mw_integration_agent import claude_conversation

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'build-schema-digest.py'


def builder():
    spec = importlib.util.spec_from_file_location('build_schema_digest', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SchemaDigestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = builder()
        cls.asset = importlib.resources.files('mw_integration_agent') / 'assets' / 'schema-digest.json'
        cls.digest = json.loads(cls.asset.read_text(encoding='utf-8'))

    def test_digest_is_current_with_the_data_dictionary(self):
        fresh = self.module.render(self.module.build())
        self.assertEqual(self.asset.read_text(encoding='utf-8'), fresh,
                         'stale: run python integration-agent/scripts/build-schema-digest.py')
        self.assertEqual(self.module.main(['--check']), 0)

    def test_every_column_of_a_readable_relation_is_listed(self):
        # Owner decision, 21 October 2026: no sensitive exclusions; only the role's ACL decides.
        relations = {r['relation']: [c['name'] for c in r['columns']] for r in self.digest['relations']}
        self.assertIn('Email', relations['public."Partners"'])
        self.assertIn('Account Number', relations['public."Cash Accounts"'])
        directory = self.module.DICTIONARY / 'relations'
        for path in directory.glob('*.yaml'):
            document = self.module.load(path.read_text(encoding='utf-8'))
            definition = document['content']['definition']
            name = self.module.qualified(definition['schema'], definition['name'])
            with self.subTest(relation=name):
                if self.module.grants_select(definition['acl']):
                    self.assertEqual(sorted(relations[name]), sorted(document['content']['columns']))
                else:
                    self.assertNotIn(name, relations)

    def test_only_relations_readable_by_the_integration_role(self):
        self.assertIn('public."Loans"', [r['relation'] for r in self.digest['relations']])
        directory = self.module.DICTIONARY / 'relations'
        readable = 0
        for path in directory.glob('*.yaml'):
            document = self.module.load(path.read_text(encoding='utf-8'))
            acl = document['content']['definition']['acl']
            readable += self.module.grants_select(acl)
        self.assertGreaterEqual(readable, len(self.digest['relations']))
        self.assertTrue(self.module.grants_select('{postgres=arwdDxtm/postgres,mw_integration_agent=r/postgres}'))
        self.assertFalse(self.module.grants_select('{postgres=arwdDxtm/postgres,mw_integration_agent_x=r/postgres}'))
        self.assertFalse(self.module.grants_select('{mw_integration_agent=w/postgres}'))
        self.assertEqual(self.digest['functions'][0]['function'], 'public.loan_close_calculation_v83')
        self.assertEqual(self.digest['functions'][0]['arguments'], 'p_loan text, p_day date')

    def test_subset_parser_matches_pyyaml_where_available(self):
        try:
            import yaml
        except ImportError:
            self.skipTest('PyYAML not installed; the drift test above still runs')
        for folder in ('relations', 'routines'):
            for path in sorted((self.module.DICTIONARY / folder).glob('*.yaml')):
                text = path.read_text(encoding='utf-8')
                with self.subTest(path=path.name):
                    self.assertEqual(self.module.load(text), yaml.safe_load(text))

    def test_subset_parser_forms(self):
        load = self.module.load
        text = ('"a": "x \\\n  \\ y"\n"b":\n- 1\n- "c": null\n  "d": true\n"e": |2-\n    two\n   one\n"f": {}\n'
                '"g": "long\n  folded"\n')
        self.assertEqual(load(text), {'a': 'x  y', 'b': [1, {'c': None, 'd': True}], 'e': '  two\n one', 'f': {},
                                      'g': 'long folded'})
        with self.assertRaises(self.module.YamlSubsetError):
            load('"a": [1, 2]\n')

    def test_system_reference_is_the_packaged_rules_and_digest(self):
        rules = (importlib.resources.files('mw_integration_agent') / 'assets' / 'conversation-business-rules.md').read_text(encoding='utf-8')
        claude_conversation.reference.cache_clear()
        reference = claude_conversation.reference()
        self.assertIn(rules.strip(), reference)
        self.assertIn(self.asset.read_text(encoding='utf-8').strip(), reference)
        self.assertIn('## 15. Owner decisions', rules)


if __name__ == '__main__':
    unittest.main()
