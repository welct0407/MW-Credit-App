# Grafana adoption runner

Owner-approved R055 code-only adoption. Provider pins: Terraform1.16.5, Grafana4.45.2; the checked lock file is part of delivery. No live resource UID is inferred from mocks or dated exports. The checked baseline maps own two observed folders and two dashboards; builtin GrafanaCloud resources are excluded.

Use `scripts/grafana/manage.py` with the installed Python. `--private-dir` must be under `C:/Users/ideaadmin/Documents/ChatGPT`. Authentication is either the explicit bootstrap token file outside Git or `--secret-version N`, which reads only `mw-grafana-provisioning-token` in project `clever-oasis-508610-n7` into memory. Reuse the owner-created dedicated account; do not create a second identity. Gcloud's existing human session authorizes Secret Manager/backend operations; it is not Grafana authentication. Both HTTP clients refuse redirects before forwarding credentials.

Example read-only inventory:

```powershell
python scripts/grafana/manage.py inventory --private-dir C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/r055-grafana/snapshot-001 --token-file C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/Grafana-admin-token.txt
```

Inventory stores org identity, folder/dashboard IDs and datasource auth-field presence only, not secureJsonData or contact settings. It refuses an incomplete1000-result search. It does not alter Grafana. Existing snapshot files are never overwritten.

## Live adoption sequence

1. Validate the exact owner-provided token against the expected stack/org. Preserve it outside Git; enroll that same token through the approved Secret Manager API path without logging its value. Terraform must not manage token payloads or service-account-token resources. Record actual numeric version, expiry and accountID privately. Do not rotate/recreate any existing recovery secret.
2. Snapshot live dashboard envelopes through the supported `/apis/dashboard.grafana.app/...` endpoint, plus folder/permissions and rule definitions. Preserve current namespace, UID, resourceVersion, folder and annotations. Choose `v1beta1`, `v2beta1` or `v2` from actual live/schema evidence; provider resources support each. Keep sanitized canonical specs under `dashboards/`; private full envelopes retain recovery provenance. The resource receives only `.spec` and exact metadata UID/folder. No generated historical builder may replace this baseline.
3. Maintain the checked baseline maps from those exact resources. Initialize the dedicated GCS `grafana` prefix using the existing production state bucket; do not change application state. Import actual existing resource IDs with the schema-appropriate provider importer. Initial actual imports: folders `mw-resource-monitoring`, `f9w88d`; v1beta1 dashboards `mw-resource-performance`, `mw-resource-cost`. Import ID is the observed metadata.name, not the resulting UUID state ID. Folder/dashboard destroy is guarded. Alert rules/contact policy adoption follows exact API inventory and secure-field/state review, not an automatic wholesale policy replacement.
4. Run `manage.py terraform ... --tf-args plan -input=false -no-color -var-file=<private.json> -out=<private.tfplan>`. The runner confines plan/variables/state artifacts to the external private root, strips TF debug environment, and captures output in a private log. `show -json <private.tfplan>` writes that log privately; copy it to a uniquely named private plan JSON before reuse. `check-baseline --plan-json <private.json>` accepts only complete, nonerrored, nonempty Terraform1.16 planJSON with every resource no-op. Inspect any drift before changing source; no-change is required before intended monitoring updates.
5. For authorized updates, inspect the saved exact plan; `apply` additionally requires `--plan-sha256` matching the private file. This guard verifies file identity, not semantic authorization; root reviews actual actions before executing. Do not run plan directly with stale default maps against adopted state. Read back actual definitions/version after apply.

Allowed runner operations: init, validate, exact supported folder/dashboard import, plan, show, saved-plan apply and state list. State pull/destroy/arbitrary provider flags are refused. Credentials are only child-process environment values, never CLI args/tfvars. No subprocess exception/HTTP response bodies are printed. Calls have bounded timeouts.

The provider's new dashboard resources may stamp management metadata on first change; read importer/schema and review actual baseline before applying. If adoption produces drift, stop and reconcile, not overwrite. Secure datasource/contact configuration may be state-bearing: keep payload updates in a separate version-controlled API adapter unless a tested write-only provider mechanism exists. Current module intentionally does not own these secrets or the global notification tree.

Primary schema references: [v1beta1](https://github.com/grafana/terraform-provider-grafana/blob/v4.45.2/docs/resources/apps_dashboard_dashboard_v1beta1.md), [v2](https://github.com/grafana/terraform-provider-grafana/blob/v4.45.2/docs/resources/apps_dashboard_dashboard_v2.md), [service-account API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/serviceaccount/). GrafanaCloud token bootstrap requires existing authenticated authority; no CLI bypass/browser scraping is provided.

## Checks and recovery

`python tests/grafana/test_manage.py`; Terraform fmt/validate (backend=false provider initialization is sufficient for validation). No broad CI. Existing private definitions/state and original credentials are recovery sources; no credential rotation, global routing rewrite, financial traffic or forced delivery tests. Initial authenticated import and no-change baseline passed; see `outputs/r055-grafana/adoption-evidence.json`. Six custom datasources, ten alert rules/routing and monitoring deployment remain in scope.
