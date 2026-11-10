"""Instagram token renewal: sync from Secret Manager, renew at 7 days, write order, sanitized errors."""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest import mock

SCRIPT = Path(__file__).parents[1] / 'scripts' / 'instagram-token-refresh.py'
spec = importlib.util.spec_from_file_location('instagram_token_refresh', SCRIPT)
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

OLD = 'IGAA' + 'o' * 60
NEW = 'IGAA' + 'n' * 60
OWNER = 'IGAA' + 'w' * 60
DAY = 86400


class FakeClient:
    def __init__(self, versions):
        self.store = dict(versions)  # number -> token
        self.calls = []
        self.fail_add = False

    def access_latest(self, project, secret):
        number = max(self.store)
        return number, self.store[number]

    def add_version(self, project, secret, value):
        self.calls.append('add')
        if self.fail_add:
            raise refresh.RefreshError('SM_ADD_HTTP403')
        number = max(self.store) + 1
        self.store[number] = value
        return number

    def versions(self, project, secret):
        return [(n, 'ENABLED') for n in self.store]

    def destroy(self, project, secret, number):
        self.calls.append(('destroy', number))
        del self.store[number]


class RunTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, 'instagram-access-token.txt')
        self.clock = 1_800_000_000.0
        self.gid = os.getgid()
        self.chown = mock.patch.object(refresh.os, 'fchown', lambda *a: None)
        self.chown.start()

    def tearDown(self):
        self.chown.stop()
        self.dir.cleanup()

    def args(self, *extra):
        return refresh.parser().parse_args(['--token-file', self.path, *extra])

    def install(self, value, age_days):
        Path(self.path).write_text(value + '\n')
        os.utime(self.path, (self.clock - age_days * DAY,) * 2)

    def run_once(self, client, renew=None, *extra):
        renew = renew or (lambda token: (NEW, 60 * DAY))
        return refresh.run(self.args(*extra), client, refresh=renew, now=lambda: self.clock, gid=self.gid)

    def test_fresh_file_matching_master_does_nothing(self):
        self.install(OLD, 2)
        client = FakeClient({1: OLD})
        result = self.run_once(client, lambda token: self.fail('must not renew'))
        self.assertEqual(result, {'status': 'ok', 'action': 'none', 'version': 1, 'file_age_days': 2.0})
        self.assertEqual(client.calls, [])

    def test_owner_console_version_is_installed_without_renewal(self):
        self.install(OLD, 30)
        client = FakeClient({1: OLD, 2: OWNER})
        result = self.run_once(client, lambda token: self.fail('just installed: too young to renew'))
        self.assertEqual(result['action'], 'synced')
        self.assertEqual(Path(self.path).read_text(), OWNER + '\n')
        self.assertEqual(oct(os.stat(self.path).st_mode & 0o777), '0o640')

    def test_missing_file_is_installed(self):
        result = self.run_once(FakeClient({1: OLD}))
        self.assertEqual(result['action'], 'synced')
        self.assertEqual(Path(self.path).read_text(), OLD + '\n')

    def test_seven_day_old_token_is_renewed_secret_first_then_file(self):
        self.install(OLD, 7)
        client = FakeClient({1: OLD})
        seen = []
        result = self.run_once(client, lambda token: (seen.append(token), (NEW, 5183944))[1])
        self.assertEqual(seen, [OLD])
        self.assertEqual(result['action'], 'refreshed')
        self.assertEqual(result['version'], 2)
        self.assertEqual(client.store[2], NEW)
        self.assertEqual(Path(self.path).read_text(), NEW + '\n')
        self.assertEqual(result['expires_in_days'], 60.0)
        self.assertNotIn(NEW, json.dumps(result))
        self.assertNotIn(OLD, json.dumps(result))

    def test_secret_write_failure_keeps_old_file(self):
        self.install(OLD, 8)
        client = FakeClient({1: OLD})
        client.fail_add = True
        with self.assertRaises(refresh.RefreshError):
            self.run_once(client)
        self.assertEqual(Path(self.path).read_text(), OLD + '\n')

    def test_meta_rejection_changes_nothing(self):
        self.install(OLD, 8)
        client = FakeClient({1: OLD})
        def rejected(token):
            raise refresh.RefreshError('META_REFRESH_HTTP400_CODE190')
        with self.assertRaises(refresh.RefreshError):
            self.run_once(client, rejected)
        self.assertEqual(client.calls, [])
        self.assertEqual(Path(self.path).read_text(), OLD + '\n')

    def test_old_versions_beyond_three_are_destroyed(self):
        self.install('IGAA' + '4' * 60, 9)
        client = FakeClient({n: 'IGAA' + str(n) * 60 for n in range(1, 5)})
        result = self.run_once(client)
        self.assertEqual(result['destroyed_versions'], [2, 1])
        self.assertEqual(sorted(client.store), [3, 4, 5])

    def test_force_renews_young_file(self):
        self.install(OLD, 1)
        result = self.run_once(FakeClient({1: OLD}), None, '--force')
        self.assertEqual(result['action'], 'refreshed')

    def test_invalid_new_token_is_not_stored(self):
        self.install(OLD, 8)
        client = FakeClient({1: OLD})
        with self.assertRaises(refresh.RefreshError):
            self.run_once(client, lambda token: (refresh.valid_token('bad token'), 60 * DAY))
        self.assertEqual(client.calls, [])


