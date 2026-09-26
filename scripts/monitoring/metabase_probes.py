"""Bounded health probes. No business rows, public sharing or administrator key."""
import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'MW-Resource-Monitor/1.0', **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as r:
            return r.status, r.read(100000).decode()
    except urllib.error.HTTPError as e:
        return e.code, ''


def classify(ok, elapsed, code):
    if code in (401, 403, 429):
        return 4  # Probe access/rate failure is not proof of service failure.
    return (2 if elapsed > 5 else 1) if ok else 0


def probe(component):
    started = time.monotonic()
    code = 0
    try:
        if component == 'metabase_reporting':
            key = Path('/etc/mw-resource-monitoring/metabase-probe-key.txt').read_text().strip()
            code, body = request('https://reports.mw-credit.com/api/card/276/query',
                                 b'{"ignore_cache":true}',
                                 {'X-API-Key': key, 'Content-Type': 'application/json'})
            result = json.loads(body) if code in (200, 202) else {}
            ok = code in (200, 202) and result.get('status') == 'completed' and result.get('data', {}).get('rows') == [[1]]
        elif component == 'metabase_charts':
            code, body = request('https://charts.mw-credit.com/')
            ok = code == 200 and '<title>Borrower portfolio · custom matrix</title>' in body
            if ok:
                guard, _ = request('https://charts.mw-credit.com/api/matrix')
                ok = guard == 401  # Confirm protected API responds, without requesting private data.
        else:
            path = '/livez' if component == 'metabase_platform' else '/readyz'
            code, body = request('https://reports.mw-credit.com' + path)
            ok = code == 200 and json.loads(body).get('status') == 'ok'
        status = classify(ok, time.monotonic() - started, code)
    except (urllib.error.URLError, TimeoutError):
        status = 0
    except Exception:
        status = 4
    return {'status': status, 'http_code': code, 'duration_ms': round((time.monotonic() - started) * 1000)}


def collect():
    components = ['metabase_platform', 'metabase_appdb', 'metabase_reporting', 'metabase_charts']
    with ThreadPoolExecutor(max_workers=4) as pool:
        result = dict(zip(components, pool.map(probe, components)))
    from metabase_pitr import probe as pitr_probe
    result['metabase_pitr'] = pitr_probe()
    return result
