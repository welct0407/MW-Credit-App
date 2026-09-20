"""Microsoft Graph fallback mail with explicit definite/uncertain outcomes."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .config import ConfigurationError


class EmailRejected(ConfigurationError):
    """The provider request was definitely not accepted."""


class EmailUnknown(ConfigurationError):
    """The provider may have accepted the request; never replay automatically."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def valid_email(value):
    return bool(re.fullmatch(r"[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+", str(value or "")))


class GraphEmail:
    SCOPES = "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send offline_access"

    def __init__(self, config, opener=None):
        self.config = config
        self.opener = opener or urllib.request.build_opener(NoRedirect)

    def _oauth_path(self):
        path = Path(self.config["email_oauth_file"]).resolve()
        try:
            path.relative_to(Path(self.config["secrets_directory"]).resolve())
        except ValueError as exc:
            raise EmailRejected("Email credential path is outside the secrets directory") from exc
        return path

    def token(self):
        # Statement and receipt workers share the rotating OAuth credential.
        # Lock the existing inode, which is already writable in both systemd sandboxes.
        if os.name == 'posix':
            import fcntl
            try:
                with self._oauth_path().open('r+') as lock:
                    fcntl.flock(lock,fcntl.LOCK_EX)
                    return self._token_locked()
            except OSError as exc:
                raise EmailRejected('Email authorization unavailable') from exc
        return self._token_locked()

    def _token_locked(self):
        path = self._oauth_path()
        try:
            saved = json.loads(path.read_text(encoding="utf-8-sig"))
            tenant = saved.get("tenant", "consumers")
            if not re.fullmatch(r"[A-Za-z0-9-]+", tenant):
                raise ValueError()
            data = urllib.parse.urlencode({"client_id": saved["client_id"],
                "refresh_token": saved["refresh_token"], "grant_type": "refresh_token",
                "scope": self.SCOPES}).encode()
            request = urllib.request.Request(
                f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", data=data)
            with self.opener.open(request, timeout=20) as response:
                result = json.load(response)
            token = result["access_token"]
            if result.get("refresh_token") and result["refresh_token"] != saved["refresh_token"]:
                # This single mutable secret is owned by mwagent (0600). Keep refresh rotation durable.
                saved["refresh_token"] = result["refresh_token"]
                with path.open("r+", encoding="utf-8") as stream:
                    stream.seek(0); json.dump(saved, stream); stream.truncate(); stream.flush(); os.fsync(stream.fileno())
            return token
        except Exception as exc:
            raise EmailRejected("Email authorization unavailable") from exc

    def send(self, recipient, subject, body, attachments, operation_key):
        if not valid_email(recipient):
            raise EmailRejected("Partner email is missing or invalid")
        token = self.token()
        headers = {"Authorization": "Bearer " + token}
        try:
            request = urllib.request.Request("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
                headers=headers)
            with self.opener.open(request, timeout=20) as response:
                identity = json.load(response)
        except Exception as exc:
            raise EmailRejected("Email sender identity could not be verified") from exc
        actual = identity.get("mail") or identity.get("userPrincipalName") or ""
        if actual.lower() != self.config["email_sender"].lower():
            raise EmailRejected("Email sender identity mismatch")
        files=[]
        for item in attachments:
            try:
                path=Path(item["path"])
                data=path.read_bytes()
            except (KeyError,OSError,TypeError) as exc:
                raise EmailRejected("Statement attachment is unavailable") from exc
            if hashlib.sha256(data).hexdigest()!=item["sha256"] or not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise EmailRejected("Statement attachment changed")
            if len(data)>2_800_000:
                raise EmailRejected("Statement attachment exceeds Graph simple-attachment limit")
            files.append({"@odata.type":"#microsoft.graph.fileAttachment","name":item["name"],
                          "contentType":"image/png","contentBytes":base64.b64encode(data).decode()})
        if sum(len(item["contentBytes"]) for item in files)>3_000_000:
            raise EmailRejected("Statement attachment set exceeds Graph simple-message limit")
        payload={"message":{"subject":subject,"body":{"contentType":"HTML","content":body},
            "toRecipients":[{"emailAddress":{"address":recipient}}],"attachments":files,
            "internetMessageHeaders":[{"name":"x-mw-operation-key",
                "value":hashlib.sha256(operation_key.encode()).hexdigest()}]},"saveToSentItems":True}
        data=json.dumps(payload).encode()
        request=urllib.request.Request("https://graph.microsoft.com/v1.0/me/sendMail",data=data,
            headers={**headers,"Content-Type":"application/json"},method="POST")
        try:
            with self.opener.open(request,timeout=60) as response:
                if response.status!=202:
                    raise EmailUnknown("Email acceptance is unverified")
        except urllib.error.HTTPError as exc:
            if 400 <= exc.code < 500:
                raise EmailRejected(f"Email rejected (HTTP {exc.code})") from exc
            raise EmailUnknown("Email provider outcome is unknown") from exc
        except EmailUnknown:
            raise
        except Exception as exc:
            raise EmailUnknown("Email provider outcome is unknown") from exc
