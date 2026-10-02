# Owner bootstrap — approved bridge resources only

The owner approved the named Singapore resources, limited identities/secrets, public HTTPS with application authentication, synthetic acceptance and native Preview mapping for `alerts.mw-credit.com` on 2 October 2026 at 17:14:50 UTC. The $5 monthly planning budget is not a cap; no budget alert or billing-account change is created by these scripts. Nothing has been executed in GCP by preparing this package. Existing AppSheet, Cloud SQL, VM, business integrations and Grafana IRM/mobile delivery stay untouched.

## Immediate execution handoff

The authorized executor should open Google Cloud Shell through the existing **human owner session**, using the approved VM-01 browser fallback when the cloud browser is unavailable. The user has asked the executor to run this work; these are operator instructions, not a request for the user to execute scripts. Obtain the exact reviewed commit given in the handoff; use a clean checkout, not an existing dirty business checkout. Do not create keys, reuse the limited VM service identity, change browser profiles or grant an alternative identity broader access. Verify the signed-in owner account against the project/browser mapping, then confirm the account and project against the Console project selector if available:

```sh
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
```

Target: **clever-oasis-508610-n7**, project number **737787224638**. Replace `OWNER_ACCOUNT` below with the confirmed human account email; it is not a password or token. These commands use explicit account/project selection and refuse impersonation. A read failure stops the script; do not expand permissions automatically.

```sh
cd AppSheet-Loan-Project/scripts/monitoring/grafana-mcp-bridge/deploy
python3 owner-bootstrap.py preflight --owner OWNER_ACCOUNT
python3 owner-bootstrap.py resources --owner OWNER_ACCOUNT
```

If the preflight reports a disabled prerequisite read API, the approved owner may enable **only** these prerequisite APIs and rerun preflight:

```sh
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com orgpolicy.googleapis.com \
  --project=clever-oasis-508610-n7 --account=OWNER_ACCOUNT
```

This does not link billing or grant permissions. If billing/project/IAM/policy reads are denied, stop and return the **sanitized error and account email only**. The executor's existing VM identity lacks bootstrap authority; do not rerun these steps under it. If a prior attempt created the named database, first confirm ownership/configuration, then add `--resume` to preflight/resources. Other same-name resource collisions require matching bootstrap markers and configuration; they are never overwritten automatically. Partial creation is retained on failure, not deleted.

## What the first step creates

`resources` enables Run, Firestore, Scheduler, Secret Manager, Artifact Registry, IAM, IAM Credentials and Logging APIs. It creates two dedicated service accounts, Docker repository `mw-monitoring`, Standard Native database `mw-grafana-events` in Singapore with deletion protection, the committed composite indexes/index exemptions/TTL policies, five **empty** automatically replicated secret containers, and the narrowly filtered OAuth request-log exclusion. Google-managed service agents may be provisioned by API enablement. No Cloud Build project/service account, public IAM member, service-account key, backup/PITR or unrelated resource is added.

The runtime receives `roles/datastore.user` with this exact project-policy condition:

```text
resource.name=="projects/clever-oasis-508610-n7/databases/mw-grafana-events"
```

It receives `roles/secretmanager.secretAccessor` separately on each of the five bridge secrets. The Scheduler identity receives no project, database or secret role. [Google documents this per-database condition](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure-per-database-access-permissions); the Console does not enforce it for UI access, so later acceptance must verify allowed/denied access through the real client/API. Unexpected existing project roles on either dedicated identity stop preflight. Organization policy is read, never relaxed.

Secret naming is consistent throughout this package: **`mw-grafana-google-client-secret`**, superseding the old example's `mw-grafana-google-client`. No live resource rename was performed.

## Obtain the actual URL and DNS records

After infrastructure succeeds, Cloud Shell needs Docker (linux/amd64), Python 3, current gcloud and access to the pinned Node base image. This command builds a tiny dependency-free, non-root inert image locally, pushes it to the approved repository, resolves its registry digest, and deploys by that digest:

```sh
python3 owner-bootstrap.py inert --owner OWNER_ACCOUNT
```

It creates `mw-grafana-events` with min 0/max 2, 1 vCPU/512 MiB, concurrency 20, timeout 300 and public ingress with the invoker-IAM check disabled. It has **no secrets or functional OAuth/MCP/Grafana/dispatch endpoints**: only `/health` responds 200; all other routes return 503. The output captures the actual `status.url`; no `run.app` hostname is constructed. An existing marked service is reported without redeployment. This initial revision is covered by the approved bridge provisioning scope. Do not connect the plugin to it.

