#!/usr/bin/env python3
"""Human-only Google subject verification using existing Cloud Shell credentials.

Standalone Python standard library. Agents must not run this against live credentials.
No login, consent, IAM, secret read/write, token files or token arguments.
"""
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

OWNER = 'welct0407@mw-credit.com'
USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'
LIMIT = 8192


class Stop(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise Stop(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Stop('UserInfo redirect refused; stop.')


class Identity:
    def __init__(self):
        self.gcloud = None

    def command(self, *args):
        # Only invocation settings; never change the user's SDK configuration.
        env = dict(os.environ, CLOUDSDK_CORE_LOG_HTTP='false',
                   CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true', CLOUDSDK_CORE_VERBOSITY='none')
        try:
            result = subprocess.run([self.gcloud, *args, '--quiet', '--verbosity=none', '--no-log-http'],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=30, check=False, env=env)
        except (OSError, subprocess.TimeoutExpired):
            raise Stop('Credential metadata/token command failed; stop without login or retry.') from None
        require(result.returncode == 0, 'Existing credentials unavailable; stop without login or consent.')
        return result.stdout

    def baseline(self):
        require(os.name == 'posix', 'Use the existing Linux Google Cloud Shell.')
        require(not any(v for k, v in os.environ.items()
                        if k.startswith('CLOUDSDK_AUTH_') or k == 'GOOGLE_APPLICATION_CREDENTIALS'),
                'Credential/impersonation override present; stop.')
        self.gcloud = shutil.which('gcloud')
        require(self.gcloud, 'gcloud must already be installed; do not install here.')
        try:
            # No --account here: verify the actual selected session first.
            accounts = json.loads(self.command('auth', 'list', '--format=json'))
            require(isinstance(accounts, list) and
                    [a.get('account') for a in accounts if a.get('status') == 'ACTIVE'] == [OWNER],
                    'Exact human owner must be the actual active account.')
            value = self.command('config', 'get-value', 'auth/impersonate_service_account').decode().strip()
        except (ValueError, UnicodeError, AttributeError):
            raise Stop('Account metadata invalid; stop.') from None
        require(value in ('', '(unset)'), 'Configured impersonation is not permitted.')

    def userinfo(self, token):
        # Default trust roots/certificate+hostname verification and system proxy policy.
        opener = urllib.request.build_opener(NoRedirect(),
                    urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        request = urllib.request.Request(USERINFO, headers={'Authorization': 'Bearer '+token,
                                                          'Accept': 'application/json'}, method='GET')
        try:
            with opener.open(request, timeout=15) as response:
                require(response.status == 200 and response.geturl() == USERINFO,
                        'UserInfo response rejected; stop.')
                body = response.read(LIMIT+1)
            require(len(body) <= LIMIT, 'UserInfo response too large; stop.')
            return json.loads(body)
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError):
            # Do not replay exception URLs, headers, bodies, SDK output or tokens.
            raise Stop('UserInfo unavailable or existing token lacks openid/email scope; stop without consent fallback.') from None

    def verify(self):
        self.baseline()
        # stdout stays in this process's memory; no token is an argv item or file.
        raw = self.command('auth', 'print-access-token', '--account='+OWNER)
        try:
            token = raw.decode('ascii').strip()
        except UnicodeError:
            raise Stop('Invalid existing token; stop.') from None
        require(0 < len(token) <= LIMIT and re.fullmatch(r'[A-Za-z0-9._~-]+', token),
                'Invalid existing token; stop.')
        try:
            result = self.userinfo(token)
        finally:
            # Python cannot guarantee zeroization; references are dropped promptly.
            token = None
            raw = None
        require(isinstance(result, dict) and result.get('email') == OWNER and
                result.get('email_verified') is True and isinstance(result.get('sub'), str) and
                re.fullmatch(r'[A-Za-z0-9_-]{1,255}', result['sub']),
                'UserInfo does not prove the exact verified human owner; stop.')
        return {'sub': result['sub'], 'email': OWNER, 'email_verified': True}


def main():
    try:
        require(len(sys.argv) == 1, 'This helper takes no arguments.')
        require(sys.stdin.isatty() and sys.stdout.isatty(), 'Run only in the human owner interactive terminal.')
        print('Read-only identity check using your existing gcloud credentials. No login/consent fallback.', file=sys.stderr)
        result = Identity().verify()
        print(json.dumps(result, separators=(',', ':')))
        return 0
    except Stop as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print('Identity verification failed; stop without retry or consent.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
