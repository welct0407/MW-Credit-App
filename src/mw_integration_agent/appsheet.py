from __future__ import annotations

import json
import re
import urllib.parse
import urllib.error
import urllib.request
from typing import Any

from .config import ConfigurationError, load_secret


class AppSheet:
    def __init__(self, config: dict[str, Any], app: str = 'oltp'):
        if app not in ('oltp', 'olap'):
            raise ConfigurationError('Unknown AppSheet application')
        self.config = dict(config)
        self.app = app
        if app == 'olap':
            if not config.get('appsheet_olap_app_id') or not config.get('appsheet_olap_key_file'):
                raise ConfigurationError('OLAP API connection is not configured')
            self.config['appsheet_app_id'] = config['appsheet_olap_app_id']
            self.config['appsheet_key_file'] = config['appsheet_olap_key_file']

    def find(self, table: str, selector: str) -> list[dict[str, Any]]:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9 _-]{0,63}", table):
            raise ConfigurationError("invalid AppSheet table name")
        if not selector.startswith("Top(") or len(selector) > 500:
            raise ConfigurationError("AppSheet reads require a bounded Top selector")
        base = self.config.get("appsheet_api_base", "https://www.appsheet.com")
        if base != "https://www.appsheet.com":
            raise ConfigurationError("unapproved AppSheet API endpoint")
        app_id = self.config["appsheet_app_id"]
        url = f"{base}/api/v2/apps/{app_id}/tables/{urllib.parse.quote(table, safe='')}/Action"
        payload = {
            "Action": "Find",
            "Properties": {
                "Locale": "en-US",
                "Timezone": "Asia/Bangkok",
                "Selector": selector,
            },
            "Rows": [],
        }
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "ApplicationAccessKey": load_secret(self.config, "appsheet_key_file"),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            raise ConfigurationError(f"AppSheet API request failed with HTTP {exc.code}") from exc
        except Exception as exc:
            raise ConfigurationError("AppSheet API request failed") from exc
        if not isinstance(result, list) or not all(isinstance(row, dict) for row in result):
            raise ConfigurationError("AppSheet API returned an unexpected response")
        return result

    def probe(self) -> dict[str, Any]:
        rows = self.find("Partners", "Top(Filter(Partners, true), 10)")
        return {
            "authenticated": True,
            "app": self.app,
            "app_id": self.config["appsheet_app_id"],
            "table": "Partners",
            "row_count": len(rows),
            "bounded": True,
        }
