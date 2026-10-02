# Owner bootstrap — approved bridge resources only

The owner approved the named Singapore resources, limited identities/secrets, public HTTPS with application authentication, synthetic acceptance and native Preview mapping for `alerts.mw-credit.com` on 2 October 2026 at 17:14:50 UTC. The $5 monthly planning budget is not a cap; no budget alert or billing-account change is created by these scripts. Nothing has been executed in GCP by preparing this package. Existing AppSheet, Cloud SQL, VM, business integrations and Grafana IRM/mobile delivery stay untouched.

## Immediate execution handoff

The authorized executor may use the verified human owner session or the newly approved fixed service identity `codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`. The saved-environment adapter must first pass the separately coordinated fresh-environment proof; no bootstrap is run during this source correction. The user has asked the executor to run this work; these are operator instructions, not a request for the user to execute scripts. Obtain the exact reviewed commit given in the handoff; use a clean checkout, not an existing dirty business checkout. Use the approved identity and established credential route; these scripts do not create keys or grant deployment authority. Verify the signed-in owner account against the project/browser mapping, then confirm the account and project against the Console project selector if available:

```sh
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
```

Target: **clever-oasis-508610-n7**, project number **737787224638**. Replace `OWNER_ACCOUNT` below with the verified human email or the exact approved service identity; it is not a password or token. The selected account must be active, have a direct unconditional `roles/owner` binding on this project, and match the correct IAM principal type (`user:` for humans; `serviceAccount:` for the fixed service identity). Every other service account is rejected. These commands use explicit account/project selection and refuse impersonation. A read failure stops the script; do not expand permissions automatically.

```sh
cd AppSheet-Loan-Project/scripts/monitoring/grafana-mcp-bridge/deploy
python3 owner-bootstrap.py check-sdk --owner OWNER_ACCOUNT
python3 owner-bootstrap.py preflight --owner OWNER_ACCOUNT
python3 owner-bootstrap.py resources --owner OWNER_ACCOUNT
```


For the editor's guarded Linux Python/shim route, add `--adapter-mode` inside that context and use the fixed approved service identity. The source then uses direct gcloud argv and the guarded Docker shim without configure-docker. For an alternative explicit-executable route, append `--gcloud-executable REVIEWED_ADAPTER_PATH` to every command and `--docker-executable REVIEWED_DOCKER_ADAPTER_PATH` for inert image build/push. The exact required interface is in [the adapter contract](ADAPTER_CONTRACT.md). The path must identify the actual reviewed executable reported by the environment editor; do not guess it or replace the adapter with an unreviewed credential script. It changes only the launcher. A configured Linux launcher receives visible argv with exact matching account/project selectors; its flags-file ban remains intact. The reviewed Docker wrapper owns private registry authentication, so generic gcloud need not permit configure-docker. Active-account, project ID/number, Owner binding, impersonation and credential-override checks still run. The bootstrap does not alter the saved environment or copy credentials. Example after fresh-environment proof:

```sh
python3 owner-bootstrap.py preflight \
  --owner codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com \
  --gcloud-executable REVIEWED_ADAPTER_PATH
```

If the preflight reports a disabled prerequisite read API, the approved owner may enable **only** these prerequisite APIs and rerun preflight:

```sh
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com orgpolicy.googleapis.com \
  --project=clever-oasis-508610-n7 --account=OWNER_ACCOUNT
```

This does not link billing or grant permissions. If billing/project/IAM/policy reads are denied, stop and return the **sanitized error and account email only**. The existing attached integration VM identity remains outside this deployment route. Do not substitute another identity after a denied operation. If a prior attempt created the named database, first confirm ownership/configuration, then add `--resume` to preflight/resources. Other same-name resource collisions require matching bootstrap markers and configuration; they are never overwritten automatically. Partial creation is retained on failure, not deleted.

On Windows, use the verified installed Python executable (`python` if that is its confirmed name). The script resolves `gcloud` to the full launcher path, including `gcloud.CMD`, and passes complex flag values through temporary JSON files. These files contain configuration only; secret values remain on stdin. The installed CLI must support `logging sinks update --add-exclusion`; `resources` checks its actual help before mutations. A separate read-only installed-SDK parser check is available:

