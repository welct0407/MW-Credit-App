#!/usr/bin/env python3
"""Read-only installed-SDK syntax check. No login, API requests or provisioning."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk-root', type=Path, required=True, help='Verified existing Google Cloud SDK installation root')
args = parser.parse_args()
sdk = args.sdk_root.resolve()
launcher = sdk / 'bin' / ('gcloud.cmd' if os.name == 'nt' else 'gcloud')
if not launcher.is_file() or not (sdk / 'lib/googlecloudsdk').is_dir():
    sys.exit('STOP: expected existing SDK layout was not found')

sys.path[:0] = [str(sdk / 'lib'), str(sdk / 'lib/third_party')]
from googlecloudsdk.calliope import arg_parsers  # noqa: E402 - installed SDK, not a mock

condition = 'resource.name=="projects/clever-oasis-508610-n7/databases/mw-grafana-events"'
condition_arg = f'expression={condition},title=mw-grafana-database,description=Bridge database only'
assert arg_parsers.ArgDict()(condition_arg)['expression'] == condition
log_filter = 'logName="projects/clever-oasis-508610-n7/logs/run.googleapis.com%2Frequests" AND resource.type="cloud_run_revision" AND resource.labels.service_name="mw-grafana-events" AND httpRequest.requestUrl =~ "^https://[^/]+/oauth(/|[?]|$)"'
exclusion = f'name=mw-grafana-oauth-requests,description=grafana-mcp-bootstrap-v1,filter={log_filter}'
parsed = arg_parsers.ArgDict(spec={'name': str, 'description': str, 'filter': str, 'disabled': bool}, required_keys=['name', 'filter'])(exclusion)
assert parsed['filter'] == log_filter and 'disabled' not in parsed

with tempfile.TemporaryDirectory(prefix='mw-grafana-sdk-check-') as directory:
    flags = Path(directory) / 'flags.json'
    flags.write_text(json.dumps([{'--add-exclusion': exclusion}, {'--project': 'clever-oasis-508610-n7'}]), encoding='utf-8')
    result = subprocess.run([str(launcher), 'logging', 'sinks', 'update', '_Default', f'--flags-file={flags}', '--help'],
                            capture_output=True, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'}, timeout=30)
    if result.returncode or '--add-exclusion' not in result.stdout.decode(errors='replace'):
        sys.exit('STOP: installed SDK rejected the sink/flags-file help invocation\n' + result.stderr.decode(errors='replace'))
print('Installed SDK checks passed: named sink exclusion, JSON flags file, exact CEL/filter parsing. No APIs called.')
