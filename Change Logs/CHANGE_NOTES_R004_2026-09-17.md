# R004 — Bilingual referral rebate category

Reserved 17 September 2026. Status: In development.

Owner request authorizes DEV implementation/testing and direct PROD promotion of this scope, including updating the existing Nan backlog expense category.

Intended category: `Referral Rebate / เงินคืนค่าแนะนำลูกค้า`. Existing closure code stores `Referral Rebate` without Thai. Scope covers the SQL category literal, matching AppSheet category validation and the requested existing expense. Source Type remains the existing internal discriminator; calculations and eligibility are unchanged.

Consumers: OLTP owns closure/manual expense workflows; OLAP reads Business Expenses and referral totals. Review category validation and display in both apps. No report changes are planned.

Rollback points, exact checklist, test evidence, manifest and deployed versions: pending capture. No implementation or production deployment claimed by this reservation.
