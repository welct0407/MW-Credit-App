# PWA infrastructure reference update — 7 October 2026

Owner authorized implementing the new repository's development infrastructure with Terraform, managed credentials and retained SQL/GCS. New private repository: https://github.com/welct0407/MW-Credit-App. Implementation, exact resource configuration, checks and recovery instructions are owned there in `docs/Development.md` and its infrastructure change log.

This repository change updates the design's proposed-repository status and environment inventory link. Shared migrations remain here; no SQL schema, financial data, AppSheet, Metabase or Grafana changes were made in this task. Existing services remain available for later parallel adoption. No product release or cutover is claimed.

Local documentation baseline: `612f8e325df6562fd431cfe09932380e8fe5aa91` on `codex/pwa-rebuild-design`. Preserve unrelated pre-existing Metabase work and outputs. Rollback these references by reverting this documentation commit; cloud rollback is separately documented in the new repository and is not achieved by reverting links.

Checks: read back affected references, verify staged scope/whitespace and publish normally to the configured upstream. Infrastructure evidence includes successful Cloud Run synthetic readiness, Firebase Hosting publication and Terraform no-change plan; GitHub delivery results are maintained in the new repository's change log. This reference update does not modify the AppSheet release tracker or allocate a release number.