```sh
python3 check_sdk_compatibility.py --sdk-root VERIFIED_EXISTING_SDK_ROOT
```

The SDK root is the existing installation directory containing `bin/gcloud` or `bin/gcloud.cmd` and `lib/googlecloudsdk`; do not install another SDK to run this check. It verifies the actual SDK parser preserves the database condition and OAuth filter and accepts the JSON flags-file help invocation without calling APIs.

## What the first step creates

`resources` enables Run, Firestore, Scheduler, Secret Manager, Artifact Registry, IAM, IAM Credentials and Logging APIs. It creates two dedicated service accounts, Docker repository `mw-monitoring`, Standard Native database `mw-grafana-events` in Singapore with deletion protection, the committed composite indexes/index exemptions/TTL policies, five **empty** automatically replicated secret containers, and the narrowly filtered OAuth request-log exclusion on the existing `_Default` sink. It adds only `mw-grafana-oauth-requests`, preserves the sink filter/destination and unrelated exclusions, and verifies readback. A conflicting/disabled named exclusion stops execution. Before real OAuth, inspect other project/inherited sinks so request URLs are not retained through another route; the bootstrap does not alter those sinks. Google-managed service agents may be provisioned by API enablement. No Cloud Build project/service account, public IAM member, service-account key, backup/PITR or unrelated resource is added.

The runtime receives `roles/datastore.user` with this exact project-policy condition:

```text
resource.name=="projects/clever-oasis-508610-n7/databases/mw-grafana-events"
```

It receives `roles/secretmanager.secretAccessor` separately on each of the five bridge secrets. The Scheduler identity receives no project, database or secret role. [Google documents this per-database condition](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure-per-database-access-permissions); the Console does not enforce it for UI access, so later acceptance must verify allowed/denied access through the real client/API. Unexpected existing project roles on either dedicated identity stop preflight. Organization policy is read, never relaxed.

Secret naming is consistent throughout this package: **`mw-grafana-google-client-secret`**, superseding the old example's `mw-grafana-google-client`. No live resource rename was performed.

## Obtain the actual URL and DNS records

After infrastructure succeeds, the execution environment needs a supported working Docker Linux/amd64 engine, Python 3, current gcloud and access to the pinned Node base image. Installing a Docker client alone does not establish Linux build support. VM-01 reported its Azure SKU cannot support the required nested virtualization, so its Docker installation is paused. Codex Cloud already has working Linux Docker; this script neither installs Docker nor changes virtualization/reboot settings. This command builds a tiny dependency-free, non-root inert image locally, pushes it to the approved repository, resolves its registry digest, and deploys by that digest:

```sh
python3 owner-bootstrap.py inert --owner OWNER_ACCOUNT
```

It creates `mw-grafana-events` with min 0/max 2, 1 vCPU/512 MiB, concurrency 20, timeout 300 and public ingress with the invoker-IAM check disabled. It has **no secrets or functional OAuth/MCP/Grafana/dispatch endpoints**: only `/health` responds 200; all other routes return 503. The output captures the actual `status.url`; no `run.app` hostname is constructed. An existing marked service is reported without redeployment. This initial revision is covered by the approved bridge provisioning scope. Do not connect the plugin to it.

