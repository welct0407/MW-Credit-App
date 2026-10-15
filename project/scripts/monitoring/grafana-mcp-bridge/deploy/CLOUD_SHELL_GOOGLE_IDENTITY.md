# Human-only Google identity check

The standalone [cloud-shell-google-identity.py](cloud-shell-google-identity.py)
uses the owner's existing Google Cloud Shell session to obtain the immutable
Google `sub` for **welct0407@mw-credit.com**. It makes no login/consent, IAM,
deployment or secret changes. Agents must not run it with live credentials.
The single Python file is the complete handoff and can be delivered through
Library later; no repository clone, dependencies, downloads or installer are
required after receiving the reviewed file.

In the existing owner Cloud Shell, save/upload that reviewed file and run:

```sh
python3 cloud-shell-google-identity.py
```

Do not use shell tracing, token commands, terminal recording, output redirection
or pipe this helper. It accepts no arguments and requires an interactive terminal.
It verifies the actual active human account without an account selector and
rejects credential overrides and configured impersonation before requesting a
token for that exact account. It captures `gcloud auth print-access-token` stdout
in process memory only, disables SDK HTTP/file logging for those child commands,
and supplies the token only in the HTTPS Authorization header. It creates no
token file, argv item, stdout output or diagnostic transcript. The existing SDK
owns its ordinary credential lifecycle; the helper does not promise memory
zeroization or alter the SDK's existing credential store.

The [Google discovery document](https://accounts.google.com/.well-known/openid-configuration)
names `https://openidconnect.googleapis.com/v1/userinfo`. The helper uses only
that endpoint, default TLS certificate/hostname verification, the system proxy
policy, no redirects, a 15-second HTTP timeout and an 8 KiB response bound.
[Google documents](https://developers.google.com/identity/openid-connect/openid-connect)
the stable subject and UserInfo claims. Existing credentials must already allow
`openid` and email information. An unavailable/expired credential, denied request,
missing scope or mismatch stops; there is no consent, login or alternate-route
fallback. Return the safe error text for review; never paste a token or raw
UserInfo response.

Successful stdout contains only `sub`, the exact matching email and
`email_verified:true`. Use this verified `sub` for the later
`OWNER_GOOGLE_SUB` configuration review. The helper does not apply configuration,
issue a bridge grant or verify the separate Google web OAuth application's
consent/callback. Keeping the deployed inert revision and owner activation off
is a separate boundary and remains in force.

Offline verification only:

```sh
python3 -B deploy/test_cloud_shell_google_identity.py
```

These tests mock gcloud, token and HTTP operations. They never use real tokens or
contact Google. Preparation/test evidence is in the
[CIMD checkpoint](../../../../outputs/grafana-cimd-20261003/README.md).
