# Rnnn promotion checklist — RC revision pending

Copy to the release evidence folder, replace labels, link the manifest/log and fill each gate with evidence. This template grants no production authority. Optional targeted delta checks and required generated per-document rows supplement these gates; don't copy their contents here.

## Continue here

- Manifest / concise release log / mapping (delta optional): Pending
- Versions / RC identities: Pending
- Completed / next / pending approval scope: Pending
- Documentation checklist: Pending — generate with `node scripts/releases/documentation.mjs NEW-PATH.md`.

## Gates

| Gate | Required result | Status | Evidence / reason |
| --- | --- | --- | --- |
| A | All features/prior PROD fixes integrated in DEV; concise complete scope/change record reconciled; relevant GUI/SQL tests and both DEV editors clear, Deployed mode and owner-only DEV delivery data established; model docs/DEV checkpoint recorded | Pending | |
| B | Tested versions/commit and Flyway manifest captured before DEV advances; controlled copies named/identified; scope and external assets complete; per-app PROD themes captured/applied to matching RCs | Pending | |
| C | Scoped PROD authority and backup/compatibility established; current history/drift checked; exact pinned migrations validated/applied; target and objects confirmed (or justified no migration) | Pending | |
| D | Every RC table/source reconciled to PROD; PROD companion IDs/access/assets/themes verified; shared recipient expressions read PROD contacts with required Login Email schema/mapping; only remaining documented legacy DEV literals require restoration; untouched routing evidence reused; scheduled bots retain intended states with canonical-name guards excluding RC before all business effects, backed by first-use/reused scheduled-runtime proof; other entry points contained; saved editor/data validation and initial RC deployment check complete; RC Deployed; final RC versions frozen immutable | Pending | |
| E | Final RC authorization and current PROD baseline checked; pre-upgrade/rollback versions and SQL state captured; correct RC internal name/version → existing PROD ID; ordered App Upgrade results recorded | Pending | |
| F | Basic PROD verification passed: correct RC/target/version, Deployed mode, sources/necessary substitutions, both-app zero editor issues, load/sync and representative changed entry points; relevant SQL/external checks passed; no exhaustive delta readback; automation/RC containment reconciled; every documentation row complete; manifest/evidence published and unique final tag verified | Pending | |

## Exceptions, failure and recovery

Record actual partial state, unresolved items and any explicit owner exception/reference. Use the recovery runbook; don't hand-recreate missed settings in PROD. Final outcome remains **Not assessed** until evidence supports it. Documentation or publication failure doesn't require repeating deployment.

Final evidence commit: resolve from final Git tag. Final tag / remote verification: Pending. RC retention/recovery decision: Pending.
