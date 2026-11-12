# Change notes — Component versioning (R144), 12 November 2026

## Purpose
Owner request of 12 November 2026: "Engage the team and implement all your recommendations". `Rnnn` stays the one ecosystem number; each component's version becomes the last `Rnnn` that changed it plus its own counter, with a registry, a closure-time derivation, self-reporting services and a read-only drift check. No SQL, no live action.

## Changes
- Registry `scripts/promotion/components.json` (Dewey; fields in its `fields` object; seed as of R143) and `scripts/promotion/component-versions.mjs` (Byte): `derive`, `render`, `check-source`, `drift`. API roles reuse `genericRoleClosures` and `genericChangedRoles` from `deploy-business-hosting.mjs`.
- Images (Forge): `Dockerfile` ARG/ENV `MW_RELEASE_NUMBER` (default `dev`) and `MW_SOURCE_COMMIT` (default `unknown`), placed last. `cloudbuild-command.yaml` (DEV) defaults `dev` and `unknown`. `cloudbuild-business.yaml` (PROD) refuses to build unless `_MW_RELEASE` matches `^R\d{3}$` and `_MW_SOURCE_COMMIT` is 40 lowercase hex. `cloudbuild.yaml` and the legacy `cloudbuild-foundation.yaml` are unchanged, so any image they build reports `dev` and `unknown`. R144 rebuilds every API image at promotion because the Dockerfile and Cloud Build files are image inputs.
- Self-reporting (Byte): API `/health` adds `release` and `commit`; agent `/ready` and `/healthz` add them; `integration-agent/scripts/deploy-runtime.py prepare` writes `code_release`.
- Grafana: dashboards regenerated through `project/scripts/monitoring/dashboards/lib.cjs` with `DASHBOARD_RELEASE = 'R144'` and the tag `release:R144`. A later release that changes a dashboard must bump it; `check-source` enforces it. Applying it to the single PROD Grafana waits for promotion.
- Metabase: `project/scripts/metabase/Stamp-Release.mjs` (`--check` default; `--apply` is a PROD write, deferred).
- `.github/workflows/release-tag.yml` appends a "## Component versions" table to the Release notes (warns and still publishes if the derivation fails). Tags and GitHub releases are otherwise unchanged.
- Records (Dewey): `Release_Tracker.md` (R144 scope), `Release_Workflow.md` (component versions section), `scripts/promotion/README.md`, `Environment_Inventory.md` (generated block markers), `docs/Development.md`, `docs/Development_PWA_Delivery.md` (DEV build substitutions), `project/scripts/releases/templates/promotion-checklist.md` (PROD build substitutions), `project/scripts/monitoring/README.md`, `database/README.md`, `integration-agent/docs/OPERATIONS.md` and the [integration agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R144_AGENT_RELEASE_REPORTING_2026-11-12.md).
- Documents checked and unchanged: Solution Design, PWA Data Model, Data Dictionary (no schema or data change), Resource Monitoring and its Dashboard Guide (panels unchanged), Events Bridge, Service/account Mapping.

## Checks
| Command | Result |
| --- | --- |
| Unit tests for `component-versions.mjs` (Byte) | Pending |
| `npm run test:monitoring` (Byte) | Pending |
| Verification report (Chase) | Pending |
| `npm run check:docs` (Dewey) | Pending |
| CI on the pull request | Pending |

## Not run
Deferred to promotion, not authorized in this batch: image builds and deployments, the Debian agent deploy, the Grafana apply, `Stamp-Release.mjs --apply` and the first live `drift` run. Until then the live services report no release and drift reads them as unverified.

## Recovery
Git baseline `055e25fe` (R143). Nothing live changed; revert the pull request.

## Open questions
Seed facts not verified from live targets: Metabase and Grafana server versions, the Metabase last-changed release (R137 from tags), notify and jobs last-changed release (R135 from tags; the inventory says unchanged since R130).

## Remaining work
Promotion steps listed under Not run, then the Checks table results from Byte and Chase.