class TransportTests(unittest.TestCase):
    def test_meta_refresh_parses_reply_and_rejects_short_expiry(self):
        captured = {}
        def request(url, **kw):
            captured['url'] = url
            return {'access_token': NEW, 'token_type': 'bearer', 'expires_in': 5183944}
        self.assertEqual(refresh.meta_refresh(OLD, request), (NEW, 5183944))
        self.assertIn('grant_type=ig_refresh_token', captured['url'])
        with self.assertRaisesRegex(refresh.RefreshError, 'META_REFRESH_NO_EXPIRY'):
            refresh.meta_refresh(OLD, lambda url, **kw: {'access_token': NEW, 'expires_in': 10})

    def test_http_error_names_code_only(self):
        body = json.dumps({'error': {'message': 'secret detail ' + OLD, 'code': 190, 'error_subcode': 463}}).encode()
        error = urllib.error.HTTPError('https://graph.instagram.com/x?access_token=' + OLD, 400, 'Bad', {}, io.BytesIO(body))
        opener = mock.Mock()
        opener.open.side_effect = error
        with mock.patch.object(refresh.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(refresh.RefreshError) as caught:
                refresh.http_json('https://graph.instagram.com/x', label='META_REFRESH')
        self.assertEqual(str(caught.exception), 'META_REFRESH_HTTP400_CODE190_SUB463')

    def test_network_error_names_class_only(self):
        opener = mock.Mock()
        opener.open.side_effect = TimeoutError('https://example?access_token=' + OLD)
        with mock.patch.object(refresh.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(refresh.RefreshError, '^SM_ACCESS_TimeoutError$'):
                refresh.http_json('https://secretmanager.googleapis.com/v1/x', label='SM_ACCESS')

    def test_secret_manager_access_decodes_latest(self):
        replies = iter([{'access_token': 'ya29.x'},
                        {'name': 'projects/1/secrets/s/versions/7',
                         'payload': {'data': base64.b64encode((OLD + '\n').encode()).decode()}}])
        client = refresh.GoogleClient(lambda url, **kw: next(replies))
        self.assertEqual(client.access_latest('p', 's'), (7, OLD))

    def test_main_prints_sanitized_error(self):
        with mock.patch.object(refresh, 'run', side_effect=refresh.RefreshError('SM_ACCESS_HTTP403')), \
                mock.patch('sys.stdout', new_callable=io.StringIO) as out:
            self.assertEqual(refresh.main([]), 2)
        self.assertEqual(json.loads(out.getvalue()), {'status': 'error', 'error': 'SM_ACCESS_HTTP403'})


if __name__ == '__main__':
    unittest.main()
