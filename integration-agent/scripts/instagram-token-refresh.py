#!/usr/bin/python3 -I
"""Keep the Instagram access token renewed (owner instruction, 10 November 2026).

Secret Manager `mw-instagram-access-token` is the master copy; the agent reads the local file
`/etc/mw-integration-agent/secrets/instagram-access-token.txt` (root:mwagent 0640). Each run, as root:

1. Read the latest enabled Secret Manager version. If the file differs (the owner added a version in the
   console, or an earlier run stopped between the two writes), install that version into the file.
2. When the file is at least `--refresh-after-days` old, renew the token with Meta
   (`GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`, a new 60-day token; Meta
   only renews a valid token that is at least 24 hours old), add it as a new Secret Manager version first,
   then rewrite the file. A failure before the file write leaves the old, still valid token in use.
3. After a renewal, destroy enabled or disabled versions older than the newest `--keep-versions`.

The token is never printed, logged or passed on a command line. Output is one JSON line of states, ages
and version numbers. Exit 0 on success, 2 on any failure (systemd records it; the resource collector pages
on token age, not on one failed run). Standard library only.
"""
from __future__ import annotations

import argparse
import base64
import grp
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'clever-oasis-508610-n7'
SECRET = 'mw-instagram-access-token'
TOKEN_FILE = '/etc/mw-integration-agent/secrets/instagram-access-token.txt'
GROUP = 'mwagent'
SM = 'https://secretmanager.googleapis.com/v1/'
META_REFRESH = 'https://graph.instagram.com/refresh_access_token'
METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
TOKEN_RE = re.compile(r'[A-Za-z0-9._|-]{32,4096}')
TIMEOUT = 30
LIMIT = 1 << 20


class RefreshError(Exception):
    """Sanitized failure: a fixed reason, never a URL, response body or token."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RefreshError(f'REDIRECT_DENIED_HTTP{code}')


def http_json(url, *, headers=None, body=None, method=None, label):
    """JSON request with no redirects; errors name `label` and the HTTP status or exception class only."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers=dict(headers or {}), method=method)
    if data is not None:
        request.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=TIMEOUT) as response:
            raw = response.read(LIMIT + 1)
    except urllib.error.HTTPError as exc:
        code = subcode = None
        try:
            detail = json.loads(exc.read(65536)).get('error')
            if isinstance(detail, dict):
                code = detail.get('code') if type(detail.get('code')) is int else None
                subcode = detail.get('error_subcode') if type(detail.get('error_subcode')) is int else None
        except Exception:
            pass
        raise RefreshError(f'{label}_HTTP{exc.code}' + (f'_CODE{code}' if code is not None else '')
                           + (f'_SUB{subcode}' if subcode is not None else '')) from None
    except RefreshError:
        raise
    except Exception as exc:
        raise RefreshError(f'{label}_{type(exc).__name__}') from None
    if len(raw) > LIMIT:
        raise RefreshError(f'{label}_RESPONSE_TOO_LARGE')
    try:
        return json.loads(raw)
    except ValueError:
        raise RefreshError(f'{label}_INVALID_JSON') from None


def valid_token(value):
    if not isinstance(value, str) or not TOKEN_RE.fullmatch(value):
        raise RefreshError('INVALID_TOKEN_SHAPE')
    return value


class GoogleClient:
    """Secret Manager over REST with the VM service account's metadata token."""

    def __init__(self, request=http_json):
        self.request = request
        self._token = None

    def auth(self):
        if self._token is None:
            reply = self.request(METADATA_TOKEN, headers={'Metadata-Flavor': 'Google'}, label='METADATA')
            self._token = reply.get('access_token') if isinstance(reply, dict) else None
            if not isinstance(self._token, str) or not self._token:
                raise RefreshError('METADATA_NO_TOKEN')
        return {'Authorization': 'Bearer ' + self._token}

    def secret_path(self, project, secret):
        return f'projects/{project}/secrets/{secret}'

    def access_latest(self, project, secret):
        """(version number, token) of the newest enabled version."""
        reply = self.request(SM + self.secret_path(project, secret) + '/versions/latest:access',
                             headers=self.auth(), label='SM_ACCESS')
        try:
            number = int(reply['name'].rsplit('/', 1)[1])
            value = base64.b64decode(reply['payload']['data'], validate=True).decode('utf-8').strip()
        except Exception:
            raise RefreshError('SM_ACCESS_MALFORMED') from None
        return number, valid_token(value)

    def add_version(self, project, secret, value):
        data = base64.b64encode(valid_token(value).encode()).decode()
        reply = self.request(SM + self.secret_path(project, secret) + ':addVersion', headers=self.auth(),
                             body={'payload': {'data': data}}, method='POST', label='SM_ADD')
        try:
            return int(reply['name'].rsplit('/', 1)[1])
        except Exception:
            raise RefreshError('SM_ADD_MALFORMED') from None

    def versions(self, project, secret):
        """[(number, state)] of every version that is not destroyed."""
        found, page = [], None
        while True:
            query = {'pageSize': 100, 'filter': 'state:ENABLED OR state:DISABLED'}
            if page:
                query['pageToken'] = page
            reply = self.request(SM + self.secret_path(project, secret) + '/versions?' + urllib.parse.urlencode(query),
                                 headers=self.auth(), label='SM_LIST')
            for item in reply.get('versions', []):
                found.append((int(item['name'].rsplit('/', 1)[1]), item.get('state')))
            page = reply.get('nextPageToken')
            if not page:
                return found

    def destroy(self, project, secret, number):
        self.request(SM + self.secret_path(project, secret) + f'/versions/{number}:destroy', headers=self.auth(),
                     body={}, method='POST', label='SM_DESTROY')


