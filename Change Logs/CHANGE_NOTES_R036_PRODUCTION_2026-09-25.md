# R036 production promotion

Owner authorized production on 25 September 2026. SQL V45 and OLTP1.000092 are included; OLAP definition remains unchanged. Full scope, versions, decisions and checks are in [the manifest](../outputs/r036-production/release-manifest.json) and [single checklist](../outputs/r036-production/promotion-checklist.md).

Starting Git commit: `4a848fa15bb80b5ccf2fa1ce98f5fa417b89a24c`. Existing unrelated untracked risk work preserved. PROD OLTP rollback3.000246; DB backup pending verification. App rollback alone does not undo V45; prefer an approved higher migration.

Saved AppDoc1.000086 versus1.000090 resolved the prior handoff gap: five bilingual column labels in Borrowers/Charges plus Payments deck-to-table layout (Payment Date and Amount Received, existing group/sort retained). No business formula difference. These owner-saved presentation refinements are retained in the integrated candidate.

Status: scope frozen and R037 opened; shared DEV held until RC capture. No PROD SQL or App Upgrade yet.

## Production result — 26 September 2026

SQL V44→V45 from clean pin4a848fa; verified successful Cloud SQL backup1790354541920. Pre-migration validate reported only pending V45; migrate applied exactly one migration; final validate passed46 history entries. Schema parity378 objects and exact four routine bodies passed. No backlog update.

OLTP3.000246→3.000249 by App Upgrade from PROD-bound, Deployed RC1.000007. All18 business sources and16 native sources checked, canonical guard retained, production branding/folder/companion link/API enabled. Existing PROD OLAP1.100202 was observed clear and left unchanged. Both editors have zero issues. Expense form labels, navigation, sync and logo checked without posting a financial transaction. API Enable was read back; no API credential probe was run. DEV business/concurrency evidence reused.

RC7a5da6c5-98cc-4fa0-902a-a996f08a641d deleted after successful validation; exact identity checked before delete, four canonical apps remain. Shared data/files retained. Production rollback is OLTP3.000246 plus a separately approved SQL forward correction if behavior rollback is needed; app restoration alone leaves V45 active. Backup restore requires reconciliation of subsequent writes. Dictionary structural validation passed (1,214 documents; zero errors). Final evidence published on master with annotated R036 tag; remote references verified after push. R036 Released.
