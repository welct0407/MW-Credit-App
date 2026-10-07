# R052 — DEV Google sign-in and Borrowers read checkpoint

Date: 7 October 2026. Status: implementation verified; live read deployment in progress. This is checkpoint 2A, not full OLTP parity or production readiness.

Owner accepted checkpoint 1B and darker separators, authorized continuation, and selected only welct0407@mw-credit.com for the first DEV pilot. The exact eight-resource Firebase/reader IAM plan was explicitly approved after automatic approval review requested scoped authorization. The owner enabled Google sign-in in Firebase; API readback confirmed it.

## Scope and rollback

Starting application commit: a3d21d5ffe6219bb4ec1caa78cf7b52e6bfa2952. Existing work preserved. Agent A designed the slice, B implemented, C independently tested. Separate live/synthetic entries, Google token verification/revocation checks, owner policy, unique Partner Login Email mapping, bounded read-only Borrowers API, in-memory browser sessions and accepted DEV styling are implemented. Collection/calculation parity, writes and offline persistence remain later work.

New infrastructure files manage Firebase web/auth configuration, dedicated read runtime identity and SQL IAM login, two Secret Manager containers, imported existing Google provider and a digest-gated new read service. The existing private readiness API and AppSheet continue unchanged. No business schema/row changes or financial writes. Shared SQL/GCS infrastructure is retained.

The applied foundation comprises 8 approved resources, followed by 2 credential containers and 1 existing Google provider import (only Terraform deletion handling changed). Existing OAuth configuration and Firebase SDK configuration were copied to version 1 of their dedicated secrets; no keys regenerated, no new runtime secret access. State/plans/recovery remain private outside Git. Browser SDK configuration is public client metadata; OAuth client secret is never bundled.

scripts/configure-dev-read-role.py prepares exact column SELECT privileges on DEV Borrowers (7 columns) and Partners (2 columns), with identity guards, before-ACL recovery snapshot and read-only/default timeout settings. As of this source checkpoint these business grants are NOT applied. Current reader has no business SELECT in DEV or PROD; inherited PUBLIC CONNECT exists in both and is not changed. Source and database settings are independently recoverable; stop the new service before removing only introduced grants/settings using its private recovery instructions.

Rollback: restore the prior Hosting version/read image when deployed, preserve managed credentials, do not run terraform destroy against the shared project. The preexisting private API is unaffected. Runtime bootstrap admits only the verified Google owner email; after the first real login pin the observed Firebase UID, never fabricate one.

## Verification

Both frontend builds and independent mocked UI tests passed. C's 29 boundary tests cover configuration/token/policy/SQL/HTTP failures; the prior 42 unit checks also passed. See outputs/r052-auth-read/test-report.md. Marker guards prevent accidental cross-mode Hosting publication. Terraform formatting/validation passed. Public health does not query SQL. Actual owner sign-in and real Borrowers reads remain pending; mocked screenshots are explicitly labeled and contain synthetic records only.

Changed areas: apps/pwa live entry/styles, services/api read/auth modules, package lock, Vite/build/delivery configuration, tests/evidence, infrastructure/dev, privilege configuration tool and development guide. No changes to existing database migrations, AppSheet definitions, financial schedules, Metabase or Grafana.
