# R036 production promotion

Owner authorized production on 25 September 2026. SQL V45 and OLTP1.000092 are included; OLAP definition remains unchanged. Full scope, versions, decisions and checks are in [the manifest](../outputs/r036-production/release-manifest.json) and [single checklist](../outputs/r036-production/promotion-checklist.md).

Starting Git commit: `4a848fa15bb80b5ccf2fa1ce98f5fa417b89a24c`. Existing unrelated untracked risk work preserved. PROD OLTP rollback3.000246; DB backup pending verification. App rollback alone does not undo V45; prefer an approved higher migration.

Saved AppDoc1.000086 versus1.000090 resolved the prior handoff gap: five bilingual column labels in Borrowers/Charges plus Payments deck-to-table layout (Payment Date and Amount Received, existing group/sort retained). No business formula difference. These owner-saved presentation refinements are retained in the integrated candidate.

Status: scope frozen and R037 opened; shared DEV held until RC capture. No PROD SQL or App Upgrade yet.
