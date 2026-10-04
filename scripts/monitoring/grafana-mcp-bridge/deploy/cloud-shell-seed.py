#!/usr/bin/env python3
"""Owner-executed Cloud Shell seeding; standalone, no downloads or payload reads.

Adapted from seed-secrets.py / owner-bootstrap.py at 4b582cb1d0fde993ec7d735da116d218aa8798b8.
Run only in the owner's interactive Cloud Shell, never through an agent.
"""
import argparse
import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import sys

PROJECT = 'clever-oasis-508610-n7'
NUMBER = '737787224638'
OWNER = 'welct0407@mw-credit.com'
MARKER = 'grafana-mcp-bootstrap-v1'
APPS = ('mw-grafana-hmac', 'mw-grafana-state-key',
        'mw-grafana-cookie-keys', 'mw-grafana-oauth-jwks')
GOOGLE = 'mw-grafana-google-client-secret'
ALL = (*APPS, GOOGLE)
CONFIRM = 'SEED FOUR APP KEYS'
NODE_PROBE = "const c=require('node:crypto'); for(const n of ['generateKeyPairSync','randomUUID']) if(typeof c[n]!=='function') process.exit(1);"
NODE_JWKS = "const c=require('node:crypto'); const {privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048}); const k=privateKey.export({format:'jwk'}); k.kid=c.randomUUID(); k.use='sig'; k.alg='RS256'; process.stdout.write(JSON.stringify({keys:[k]}));"


