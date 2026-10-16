"""Private GCS originals. VM identity, conditional create, exact generation readback."""
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request

from .config import ConfigurationError
from .http import access_token

BUCKET = 'mw-payment-receipts-prod-508610-n7'
LIMIT = 12_000_000


class GCS:
    def __init__(self, config):
        if config.get('receipt_bucket') != BUCKET:
            raise ConfigurationError('UNAPPROVED_RECEIPT_BUCKET')

    def request(self, url, data=None, mime=None):
        headers = {'Authorization': 'Bearer ' + access_token(timeout=10)}
        if mime:
            headers['Content-Type'] = mime
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=60) as response:
            return response.read(LIMIT + 1)

    def read(self, key, generation):
        endpoint = 'https://storage.googleapis.com/storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(key, safe='')
        return self.request(endpoint + '?' + urllib.parse.urlencode({'alt': 'media', 'generation': generation}))

    def put(self, key, data, mime):
        base = 'https://storage.googleapis.com/'
        url = base + 'upload/storage/v1/b/' + BUCKET + '/o?' + urllib.parse.urlencode(
            {'uploadType': 'media', 'name': key, 'ifGenerationMatch': '0'})
        try:
            metadata = json.loads(self.request(url, data, mime))
        except urllib.error.HTTPError as exc:
            if exc.code != 412:
                raise
            metadata = json.loads(self.request(base + 'storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(key, safe='')))
        generation = str(metadata['generation'])
        raw = self.read(key, generation)
        if (metadata.get('name') != key or metadata.get('bucket') != BUCKET
                or int(metadata['size']) != len(data) or len(raw) != len(data)
                or hashlib.sha256(raw).digest() != hashlib.sha256(data).digest()):
            raise ConfigurationError('RECEIPT_INTEGRITY_CONFLICT')
        return generation, metadata['crc32c']
