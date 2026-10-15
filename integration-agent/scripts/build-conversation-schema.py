"""Compile DOM-exported AppSheet documentation, without business data or credentials.

Inputs and output are private files outside Git. Recapture after app definition changes.
"""
import argparse
import hashlib
import json
from pathlib import Path


def compile_app(path, app_id):
    raw = json.loads(path.read_text(encoding='utf-8'))
    items = [dict(r for r in t['rows'] if len(r) == 2) for t in raw]
    version = next(t['Version'] for t in items if 'Version' in t)
    tables = {t['Table name']: {'schema': t['Schema'], 'permission': t['Are updates allowed?'],
              'condition': t.get('Expression for update mode', ''), 'columns': {}}
              for t in items if t.get('Data Source') == 'database-2' and 'Table name' in t}
    schemas = {}
    current = None
    for item in items:
        if 'Schema Name' in item:
            current = item['Schema Name']
            schemas[current] = {}
        elif 'Column name' in item and current:
            schemas[current][item['Column name']] = item
    for name, table in tables.items():
        table['columns'] = schemas[table.pop('schema')]
        keys = [n for n,c in table['columns'].items() if c.get('Key') == 'Yes']
        if len(keys) != 1:
            raise ValueError('Exactly one key required: ' + name)
        table['key'] = keys[0]
    return {'app_id': app_id, 'version': version, 'tables': tables,
            'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('capture_directory', type=Path)
    args = p.parse_args()
    apps = {app: compile_app(args.capture_directory / (app + '-doc.json'), ident)
            for app, ident in [('oltp','93844270-6aa5-420b-a960-bcdf08abd357'),
                               ('olap','e74dd368-654f-44d7-bccf-83cf361d1cdb')]}
    output = {'format': 1, 'apps': apps}
    path = args.capture_directory / 'appsheet-schema.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({app: {'version': a['version'], 'tables': len(a['tables'])} for app,a in apps.items()}))
