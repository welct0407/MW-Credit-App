"""The packaged schema digest and business rules the Claude provider sends as its cached system block."""
import importlib.resources
import importlib.util
import json
import re
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

    def test_every_relation_in_public_and_agent_audit_with_every_column(self):
        # R085: the reporting role reads the whole database; no ACL filter, no sensitive exclusions.
        relations = {r['relation']: [c['name'] for c in r['columns']] for r in self.digest['relations']}
        self.assertIn('Email', relations['public."Partners"'])
        self.assertIn('public.pwa_push_subscriptions', relations)
        expected = set()
        for path in (self.module.DICTIONARY / 'relations').glob('*.yaml'):
            document = self.module.load(path.read_text(encoding='utf-8'))
            definition = document['content']['definition']
            name = self.module.qualified(definition['schema'], definition['name'])
            with self.subTest(relation=name):
                if definition['schema'] in ('public', 'agent_audit'):
                    expected.add(name)
                    self.assertEqual(sorted(relations[name]), sorted(document['content']['columns']))
                else:
                    self.assertNotIn(name, relations)
        self.assertEqual(set(relations), expected)
        self.assertTrue(any(name.startswith('agent_audit.') for name in relations))

    def routines(self):
        for path in sorted((self.module.DICTIONARY / 'routines').glob('*.yaml')):
            document = self.module.load(path.read_text(encoding='utf-8'))
            yield document, self.module.routine_facts(document)

    def test_every_dictionary_routine_is_classified(self):
        counts = {'allowed': 0, 'trigger': 0, 'excluded': 0}
        for _, (name, result, *_) in self.routines():
            with self.subTest(routine=name):
                category = self.module.classify(name, result)
                self.assertIn(category, counts)
                counts[category] += 1
        self.assertEqual(counts['allowed'], len(self.module.ALLOWED))
        self.assertEqual(len(self.module.ALLOWED), 28)
        self.assertGreater(counts['trigger'], 0)
        functions = {f['function']: f for f in self.digest['functions']}
        self.assertEqual(set(functions), set(self.module.ALLOWED))
        for name, entry in functions.items():
            self.assertLessEqual(set(entry), {'function', 'result', 'kind', 'volatility', 'purpose', 'use_when', 'comment'})
            self.assertEqual((entry['purpose'], entry['use_when']), self.module.ALLOWED[name])
            self.assertIn(entry['volatility'], ('IMMUTABLE', 'STABLE', 'VOLATILE'))
        payoff = functions['public.loan_close_calculation_v83(p_loan text, p_day date)']
        self.assertEqual((payoff['result'], payoff['volatility']), ('jsonb', 'STABLE'))
        self.assertIn('loan_payoff tool', payoff['use_when'])
        # The allow-list overrides an excluded prefix; writers stay away.
        self.assertEqual(self.module.classify('public.pwa_effective_payment_plan_v2(p_id text)', 'jsonb'), 'allowed')
        for writer in ('public.pwa_apply_payment_v2(canonical text)', 'public.post_payment_explicit_v6(p_id text)',
                       'public.payment_crud_finish_core_v83(p_old "Payments", p_new "Payments", operation text)',
                       'public.cash_account_holder(p_account text, p_active boolean)', 'agent_audit.anything()',
                       'public.vc_refresh_loan(p_id text)'):
            self.assertEqual(self.module.classify(writer, 'void'), 'excluded', writer)
            self.assertNotIn(writer, functions)
        with self.assertRaises(self.module.UnclassifiedRoutine):
            self.module.routine_entry({'identity': {'name': 'public.brand_new(x text)'},
                                       'content': {'definition': {'result': 'text', 'kind': 'f', 'volatility': 's'}}})

    def test_allow_listed_routines_never_write(self):
        statement = re.compile(r'^\s*(INSERT|UPDATE|DELETE)\b', re.I | re.M)
        anywhere = re.compile(r'\b(INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b', re.I)
        locking = re.compile(r'\bFOR\s+(?:NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\b', re.I)
        checked = 0
        for document, (name, _, _, volatility, _) in self.routines():
            if name not in self.module.ALLOWED:
                continue
            definition = document['content']['definition']
            body = definition if isinstance(definition, str) else definition.get('definition') or ''
            with self.subTest(routine=name):
                self.assertTrue(body.strip())
                self.assertIsNone(statement.search(body))
                self.assertIsNone(locking.search(body))
                if volatility == 'VOLATILE':
                    self.assertIsNone(anywhere.search(body))
                checked += 1
        self.assertEqual(checked, 28)

    def test_check_detects_drift(self):
        import contextlib
        import io
        import tempfile
        from unittest.mock import patch
        fresh = self.module.render(self.module.build())
        with tempfile.TemporaryDirectory() as directory:
            stale = Path(directory) / 'schema-digest.json'
            for text, code in ((fresh, 0), (fresh.replace('"functions":[', '"functions":[ ', 1), 1), (fresh[:-10], 1)):
                stale.write_text(text, encoding='utf-8')
                with patch.object(self.module, 'OUTPUT', stale), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(self.module.main(['--check']), code)

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