class Stop(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise Stop(message)


class Seeder:
    def __init__(self):
        self.gcloud = None
        self.node = None
        self.created = []

    def command(self, argv, data=None):
        # Invocation-only logging controls: never modify the user's SDK config.
        env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP='false',
                   CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true', CLOUDSDK_CORE_VERBOSITY='none')
        try:
            r = subprocess.run(argv, input=data, stdin=None if data is not None else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               timeout=90, check=False, env=env)
        except (OSError, subprocess.TimeoutExpired):
            raise Stop('Command failed/timed out; do not retry a write until version metadata is inspected.') from None
        # SDK/Node diagnostics may contain values: never replay stdout/stderr on failure.
        require(r.returncode == 0, 'Command failed; inspect version metadata in Console before any retry.')
        return r.stdout

    def gc(self, *args, data=None):
        raw = self.command([self.gcloud, *args, '--project='+PROJECT, '--account='+OWNER,
                            '--quiet', '--verbosity=none', '--no-log-http', '--format=json'], data)
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError):
            raise Stop('Invalid metadata response; inspect Console before any retry.') from None

    def baseline(self):
        require(os.name == 'posix', 'Use the official Linux Google Cloud Shell.')
        require(sys.version_info >= (3, 9), 'Python 3.9 or later is required; do not install automatically.')
        require(not any(v for k, v in os.environ.items()
                        if k.startswith('CLOUDSDK_AUTH_') or k == 'GOOGLE_APPLICATION_CREDENTIALS'),
                'Credential/impersonation override present; stop for owner review.')
        self.gcloud, self.node = shutil.which('gcloud'), shutil.which('node')
        require(self.gcloud and self.node, 'gcloud and Node must already be installed and on PATH.')
        # Check built-in crypto capability without creating any key.
        self.command([self.node, '-e', NODE_PROBE])
        # Read the actual active selection without --account: that flag would
        # override core/account and could make a different session look selected.
        try:
            auth = json.loads(self.command([self.gcloud, 'auth', 'list', '--quiet',
                                           '--verbosity=none', '--no-log-http', '--format=json']))
        except (ValueError, UnicodeError):
            raise Stop('Invalid account metadata; stop.') from None
        require(isinstance(auth, list) and [a.get('account') for a in auth
                if a.get('status') == 'ACTIVE'] == [OWNER], 'Exact human owner must be the active account.')
        value = self.command([self.gcloud, 'config', 'get-value', 'auth/impersonate_service_account',
                              '--project='+PROJECT, '--account='+OWNER, '--quiet',
                              '--verbosity=none', '--no-log-http']).decode().strip()
        require(value in ('', '(unset)'), 'Configured impersonation is not permitted.')
        p = self.gc('projects', 'describe', PROJECT)
        require(p.get('projectId') == PROJECT and str(p.get('projectNumber')) == NUMBER
                and p.get('lifecycleState') == 'ACTIVE', 'Wrong/inactive project or project number.')
        policy = self.gc('projects', 'get-iam-policy', PROJECT)
        require(any(b.get('role') == 'roles/owner' and not b.get('condition')
                    and 'user:'+OWNER in b.get('members', []) for b in policy.get('bindings', [])),
                'Exact human requires a direct unconditional project Owner binding; do not change IAM here.')

    def version_name(self, name, secret):
        match = re.fullmatch(r'projects/('+PROJECT+'|'+NUMBER+r')/secrets/'+secret+r'/versions/([1-9][0-9]*)', name)
        require(match is not None, 'Foreign/malformed version metadata; stop.')
        return f'projects/{NUMBER}/secrets/{secret}/versions/{match.group(2)}'

    def versions(self, secret):
        rows = self.gc('secrets', 'versions', 'list', secret)
        require(isinstance(rows, list), 'Version list is malformed; stop.')
        result = []
        for row in rows:
            name = self.version_name(row.get('name', ''), secret)
            require(row.get('state') in ('ENABLED', 'DISABLED', 'DESTROYED'), 'Unknown version state; stop.')
            result.append((name, row['state'], row.get('createTime', ''), row.get('destroyTime', '')))
        require(len({r[0] for r in result}) == len(result), 'Duplicate version metadata; stop.')
        return tuple(sorted(result))

    def inventory(self):
        result = {}
        for name in ALL:
            meta = self.gc('secrets', 'describe', name)
            require(meta.get('name') in (f'projects/{PROJECT}/secrets/{name}', f'projects/{NUMBER}/secrets/{name}')
                    and meta.get('labels', {}).get('bridge') == MARKER,
                    'Wrong secret container or bootstrap label; stop before generation.')
            result[name] = self.versions(name)
        self.require_google(result)
        return result

    def require_google(self, snapshot):
        require(any(r[0] == f'projects/{NUMBER}/secrets/{GOOGLE}/versions/1' and r[1] == 'ENABLED'
                    for r in snapshot[GOOGLE]), 'Google client-secret version 1 must already be ENABLED; it will never be read or written.')

    def unchanged(self, snapshot):
        current = {name: self.versions(name) for name in ALL}
        self.require_google(current)
        require(current == snapshot, 'Version metadata changed since preflight; stop without regenerating or overwriting.')

    def generate(self, name):
        # These are the existing reviewed seed-secrets.py formats.
        if name == 'mw-grafana-state-key':
            return base64.b64encode(secrets.token_bytes(32))
        if name in ('mw-grafana-hmac', 'mw-grafana-cookie-keys'):
            return json.dumps([secrets.token_urlsafe(48)]).encode()
        require(name == 'mw-grafana-oauth-jwks', 'Not one of the four application secrets.')
        return self.command([self.node, '-e', NODE_JWKS])

    def execute(self, check_only=False):
        require(check_only or sys.stdin.isatty(), 'Writes require the owner\'s interactive terminal.')
        self.baseline()
        snapshot = self.inventory()  # ALL tools, containers and versions before any generation/write.
        missing = [name for name in APPS if not snapshot[name]]
        print(f'Checked {OWNER} / {PROJECT} ({NUMBER}); Google version 1 ENABLED.\n'
              f'Missing app containers: {", ".join(missing) or "none"}. All existing versions are retained.', file=sys.stderr)
        if check_only:
            print('Read-only check complete; no keys generated or versions added.', file=sys.stderr)
            return
        if missing:
            print('This adds one version only to each missing application secret, using in-memory generation and stdin.\n'
                  'It does not read the Google secret, deploy, grant OAuth, change IAM/DNS, or activate delivery.\n'
                  'Run no other seeder/secret writer concurrently. If an upload is uncertain, stop and inspect metadata;\n'
                  'there is no atomic empty-container precondition in Secret Manager. No automatic retry or deletion.\n'
                  f'Type {CONFIRM} to authorize these additions:', file=sys.stderr, flush=True)
            require(sys.stdin.readline().strip() == CONFIRM, 'Not confirmed; no keys generated or versions added.')
            self.baseline()  # Recheck identity/tools after human interaction.
            self.unchanged(snapshot)
            for name in missing:
                self.unchanged(snapshot)  # Catch existing versions/disabled Google before generating.
                data = self.generate(name)
                try:
                    self.unchanged(snapshot)  # Catch races during generation, before upload.
                    added = self.gc('secrets', 'versions', 'add', name, '--data-file=-', data=data)
                finally:
                    del data
                canonical = self.version_name(added.get('name', ''), name)
                require(canonical.endswith('/versions/1') and added.get('state') == 'ENABLED',
                        'Upload returned an unexpected version/state; stop and inspect Console. Never delete or retry blindly.')
                self.created.append(canonical)
                print(canonical, flush=True)  # Version resource names ONLY on stdout.
                rows = self.versions(name)
                require(len(rows) == 1 and rows[0][:2] == (canonical, 'ENABLED'),
                        'Concurrent/uncertain upload detected; stop. Retain all versions and inspect Console.')
                snapshot[name] = rows
            self.unchanged(snapshot)
        for name in ALL:
            for row in snapshot[name]:
                if row[0] not in self.created:
                    print(row[0])
        print('Completed. Existing disabled/destroyed versions remain unchanged; review before runtime use.\n'
              'Only version names may be shared. Seeding does not establish deployment readiness.', file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Metadata/tool checks only; no generation or writes')
    args = parser.parse_args()
    try:
        Seeder().execute(args.check)
    except Stop as error:
        print('STOP: '+str(error)+'\nRetain all versions. Inspect metadata before any retry; no automatic cleanup.', file=sys.stderr)
        return 1
    except (ValueError, TypeError, KeyError, KeyboardInterrupt, EOFError):
        # No opaque response, process output, traceback or secret-bearing exception is replayed.
        print('STOP: preflight/confirmation/upload did not complete. Retain all versions. Inspect version metadata\n'
              'in Secret Manager before any retry; no automatic cleanup, retry or deployment was performed.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
