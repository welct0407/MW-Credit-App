# Rnnn promotion checklist — RC revision pending

Copy to the release evidence folder, replace labels, link the manifest/log and fill each gate with evidence. This template grants no production authority. Exact delta checks and the generated per-document rows supplement these gates; don't copy their contents here.

## Continue here

- Manifest / release log / delta / mapping: Pending
- Versions / RC identities: Pending
- Completed / next / pending approval scope: Pending
- Documentation checklist: Pending — generate with `node scripts/releases/documentation.mjs NEW-PATH.md`.

## Gates

| Gate | Required result | Status | Evidence / reason |
| --- | --- | --- | --- |
| A | All features/prior PROD fixes integrated in DEV; full change record reconciled; relevant GUI/SQL tests and both DEV editor diagnostics complete; model docs/DEV checkpoint recorded | Pending | |
| B | Tested versions/commit and Flyway manifest captured before DEV advances; controlled copies named/identified; scope and external assets complete; per-app PROD themes captured/applied to matching RCs | Pending | |
| C | Scoped PROD authority and backup/compatibility established; current history/drift checked; exact pinned migrations validated/applied; target and objects confirmed (or justified no migration) | Pending | |
| D | Every RC table/source reconciled to PROD; PROD companion IDs/recipients/access/assets/themes independently verified; execution contained; saved editor/data validation and source eligibility complete; final RC versions frozen immutable | Pending | |
| E | Final RC authorization and current PROD baseline checked; pre-upgrade/rollback versions and SQL state captured; correct RC internal name/version → existing PROD ID; ordered App Upgrade results recorded | Pending | |
| F | All frozen delta targets and mappings independently verified in PROD; both-app zero editor issues and scoped GUI/SQL smoke passed; automation/RC containment reconciled; every documentation row complete; manifest/evidence published and unique final tag verified | Pending | |

## Exceptions, failure and recovery

Record actual partial state, unresolved items and any explicit owner exception/reference. Use the recovery runbook; don't hand-recreate missed settings in PROD. Final outcome remains **Not assessed** until evidence supports it. Documentation or publication failure doesn't require repeating deployment.

Final evidence commit: resolve from final Git tag. Final tag / remote verification: Pending. RC retention/recovery decision: Pending.
