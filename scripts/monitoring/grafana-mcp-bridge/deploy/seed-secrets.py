#!/usr/bin/env python3
"""Human-run secret seeding. Values stay in process memory and Secret Manager stdin."""
import argparse
import base64
import getpass
import json
import secrets
import subprocess
import sys
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('owner-bootstrap.py'))
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner', required=True, help='Verified human owner or the explicitly approved fixed deployment service account')
    parser.add_argument('--gcloud-executable', help='Reviewed SDK launcher or approved saved-environment adapter path')
    parser.add_argument('--adapter-mode', action='store_true', help='Approved Linux fixed-identity Python/shim mode; secure credential entry stays required')
    args = parser.parse_args()
    bootstrap.OWNER = args.owner
    bootstrap.configure_adapter(args.adapter_mode)
    bootstrap.configure_gcloud(args.gcloud_executable)
    bootstrap.baseline()
    for name in bootstrap.SECRETS:
        metadata = bootstrap.gc('secrets', 'describe', name)
        bootstrap.require(metadata.get('labels', {}).get('bridge') == bootstrap.MARKER, f'Unexpected secret {name}')
        versions = bootstrap.gc('secrets', 'versions', 'list', name)
        if versions:
            # Even disabled/destroyed versions mean recovery/rotation, never initialization.
            print(f'{name}: existing versions retained; not regenerated')
            continue
        if name == 'mw-grafana-google-client-secret':
            bootstrap.require(sys.stdin.isatty(), 'Google client secret requires the owner\'s interactive terminal')
            value = getpass.getpass('Enter Google web OAuth client secret (hidden; never paste in chat): ')
            bootstrap.require(bool(value) and '\n' not in value, 'Empty/invalid Google client secret')
            data = value.encode()
        elif name == 'mw-grafana-state-key':
            data = base64.b64encode(secrets.token_bytes(32))
        elif name in ('mw-grafana-hmac', 'mw-grafana-cookie-keys'):
            data = json.dumps([secrets.token_urlsafe(48)]).encode()
        else:
            javascript = "const c=require('node:crypto'); const {privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048}); const k=privateKey.export({format:'jwk'}); k.kid=c.randomUUID(); k.use='sig'; k.alg='RS256'; process.stdout.write(JSON.stringify({keys:[k]}));"
            data = subprocess.run(['node', '-e', javascript], capture_output=True, check=True).stdout
        # No secret in argv, environment, filesystem, exception messages or normal output.
        try:
            result = json.loads(bootstrap.gcloud_output('secrets', 'versions', 'add', name, '--data-file=-', data=data))
        except RuntimeError:
            raise RuntimeError(f'Secret version addition failed for {name}; inspect owner Console without printing secret contents') from None
        print(result['name'])  # Version resource name only.
        del data
    print('Retain the version numbers for the runtime template. Do not retrieve/transmit values through agents.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f'STOP: {error if not isinstance(error, subprocess.CalledProcessError) else "Key generation failed"}', file=sys.stderr)
        sys.exit(1)
