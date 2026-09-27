# Receipt evidence — 27 September 2026

Status: implementation tested; production deployment authorized and pending. AppSheet definitions remain DEV only.

Starting source commit `8efd92561f8b0550fb51e7f2993f73cbe7ee6504`; live baseline `dcb8443087d16eedc69bd1c990fd7406bb107a66` (intervening committed changes are documentation only). Scope: [implementation/operations handover](../docs/RECEIPT_EVIDENCE.md), central V4, archive/projection adapters, source provenance, receipt processing/preparation/reconsideration integration, protected generic fields, configuration/catalogue and reviewed deployment/test scripts.

Checks: 258 unit tests, 33 environment-dependent skips; real disposable PostgreSQL V1–V4/no-op, adapter capture/audit and immutable source/locator checks passed. AppSheet business V49/V50 and DEV native image viewer verified in the companion repository. Private PROD business and central backups passed restore checks. VM rollback package/config capture will precede installation. No historical replay or expanded financial/message authority.

Deployment checkpoint: business PROD V50 and central V4 applied; private credential installed. Freeze verified the old package/config copy. Initial install stopped before package replacement because the venv lacks setuptools; the installer now uses pip's isolated build environment while keeping runtime `--no-deps`. No effect timers were resumed. Remaining: successful installation/tests, metadata GCS probe, activation cutoff and service health. Rollback preserves all additive SQL and original evidence; restore only the verified runtime package/config after pausing/draining workers. Do not replay uncertain posting.
