#!/usr/bin/env python3
"""Offline bounded patch and installer synchronization; never authenticates."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace-root', type=Path, default=Path('/workspace'))
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parent
    hashes = json.loads((bundle / 'file-hashes.json').read_text())
    setup = args.workspace_root / '.setup'
    states = []
    for name, pins in hashes.items():
        digest = hashlib.sha256((setup / name).read_bytes()).hexdigest()
        if digest not in pins.values():
            raise SystemExit('Unexpected baseline; reconcile before patching: ' + name)
        states.append('after' if digest == pins['after'] else 'before')
    if len(set(states)) != 1:
        raise SystemExit('Partial patch state; reconcile before patching')
    if states[0] == 'before':
        command = ['patch', '--batch', '-p1', '-d', str(args.workspace_root), '-i', str(bundle / 'scoped-adapter.patch')]
        subprocess.run(command + ['--dry-run'], check=True)
        subprocess.run(command, check=True)
    for name, pins in hashes.items():
        if hashlib.sha256((setup / name).read_bytes()).hexdigest() != pins['after']:
            raise SystemExit('Patched file hash mismatch: ' + name)

    # Existing installer embeds a single public source dictionary. Replace only
    # these three values, preserving every unrelated embedded file and shell step.
    installer = setup / 'install-gcloud-adapter.sh'
    original = installer.read_text()
    start = original.index('\nfiles = ') + 1
    end = original.index('\n', start)
    assignment = ast.parse(original[start:end]).body[0]
    if not isinstance(assignment, ast.Assign) or assignment.targets[0].id != 'files':
        raise SystemExit('Unexpected installer format')
    files = ast.literal_eval(assignment.value)
    for name in hashes:
        files[name] = (setup / name).read_text()
    updated = original[:start] + 'files = ' + repr(files) + original[end:]
    installer.write_text(updated)
    print('Offline scoped adapter patch and embedded reproduction synchronized; no live command executed.')


if __name__ == '__main__':
    main()
