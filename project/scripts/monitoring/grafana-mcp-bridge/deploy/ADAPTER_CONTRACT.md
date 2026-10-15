# Approved adapter contract for the fixed deployment identity

This is an integration specification, not an adapter implementation or permission grant. The environment editor owns the adapter and credential handling. Bootstrap waits for a fresh-environment proof before live execution.

## Invocation and identity proof

The editor's reviewed Python mode supplies guarded `gcloud` and `docker` PATH shims for the full script. Invoke the bootstrap inside that mode with `--adapter-mode` and the fixed approved `--owner`. The source rejects adapter mode on Windows or with a human/other identity. Example script arguments inside the editor-provided guarded context:

```sh
python3 owner-bootstrap.py preflight --adapter-mode \
  --owner codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com
```

This mode sends visible Linux gcloud argv and skips `gcloud auth configure-docker` because the guarded Docker shim already owns private authentication. Account/project/Owner/no-impersonation verification remains mandatory. The normal human Windows SDK route keeps JSON flags files and its ordinary Docker configure step.

The alternative explicit gcloud adapter is an existing reviewed executable accepting normal gcloud arguments. Source selects it with `--gcloud-executable ACTUAL_REVIEWED_PATH`. On Linux the bootstrap sends direct argument arrays with `shell=False`, so the adapter's `--flags-file` ban can remain. Windows SDK launchers retain JSON flags files. Every API invocation carries these matching selectors:

```text
--account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com
--project=clever-oasis-508610-n7
--quiet
--format=json
```

Accept these selectors only when they exactly match the adapter's pinned values; reject any other value. The adapter may remove the matching duplicates before adding its own final pinned selectors. No caller-selected configuration, impersonation, credential/access-token file, alternate billing project or nested flags file is needed.

These exact metadata-only commands must be permitted and executed against the real private SDK configuration:

```text
auth list --format=json
config get-value auth/impersonate_service_account
logging sinks update --help
```

`auth list` returns account/status metadata only. The bootstrap requires the selected identity to be ACTIVE and the configured impersonation value empty or `(unset)`. Do not replace these checks with hardcoded success metadata. The source then checks `projects describe clever-oasis-508610-n7` for exact ID/number/ACTIVE state and `projects get-iam-policy clever-oasis-508610-n7` for an unconditional `roles/owner` binding containing `serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`. The alternative human route uses `user:`. No auth login, activation, revoke, credential export, config setter or additional credential grant is requested through the public adapter interface.

## API commands used by the approved bootstrap

Use the reviewed source pin to validate exact resource names and flag values. These groups are required:

| Command | Purpose |
| --- | --- |
| `projects describe`, `projects get-iam-policy`, `projects add-iam-policy-binding` | Fixed project verification; only conditional bridge-database runtime access is added |
| `billing projects describe` | Read billing-enabled metadata; no billing-account change |
| `services list --enabled`, `services enable` | Inventory/approved API enablement |
| `org-policies describe constraints/run.managed.requireInvokerIam --effective` | Read policy; no policy update |
| `iam service-accounts list/create` | Two named bridge identities |
| `artifacts repositories list/create`, `artifacts docker tags list` | Named registry and immutable-image verification |
| `firestore databases list/create`, `firestore indexes composite list/create`, `firestore indexes fields update`, `firestore fields ttls update` | Named Standard database/index/TTL configuration |
| `secrets list/describe/create/add-iam-policy-binding`, `secrets versions list/add` | Five named containers/bounded runtime access; secure seeding is separate |
| `logging sinks describe/update _Default` | Only the named OAuth exclusion addition and preservation readback |
| `run services list/describe`, `run deploy mw-grafana-events` | Inert named service, approved app-protected public ingress and resource limits |

The condition and exclusion filter arrive as single visible argument values; preserve their quotes, `%2F`, regex operators and spaces without a shell. Repeated `--field-config` values must remain separate arguments. The private seed operation uses **only `--data-file=-`**, receives values via stdin, and returns version metadata as JSON. The adapter must forward stdin without logging it; do not allow file-based credentials or secret payloads in argv. Existing highly sensitive Google-client-secret entry still requires the owner's direct secure interaction.

Domain work additionally uses `domains list-user-verified` and `beta run domain-mappings list/create/describe` for the approved domain/service/region. Keep this separate when the service identity lacks Search Console ownership. Project Owner is not domain verification. No new Search Console owner is added automatically.

## Docker adapter

In explicit adapter mode the guarded Docker PATH shim is used directly. Alternatively, source selects a reviewed Docker wrapper with `--docker-executable ACTUAL_REVIEWED_DOCKER_PATH`; it accepts ordinary Docker argv:

```text
build --platform=linux/amd64 -f <pinned source>/bootstrap.Dockerfile -t asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-monitoring/grafana-mcp-bootstrap:v1 <pinned source>/deploy
push asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-monitoring/grafana-mcp-bootstrap:v1
```

The wrapper owns its private temporary credential helper/config for the whole Docker command and removes it afterward. SDK/helper credentials must stay inside its private process/file boundary. The bootstrap does not inspect helper responses or tokens. With adapter mode or this wrapper supplied, it does **not** request `gcloud auth configure-docker` through the generic adapter. The normal SDK/Docker route continues to use that standard SDK command.

Before execution, the editor must supply the actual executable paths and prove both wrappers in a fresh selected environment. A successful source/CI test does not establish adapter or live-cloud acceptance.
