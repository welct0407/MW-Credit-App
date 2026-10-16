"""The Markdown catalogue and the JSON manifest describe the same services with the same switches (AGT-TEST-05)."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def markdown_rows():
    lines = (ROOT / 'SERVICE_CATALOGUE.md').read_text(encoding='utf-8').splitlines()
    start = next(i for i, line in enumerate(lines) if re.match(r'^\|\s*Service\s*\|\s*State\s*\|', line))
    rows = {}
    for line in lines[start + 2:]:
        if not line.startswith('|'):
            break
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows[cells[0].strip('`')] = cells[1]
    return rows


class CatalogueAlignmentTests(unittest.TestCase):
    def test_markdown_table_and_json_manifest_name_the_same_services_with_the_same_switch(self):
        manifest = json.loads((ROOT / 'service-catalogue.json').read_text(encoding='utf-8'))['services']
        rows = markdown_rows()
        self.assertEqual(set(rows), set(manifest))
        for name, state in rows.items():
            with self.subTest(service=name):
                lowered = state.lower()
                self.assertTrue(lowered.startswith(('enabled', 'disabled')), state)
                # The JSON is the source template; a row may describe the live PROD switch as long as it
                # says the template defaults off.
                template_on = lowered.startswith('enabled') and 'source template defaults off' not in lowered
                self.assertEqual(template_on, manifest[name]['enabled'])


if __name__ == '__main__':
    unittest.main()
