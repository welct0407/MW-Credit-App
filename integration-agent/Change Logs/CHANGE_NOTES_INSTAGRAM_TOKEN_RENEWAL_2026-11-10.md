# Change notes — Instagram token outage and automatic renewal, 10 November 2026

## Purpose
Owner request of 10 November 2026 ("Check what's wrong either polling in Debian agent. Grafana shows alert", then "enable automatic renewal feature of this token"): restore the conversation poll and stop the Instagram access token from expiring unnoticed again.

## Incident
- Grafana `MW | Debian component unhealthy` fired for `polling` (state 0, Down). From 17:25:18Z on 9 November (00:25 Bangkok, 10 November) every `mw-conversation-poll` run exited 2 with `Instagram REJECTED (HTTP 401, code 190, subcode 0)`, about 410 runs; the last success was 17:24:17Z. Code 190 is an invalid access token. The token file was written on 20 September 2026 at 13:22Z and nothing renewed it, so the long-lived token most likely reached its 60-day lifetime. The occasional earlier failures (`HTTP 500, code 1`) were Meta-side and recovered on the next run.
- Restore: the owner generated a new token in the Meta app dashboard and created Secret Manager `mw-instagram-access-token` version 1 (01:32:28Z). It was copied from Secret Manager into `/etc/mw-integration-agent/secrets/instagram-access-token.txt` over `mw-debian-ssh` (stdin to `install -m 0640 -o root -g mwagent`, then an atomic rename; never printed) at 01:33:24Z. The next poll at 01:33:34Z succeeded (41 conversations, 1 new message, 1 image job, 0 failed); the cursor had been preserved, so nothing from the outage was skipped.

## Changes
- `scripts/instagram-token-refresh.py` (new, standard library, run as root): installs the latest Secret Manager version into the token file when they differ; when the file is 7 days old renews the token with Meta (`GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`), adds the new token as a secret version first, then rewrites the file atomically (root:mwagent 0640) and destroys versions older than the newest three. A failure before the file write leaves the old, still valid token in use. Output is one JSON line; errors carry only a fixed reason (HTTP status and Graph code), never a URL, body or token. `--force` renews at once.
- `systemd/mw-instagram-token-refresh.service` and `.timer` (new): daily at 04:23 Bangkok, `Persistent=true`; root with `CapabilityBoundingSet=CAP_CHOWN`, `ProtectSystem=strict` and only the secrets directory writable.
- `infrastructure/ecosystem-debian/instagram-token.tf` (new): `secretAccessor` and `secretVersionManager` for `mw-integration-agent@` on `mw-instagram-access-token` only.
- `project/scripts/monitoring/debian-health.py`: new component `ig_token` from the token file's modification time (never its content): Healthy if renewed within 10 days, Degraded after that (pages with about 50 days left), Down after 50 days. `debian-alert.jq` and the Grafana rule `afz3o5cmmfabkb` in `infrastructure/grafana/owned-services.tf.json` add `ig_token` to the watched components and describe it.
- Tests: `tests/test_instagram_token_refresh.py` (sync, renewal at 7 days, secret-before-file order, failure keeps the old file, Meta rejection changes nothing, version pruning, sanitized errors); `test_debian_health.py` `IgTokenStatusTests`.
- Docs: `docs/OPERATIONS.md` (renewal and manual rotation through Secret Manager), `infrastructure/ecosystem-debian/README.md`, `infrastructure/grafana/README.md`, `project/Documents/Resource_Monitoring.md`, `project/Documents/Environment_Inventory.md`.

## Live changes (owner instruction of 10 November 2026)
| Step | Result |
| --- | --- |
| Terraform `ecosystem-debian` saved plan (2 add, 0 change, 0 destroy; sha256 `cf23cef1…`) | Applied; re-plan No changes; `get-iam-policy` shows exactly the two bindings |
| Install script (sha256 `afb465f0…211a`, root 0755) and units (0644), `systemd-analyze verify`, `daemon-reload` | Verify ok; repository and host hashes match |
| `systemctl start mw-instagram-token-refresh.service` | `{"status": "ok", "action": "none", "version": 1, "file_age_days": 0.0}`: the VM reads the secret and the file is in sync |
| `systemctl enable --now mw-instagram-token-refresh.timer` | Enabled; next run 11 November 04:25 Bangkok |
| Collector deploy (pre-deploy equalled `main` `6c72952e…`; backup `debian-health.before-igtoken-20261110.py`; new `71fa41cb…`) | Manual run success; all 20 components 1, including `polling` and `ig_token` |
| Grafana `scripts/grafana/manage.py` saved plan (1 change: rule group `performance`, only rule `MW \| Debian component unhealthy` selector and description; sha256 `f6a86a32…`) | Applied; re-plan No changes |

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest tests.test_instagram_token_refresh` (in `integration-agent/`) | 14 OK |
| `python3 -m unittest test_debian_health test_receipt_queries test_dashboard_queries` (in `project/scripts/monitoring/`) | 163 OK |
| `python3 tests/grafana/test_manage.py` | OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 740 run; 1 failure and 22 errors, the same as without the change (database drivers missing in the cloud session, `test_server` startup) |
| `ruff check --no-cache` on the new files | Clean; the 7 findings in `debian-health.py` predate this change |

## Not run
- A real Meta renewal: Meta renews only tokens at least 24 hours old. The first scheduled renewal is due on the run of 17 November 2026 (file 7 days old); `--force` after 11 November 01:33Z exercises it sooner.

## Recovery
`systemctl disable --now mw-instagram-token-refresh.timer` stops renewals; the file keeps working until its token expires. Restore `/opt/mw-resource-monitoring/debian-health.before-igtoken-20261110.py` for the collector and revert the rule change through the Grafana runner. The two IAM bindings can be removed by reverting `instagram-token.tf` and applying a reviewed plan. Manual rotation: add a secret version in the console and start the service.

## Open questions
None.

## Remaining work
- Confirm the first automatic renewal on 17 November 2026 (`action` `refreshed`, secret version 2, `ig_token` stays Healthy).