Verify `mw-credit.com` ownership in **the same human account's** [Search Console](https://search.google.com/search-console/welcome). If needed, the owner supplies Google's generated verification TXT to Cloudflare. Confirm `alerts` is unused there. Then:

```sh
python3 owner-bootstrap.py domain --owner OWNER_ACCOUNT
```

Native mapping's Preview/production limitations were accepted; no load balancer is provisioned. The script checks verified ownership, rejects an existing mapping to another service, creates the approved mapping without force override, and prints actual `status.resourceRecords` and certificate conditions. Give the returned **type/name/value** records to the user for manual Cloudflare entry with proxy **DNS only**. Empty records mean pending generation; rerun `domain` later to read the same mapping. Never guess a CNAME, overwrite an unrelated record, change Cloudflare credentials, or disable HTTPS zone-wide. Existing CAA must allow `pki.goog` and `letsencrypt.org`; investigate narrowly scoped ACME interception if certificate issuance stalls. [Google's domain instructions](https://docs.cloud.google.com/run/docs/mapping-custom-domains).

Wait for mapping `Ready=True` and verify TLS at `https://alerts.mw-credit.com/health` before runtime OAuth. Final issuer remains `https://alerts.mw-credit.com/oauth`, MCP resource `/mcp`, and Google registered redirect `/oauth/google/callback` on that origin. Do not issue grants against `run.app` and migrate them later.

## Secure interaction and later deployment

This is **not required for the immediate infrastructure/DNS step**. Once the owner creates the Google web OAuth client, enters the exact callback and has its secret, the owner may run this separately in an interactive terminal with Node available. A fallback executor must not capture or relay an existing Google client secret; use the owner's direct secure entry into the target:

```sh
python3 seed-secrets.py --owner OWNER_ACCOUNT
```

The owner enters the Google client secret via a hidden terminal prompt, directly into Secret Manager stdin. Four new dedicated application secrets are generated in memory and sent directly to Secret Manager without echoing, storing locally or exposing values in command arguments. Output is secret **version resource names only**. Any existing version, including disabled/destroyed ones, is retained; recover rather than regenerate. Do not enable shell tracing, capture sensitive screen/terminal input, or paste secret values in chat. Grafana HMAC transfer to its secure settings is a later owner-only action; it is not part of infrastructure bootstrap.

Before replacing the inert revision, reconcile the service template with verified Google owner subject/client, ChatGPT exact predefined client/redirect and callback hosts, pinned secret versions and uploaded application image digest. The template starts `OWNER_ENABLED=false`. Verify the deployed min/max/resources, canonical origin, OAuth log exclusion, database-scoped IAM via an allowed bridge API operation and a denied operation on an existing unrelated database, and index readiness. Do not create another database just for a negative test.

Scheduler creation is deliberately deferred: a job can execute immediately after creation, so it must not target an inert/unconfigured revision. Once safe, the owner creates `mw-grafana-dispatch` as POST `{}` once per minute in `Etc/UTC`, with the dedicated dispatch identity, exact `https://alerts.mw-credit.com/internal/dispatch` OIDC audience, 240-second deadline and no scheduler-level retries, then pauses it before synthetic activation. Cloud Scheduler's managed service agent retains its standard service-agent role; never grant that role to the caller. Confirm exact deployed configuration before resuming. This script creates **no running dispatch or live Grafana route**.

If subsequent deployment is delegated to the existing `codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`, the owner must approve and apply only:

```sh
gcloud artifacts repositories add-iam-policy-binding mw-monitoring --location=asia-southeast1 \
  --member=serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer --project=clever-oasis-508610-n7 --account=OWNER_ACCOUNT

gcloud run services add-iam-policy-binding mw-grafana-events --region=asia-southeast1 \
  --member=serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com \
  --role=roles/run.admin --project=clever-oasis-508610-n7 --account=OWNER_ACCOUNT

gcloud iam service-accounts add-iam-policy-binding \
  mw-grafana-events@clever-oasis-508610-n7.iam.gserviceaccount.com \
  --member=serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser --project=clever-oasis-508610-n7 --account=OWNER_ACCOUNT
```

These optional grants are **not executed by the bootstrap**. No project-wide Run admin, secret access, project IAM administration, Scheduler administration or service-account key is required for that deployer. The supported authentication route must still be established separately; the current IAP-only helper is not a generic gcloud route. The authorized executor can also deploy the final revision within the established owner session without these grants. Do not broaden roles to work around a denial.