Project Owner does not establish Search Console ownership. Verify `mw-credit.com` ownership for the exact actor performing mapping in [Search Console](https://search.google.com/search-console/welcome). If needed, the owner supplies Google's generated verification TXT to Cloudflare. Confirm `alerts` is unused there. Then:

```sh
python3 owner-bootstrap.py domain --owner OWNER_ACCOUNT
```

Native mapping's Preview/production limitations were accepted; no load balancer is provisioned. If the deployment service account is not verified, stop this phase and use the separately verified human-owner mapping route. Do not add a Search Console owner automatically. The script checks verified ownership, rejects an existing mapping to another service, creates the approved mapping without force override, and prints actual `status.resourceRecords` and certificate conditions. Give the returned **type/name/value** records to the user for manual Cloudflare entry with proxy **DNS only**. Empty records mean pending generation; rerun `domain` later to read the same mapping. Never guess a CNAME, overwrite an unrelated record, change Cloudflare credentials, or disable HTTPS zone-wide. Existing CAA must allow `pki.goog` and `letsencrypt.org`; investigate narrowly scoped ACME interception if certificate issuance stalls. [Google's domain instructions](https://docs.cloud.google.com/run/docs/mapping-custom-domains).

Wait for mapping `Ready=True` and verify TLS at `https://alerts.mw-credit.com/health` before runtime OAuth. Final issuer remains `https://alerts.mw-credit.com/oauth`, MCP resource `/mcp`, and Google registered redirect `/oauth/google/callback` on that origin. Do not issue grants against `run.app` and migrate them later.

## Secure interaction and later deployment

This is **not required for the immediate infrastructure/DNS step**. Once the owner creates the Google web OAuth client, enters the exact callback and has its secret, the owner may run this separately in an interactive terminal with Node available. A fallback executor must not capture or relay an existing Google client secret; use the owner's direct secure entry into the target:

```sh
python3 seed-secrets.py --owner OWNER_ACCOUNT
```

The owner enters the Google client secret via a hidden terminal prompt, directly into Secret Manager stdin. Four new dedicated application secrets are generated in memory and sent directly to Secret Manager without echoing, storing locally or exposing values in command arguments. Output is secret **version resource names only**. Any existing version, including disabled/destroyed ones, is retained; recover rather than regenerate. Do not enable shell tracing, capture sensitive screen/terminal input, or paste secret values in chat. Grafana HMAC transfer to its secure settings is a later owner-only action; it is not part of infrastructure bootstrap.

Before replacing the inert revision, reconcile the service template with verified Google owner subject/client, ChatGPT exact predefined client/redirect and callback hosts, pinned secret versions and uploaded application image digest. The template starts `OWNER_ENABLED=false`. Verify the deployed min/max/resources, canonical origin, OAuth log exclusion, database-scoped IAM via an allowed bridge API operation and a denied operation on an existing unrelated database, and index readiness. Do not create another database just for a negative test.

Scheduler creation is deliberately deferred: a job can execute immediately after creation, so it must not target an inert/unconfigured revision. Once safe, the owner creates `mw-grafana-dispatch` as POST `{}` once per minute in `Etc/UTC`, with the dedicated dispatch identity, exact `https://alerts.mw-credit.com/internal/dispatch` OIDC audience, 240-second deadline and no scheduler-level retries, then pauses it before synthetic activation. Cloud Scheduler's managed service agent retains its standard service-agent role; never grant that role to the caller. Confirm exact deployed configuration before resuming. This script creates **no running dispatch or live Grafana route**.

## Approved deployment actor

At 18:07:29 UTC on 2 October 2026, the owner explicitly approved project Owner for the fixed `codex-cloud` service identity and its durable selected-environment configuration, after disclosure of IAM/delete/spend rights and access inherited by credential holders. The VM executor reports applying and reading back the `roles/owner` binding on this project while preserving other IAM/audit settings. This supersedes the earlier optional proposal for narrow deployer roles; no extra deployer grants are created by the bootstrap. The runtime and Scheduler identities still receive only their original bounded permissions.

The source code independently verifies the live active account and direct unconditional Owner binding before provisioning. The saved-environment credential adapter is maintained in a separate task and must be proved in a fresh environment before bootstrap. Existing Vault credentials are reused there; this repository neither stores them nor implements that adapter. Secure Google-client-secret entry remains a separate interaction. A service-account deployment actor does not change the bridge's human Google owner/OAuth identity.

## Compatibility correction and recorded access findings

The original pin's `gcloud logging exclusions` group was unsupported by SDK 585; the supported sink update is used now. VM-01 verified the human owner `welct0407@mw-credit.com`, project number, billing and unenforced invoker policy, and confirmed full-path `gcloud.CMD` subprocess invocation. Its approved prerequisite Resource Manager/Cloud Billing API enablement completed; the bridge remains unprovisioned in the latest handoff evidence. Cloud SDK 587 is installed but its inherited configuration has no active account/project, no named owner profile and no checked ADC file; the documented IAP helper has no generic owner-deployment route. The durable service-account route was separately approved at 18:07:29 UTC; its saved-environment update/fresh-task verification remains separate from these scripts.
