"""End-to-end export checks using synthetic systems, arbitrary YAML and safe failure cases."""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from common import write_yaml
from export_markdown import capture, export_dictionary, render, verify_render, git_state


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.root = self.repo / 'Documents/Data Dictionary'
        self.output = self.repo / 'Documents/reference.md'
        self.catalog = {"format": 1, "systems": {
            "future-system": {"status": "active", "kinds": ["custom-widget"]},
            "planned-system": {"status": "planned", "kinds": ["new-kind"]},
        }}
        self.doc = {"format": 1, "identity": {"system": "future-system", "component": "demo", "kind": "custom-widget", "name": "Unicode ไทย", "scope": "test"},
                    "verification": {"status": "documented", "source": "synthetic"},
                    "content": {"arbitrary_nested_data": [{"yes_text": "Yes", "boolean": False, "null": None, "zero": 0}],
                                "expression": '=IF(TRUE,\n "ไทย", "No")', "fences": '```yaml\n````\n<!-- DD_SOURCE fake -->'}}
        self.file = self.root / 'systems/future-system/new-shape/widget.yml'
        write_yaml(self.root / 'catalog.yaml', self.catalog)
        write_yaml(self.root / 'unresolved.yaml', {"format": 1, "items": []})
        write_yaml(self.file, self.doc)
        (self.root / 'README.md').write_bytes(b'# Guide\r\n\r\n```yaml\r\nexample\r\n```')
        self.state = {"commit": "synthetic", "source_changes": []}
        self.git = patch('export_markdown.git_state', return_value=self.state)
        self.git.start()
        self.addCleanup(self.git.stop)

    def run_export(self):
        return export_dictionary(self.repo, self.root, self.output, ())

    def test_unknown_registered_system_full_values_and_source_bytes(self):
        sources, _, _ = capture(self.repo, self.root, ())
        result = self.run_export()
        self.assertEqual(result['objects'], 1)
        verify_render(self.output.read_bytes(), sources)
        self.assertIn(b'planned-system', self.output.read_bytes())
        self.assertIn('ไทย', self.output.read_text(encoding='utf8'))
        self.assertTrue(result['all_embedded_sources_byte_verified'])

    def test_new_system_and_kind_need_no_exporter_change(self):
        self.catalog['systems']['another-app'] = {'status': 'active', 'kinds': ['other-kind']}
        write_yaml(self.root / 'catalog.yaml', self.catalog)
        doc = copy.deepcopy(self.doc)
        doc['identity'].update(system='another-app', kind='other-kind')
        write_yaml(self.root / 'systems/another-app/anything.yaml', doc)
        self.assertEqual(self.run_export()['objects'], 2)

    def test_invalid_yaml_preserves_previous_export(self):
        self.run_export()
        before = self.output.read_bytes()
        self.file.write_text('format: 1\nformat: 2\n', encoding='utf8')
        with self.assertRaises(ValueError):
            self.run_export()
        self.assertEqual(before, self.output.read_bytes())
        self.assertFalse(self.output.with_suffix('.md.lock').exists())

    def test_rejects_unregistered_kind_and_future_format(self):
        for change in ({'format': 2}, {'identity': dict(self.doc['identity'], kind='unregistered')}):
            write_yaml(self.file, dict(self.doc, **change))
            with self.assertRaises(ValueError):
                self.run_export()
            self.assertFalse(self.output.exists())

    def test_does_not_overwrite_a_source_or_handwritten_output(self):
        with self.assertRaises(ValueError):
            export_dictionary(self.repo, self.root, self.root / 'README.md', ())
        self.output.write_text('My document', encoding='utf8')
        with self.assertRaises(ValueError):
            self.run_export()
        self.assertEqual(self.output.read_text(), 'My document')

    def test_source_changes_during_generation_preserve_previous_file(self):
        self.run_export()
        before = self.output.read_bytes()
        original_render = render
        def changing_render(*args):
            result = original_render(*args)
            self.file.write_bytes(self.file.read_bytes() + b'\n')
            return result
        with patch('export_markdown.render', side_effect=changing_render):
            with self.assertRaisesRegex(ValueError, 'Source files changed'):
                self.run_export()
        self.assertEqual(before, self.output.read_bytes())

    def test_lock_prevents_competing_export(self):
        lock = self.output.with_suffix('.md.lock')
        lock.touch()
        with self.assertRaisesRegex(ValueError, 'already running'):
            self.run_export()
        self.assertTrue(lock.exists())

    def test_dirty_state_is_visible_and_export_repeatable_for_fixed_time(self):
        sources, catalog, objects = capture(self.repo, self.root, ())
        state = {'commit': 'abc', 'source_changes': [{'path': 'example.yml', 'status': ' M'}]}
        a, fingerprint = render(sources, catalog, objects, state, 'fixed-time')
        b, other = render(sources, catalog, objects, state, 'fixed-time')
        self.assertEqual(a, b)
        self.assertEqual(fingerprint, other)
        self.assertIn(b'Includes 1 uncommitted source files', a)

    def test_ignored_source_is_not_reported_as_committed(self):
        from subprocess import CompletedProcess
        path = 'Documents/Data Dictionary/ignored.yaml'
        outputs = [CompletedProcess([], 0, stdout=b'abc\n'), CompletedProcess([], 0, stdout=b''),
                   CompletedProcess([], 0, stdout=b'')]
        with patch('export_markdown.subprocess.run', side_effect=outputs):
            state = git_state(self.repo, self.root, (), {path})
        self.assertEqual(state['source_changes'], [{'status': 'untracked/ignored', 'path': path}])


if __name__ == '__main__':
    unittest.main()
