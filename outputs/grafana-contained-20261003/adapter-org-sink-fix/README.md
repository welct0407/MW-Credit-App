# Scoped organization sink read correction

The original read failed locally because the fixed adapter's CLI `--project`
conflicted with `--organization`. The user authorized the exact task-local
correction and configuration read on 3 October 2026.

The [bounded patch](scoped-adapter.patch) permits only the literal GA
`logging sinks list` argv for organization `594773370606` and the specified
configuration-only JSON fields. It omits only that command's forced CLI project
flag. The existing fixed service account and project environment, credential
activation, no-impersonation/override controls, TLS, redaction and private cleanup
remain. Every other command retains the forced project; other organization
selectors, IDs, writes, release tracks, abbreviated selectors and changed flags
are rejected before authentication. No IAM or network expansion was made.

All **30 offline adapter tests passed** with synthetic credentials and mocked
SDK commands. The exact live read then reached Google and exited 1 with
`IAM_PERMISSION_DENIED`: missing `logging.sinks.list` on
`organizations/594773370606`. See [sanitized result](organization-sink-read.json).
No sink configurations were returned. Enabled `includeChildren` sink names,
filters, destinations and exclusions remain **unknown**. The route stopped;
there was no IAM grant, retry with another identity, log-content read or secret
payload access. No Cloud Run, owner activation or callback configuration changed.

## Saved-environment reproduction

These are task-local files; their presence does **not** establish persistence
in a fresh task. Parent must persist the same three scoped file changes and
updated installer through the saved-environment editor.

The [offline reproduction script](apply-reproduction.py) checks
[before/after hashes](file-hashes.json), dry-runs and applies the patch when the
baseline matches, and synchronizes only `cloud-gcloud`, `test_gcloud_adapter.py`
and `GCLOUD-ADAPTER.md` within the existing installer's public source dictionary.
It preserves every unrelated dictionary entry and shell step. The complete
environment recipe already references this installer. It never authenticates,
executes an installer or runs the live sink read.

```sh
python3 -B outputs/grafana-contained-20261003/adapter-org-sink-fix/apply-reproduction.py
python3 -B /workspace/.setup/test_gcloud_adapter.py
```

Application to an isolated baseline fixture and an idempotent second replay
passed. The current task's adapter installer was synchronized offline. No full
setup snapshot, live credentials or private owner identifiers are included.

The current real-auth prerequisite remains unresolved organization logging
configuration, or a separately implemented and reviewed Google POST-based
identity flow that removes credentials from incoming request URLs. No such
OAuth source change or activation was performed by this task.
