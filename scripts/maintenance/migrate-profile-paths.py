"""Scoped VM-01 profile-path migration; preserves unrelated working-tree edits.

Dry-run unless --apply. Does not touch migrations, captured outputs or archives.
Private before-images and a changed-file manifest are stored outside Git.
"""
import argparse, json, pathlib, re, subprocess

p = argparse.ArgumentParser()
p.add_argument('--apply', action='store_true')
args = p.parse_args()
private = pathlib.Path('C:/Users/ideaadmin/Documents/ideaadmin-independent-20261011')
repos = ['AppSheet-Loan-Project', 'MW-Credit-App', 'MW-AI-Collection', 'MW-Integration-Agent', 'MW-Partner-Operations']
pattern = re.compile(rb'(?i)(C:(?:/|\\{1,2})Users(?:/|\\{1,2}))MWCredit(?=/|\\)')
manifest = []
for name in repos:
    root = pathlib.Path('C:/GitHub') / name
    cmd = ['git', '-c', f'safe.directory={root.as_posix()}', '-C', str(root)]
    files = subprocess.check_output(cmd + ['ls-files', '-z']).decode().split('\0')
    selected = []
    for rel in filter(None, files):
        parts = pathlib.PurePosixPath(rel).parts
        if any(x.lower() in {'outputs', 'sources', 'change logs', 'archive', 'reference', 'migrations', 'backups'} for x in parts):
            continue
        is_code = pathlib.PurePosixPath(rel).suffix in {'.ps1', '.py', '.mjs', '.cjs', '.js', '.json', '.cmd', '.bat', '.toml', '.yml', '.yaml'}
        is_current_doc = rel in {'AGENTS.md', 'scripts/README.md', 'Documents/Development_Workflow.md', 'Documents/Development_Environment_Preparation.md', 'Documents/Development_Refresh_Runbook.md', 'database/OWNERSHIP.md'}
        if not (is_code or is_current_doc):
            continue
        file = root / rel
        if file.is_symlink() or not file.is_file():
            continue
        before = file.read_bytes()
        after = pattern.sub(rb'\g<1>ideaadmin', before)
        if after == before:
            continue
        head = subprocess.check_output(cmd + ['show', f'HEAD:{rel}'])
        entry = {'repo': name, 'file': rel, 'preexisting_changes': before.replace(b'\r\n', b'\n') != head.replace(b'\r\n', b'\n')}
        selected.append(entry)
        if args.apply:
            backup = private / 'source-before' / name / rel
            backup.parent.mkdir(parents=True, exist_ok=True)
            if backup.exists():
                raise RuntimeError('Existing before-image; reconcile before rerunning')
            backup.write_bytes(before)
            file.write_bytes(after)
            # Stage only the profile substitution against HEAD when the file
            # already contained unrelated work, leaving that work unstaged.
            if entry['preexisting_changes']:
                staged = pattern.sub(rb'\g<1>ideaadmin', head)
                blob = subprocess.check_output(cmd + ['hash-object', '-w', '--stdin'], input=staged).decode().strip()
                mode = subprocess.check_output(cmd + ['ls-files', '-s', '--', rel]).decode().split()[0]
                subprocess.check_call(cmd + ['update-index', '--cacheinfo', f'{mode},{blob},{rel}'])
    manifest.extend(selected)
    print(json.dumps({'repo': name, 'changed_files': len(selected), 'preexisting': [e['file'] for e in selected if e['preexisting_changes']]}), flush=True)
if args.apply:
    (private / 'source-path-migration.json').write_text(json.dumps(manifest, indent=2))
