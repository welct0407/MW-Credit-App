"""DB-ACCESS-07 for Python clients: the instance's public server CA, fetched at
runtime into the private root and accepted only when it matches the SHA-256 pinned
in database/environments.json (same rule as Common.ps1 Get-DbServerCa)."""
import base64
import hashlib
from pathlib import Path
import re
import shutil
import subprocess


def pem_sha256(path):
    match = re.search(r'-----BEGIN CERTIFICATE-----(.+?)-----END CERTIFICATE-----', Path(path).read_text(), re.S)
    if not match: raise ValueError('Not a PEM certificate')
    return hashlib.sha256(base64.b64decode(''.join(match[1].split()))).hexdigest()


def gcloud_server_ca(instance):
    gcloud = shutil.which('gcloud') or 'gcloud'  # gcloud.cmd on Windows
    return subprocess.check_output([gcloud, 'sql', 'instances', 'describe', instance, '--project=clever-oasis-508610-n7',
                                    '--format=value(serverCaCert.cert)'], text=True)


def pinned_server_ca(target, path, fetch=gcloud_server_ca):
    pin = target.get('serverCaSha256') or ''
    if not re.fullmatch(r'[0-9a-f]{64}', pin): raise ValueError('Pinned server CA fingerprint missing')
    path = Path(path)
    if path.is_file() and pem_sha256(path) == pin: return path
    path.parent.mkdir(parents=True, exist_ok=True)
    candidate = path.with_name(path.name + '.new')
    candidate.write_text(fetch(target['instance']).strip() + '\n')
    if pem_sha256(candidate) != pin:
        candidate.unlink()
        raise ValueError('Cloud SQL server CA differs from the pinned fingerprint; review a CA rotation before updating database/environments.json')
    candidate.replace(path)
    return path
