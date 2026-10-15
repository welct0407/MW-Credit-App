# R032 — distinct Cash Cow and Dog icons

Cash Cow uses a front-facing horned cow head with ears, spots and a broad muzzle. Dog uses a seated profile with a floppy ear, curved tail and paws. Both retain muted grey styling. Only chart.js changes; data, dot positions/sizes, labels, SQL/API, Metabase configuration and Apps are unchanged.

Rollback: restore chart.js from tag R031 or VM /opt/mw-report-charts/recovery-r032/chart.js.

Deployed and visually verified in the live Metabase chart. Cow and dog silhouettes are clearly different; grey style retained. JavaScript syntax and deployed SHA-256 match passed; service remained active. No restart needed. [Manifest](release-manifest.json) and [single checklist](promotion-checklist.md). Published with tag R032; R033 remains Open.
