# R057 ecosystem adoption: shared

Shared DEV/PROD SQL instance and receipt bucket metadata only. Never manage database users/content or receipt objects here. The API-unset maintenance window remains externally managed through the precise lifecycle exception.

Terraform 1.16.5 and the committed provider lockfile pin the reviewed implementation. The existing protected GCS backend bucket is `mw-credit-app-tfstate-737787224638` with the unique `ecosystem-shared` prefix. Use the existing GCP operator authentication for backend access; Azure roots additionally use the established Azure CLI account. Keep credentials, TF_DATA_DIR, saved plans and diagnostic output outside every repository.

Initialize this root with its pinned lockfile, then review an ordinary refreshed plan. The retained import blocks document exact identities and are idempotent once imported. All resources have `prevent_destroy`. Future configuration changes need their own scoped authorization; adoption does not authorize restart, replacement, resizing, credential rotation or business-data changes.

Recovery from ownership mistakes is a reviewed Terraform state ownership correction using the versioned protected backend, never `terraform destroy` or cloud deletion. Preserve existing remote objects and other state prefixes. See [sanitized adoption evidence](../../outputs/infrastructure-adoption-r057/import-results.json) for exact addresses, import IDs, saved-plan hashes and post-import results. Private saved plans/diagnostics are retained until review on 20 October 2026.
