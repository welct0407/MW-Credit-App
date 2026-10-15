"""Owner-run, default-read-only retrospective operator audit linkage.

Private manifest must pin the source marker/effects and both original hashes.
Apply requires separately scoped authorization and a verified backup reference.
This tool never executes business DML or backdates an audit event.
"""
import argparse
import json
from pathlib import Path
from mw_integration_agent.operator_audit import recover

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-reference')
    args = parser.parse_args()
    config = json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
    manifest = json.loads(Path(args.manifest).read_text())
    print(json.dumps(recover(config, manifest, args.apply, args.backup_reference)))