def meta_refresh(token, request=http_json):
    """New long-lived token and its lifetime in seconds."""
    url = META_REFRESH + '?' + urllib.parse.urlencode({'grant_type': 'ig_refresh_token', 'access_token': token})
    reply = request(url, label='META_REFRESH')
    expires = reply.get('expires_in') if isinstance(reply, dict) else None
    new = valid_token(reply.get('access_token') if isinstance(reply, dict) else None)
    if type(expires) is not int or expires < 86400:
        raise RefreshError('META_REFRESH_NO_EXPIRY')
    return new, expires


def read_file(path):
    try:
        with open(path, encoding='utf-8-sig') as handle:
            return handle.read().strip(), os.stat(path).st_mtime
    except FileNotFoundError:
        return None, None


def write_file(path, value, gid):
    """Atomic replace: temporary file in the same directory, root:<gid> 0640, fsync, rename, fsync directory."""
    directory, name = os.path.split(path)
    temporary = os.path.join(directory, '.' + name + '.new')
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
    try:
        os.fchown(descriptor, 0, gid)
        os.fchmod(descriptor, 0o640)
        os.write(descriptor, (valid_token(value) + '\n').encode())
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    folder = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(folder)
    finally:
        os.close(folder)


def run(args, client, refresh=meta_refresh, now=time.time, gid=None):
    result = {'status': 'ok', 'action': 'none'}
    number, master = client.access_latest(args.project, args.secret)
    result['version'] = number
    local, mtime = read_file(args.token_file)
    gid = grp.getgrnam(GROUP).gr_gid if gid is None else gid
    if local != master:
        write_file(args.token_file, master, gid)
        result['action'] = 'synced'
        local, mtime = master, now()
    age = now() - mtime
    result['file_age_days'] = round(age / 86400, 2)
    if age < args.refresh_after_days * 86400 and not args.force:
        return result
    new, expires = refresh(master)
    result['version'] = client.add_version(args.project, args.secret, new)
    write_file(args.token_file, new, gid)
    result.update(action='refreshed', file_age_days=0.0, expires_in_days=round(expires / 86400, 1))
    older = sorted((n for n, _ in client.versions(args.project, args.secret)), reverse=True)[args.keep_versions:]
    for old in older:
        client.destroy(args.project, args.secret, old)
    result['destroyed_versions'] = older
    return result


def parser():
    p = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    p.add_argument('--project', default=PROJECT)
    p.add_argument('--secret', default=SECRET)
    p.add_argument('--token-file', default=TOKEN_FILE)
    p.add_argument('--refresh-after-days', type=float, default=7)
    p.add_argument('--keep-versions', type=int, default=3)
    p.add_argument('--force', action='store_true', help='renew now regardless of file age (token must be 24 h old)')
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    if not 1 <= args.refresh_after_days <= 45 or not 2 <= args.keep_versions <= 20:
        print(json.dumps({'status': 'error', 'error': 'INVALID_ARGUMENTS'}))
        return 2
    try:
        print(json.dumps(run(args, GoogleClient())))
        return 0
    except RefreshError as exc:
        print(json.dumps({'status': 'error', 'error': str(exc)}))
        return 2
    except OSError as exc:
        print(json.dumps({'status': 'error', 'error': 'FILE_' + type(exc).__name__}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
