# Business expenses and referral rebates — production release

16 September 2026. Owner authorized promotion after accepting the DEV implementation and the later deck/dashboard refinements.

Before release: production V14 / OLTP 3.000108 / OLAP 1.100090. The normalized production schema matched the reviewed DEV V14 checkpoint. Fresh private backup SHA-256: `756FCA2BAF1FD17A8EC2F1F3F6E8CEB95CD05F2CC10C774BC91E2837E44D1D60`. A disposable restore matched all 14 business-table fingerprints and normalized schema.

This report will be completed with final SQL/app versions, read-only reconciliation, consumer checks and recovery instructions after promotion. No DEV fixture or Looker change is part of this release.
