# RC release templates

Copy only required supporting records into the existing `outputs/<release>/` evidence folder; no new release number or live operation is performed by copying. Fill actual observations progressively. Keep null/Pending for unknown facts; no synthetic app IDs, versions, hashes or approval strings. Use one linked log for decisions/history and one checklist, not a duplicate report per stage.

| File | Use |
| --- | --- |
| [release-manifest.json](release-manifest.json) | Machine-readable relationship between tested Git/Flyway and DEV → RC → PROD versions |
| [source-mapping-validation.json](source-mapping-validation.json) | Complete RC source preparation and necessary substitutions; focused resulting-PROD verification |
| [test-results.md](test-results.md) | Relevant DEV/RC/PROD tests and honestly reused evidence |
| [promotion-checklist.md](promotion-checklist.md) | Single master activity/documentation checklist; create and fill one copy per release |

## Manifest fields

- `records.checklist` points to the filled Markdown copy. If using `records.documentationChecklist`, point it to the same file's `#documentation-impact-and-closure` section, never a separate document checklist.
- `release`: actual reserved Rnnn; `revision`: positive package revision. `scope` and `prerequisites` identify integrated batch contents, baseline and excluded later work. Track status using the workflow, not template existence.
- `git.implementationCommit`: exact tested implementation. `git.finalTag`: intended unique final Rnnn. Resolve final evidence commit through Git tag; don't embed a commit's own hash in its contents. Optional RC tags never substitute for the final production tag.
- Include both apps. `disposition` is `upgrade` or `unchanged`, with reason. For unchanged apps leave RC fields null/not-created and record observed PROD version/consumer tests. For an upgraded app fill DEV origin, actual RC UUID/full internal name/number/final version and PROD baseline/pre/post/rollback versions. Display naming follows `MW-OLTP-Rnnn-RCk` / `MW-OLAP-Rnnn-RCk`; preserve platform suffix in `internalName`. `rc.state`: not-created → preparing → ready-immutable; superseded/rejected sources remain in prior evidence. No edits to a ready RC; use a new number.
- `captures` reference available boundary docs/saved evidence. If an export is unavailable, record why and the actual alternative; no invented full-app coverage. Store private captures externally with sanitized references/hashes.
- Database `disposition`: `migrate` or `unchanged`. Preserve DEV, pre-migration, pre-App-Upgrade and final versions separately. `migrations` records exact versions/files/hashes or links the sanitized runner manifest without duplicating it. `runnerManifestReference` points to the original outside Git; never put passwords/connection secrets here. Existing runners remain authoritative for SQL deployment.
- `approvals` references actual owner messages/records, scope and final RC versions. Owner acceptance, production authority and permission for financial writes/forced notifications are distinct. Null write-test authority means no such tests. Gates use pending/passed/blocked or justified not-applicable with evidence in the linked checklist. Exceptions require approval and remain visibly distinct from verified tests.
- `deploymentOrder`, external dependencies and recovery links cover partial two-app/SQL states, final scheduler ownership, queued-client handling where relevant and retention. Approval for a batch doesn't imply any destructive recovery over later writes.

## Source mapping fields

Expand the example `sources` row to **every actual RC table/source**, including unchanged ones; reconcile actual inventory/count/names with the rows. Record actual app/RC IDs, source kind, DEV source and exact expected PROD connection/host/instance/database/schema/table or view. Non-SQL/file/internal sources need explicit purpose/destination/disposition, not guessed SQL values. Capture RC preparation evidence independently. PROD uses a focused source/substitution check; no repeat full mapping transcription is required when unchanged evidence remains applicable. Record unused detailed PROD fields as not applicable with the basic verification reference, not as falsely observed values.

Expand `substitutions` only to actual PROD differences: sources, companion IDs/deep links, access/endpoints/templates and themes. R009 converted routes use identical expressions and environment-specific Partner delivery data, with separate Login Email identities. Never restore historical creator-by-delivery-email expressions. Record/restore only remaining documented legacy literals and reuse untouched coverage. Use the actual existing PROD pair for inter-app links, never the RC pair. Values may be JSON scalars/arrays/objects to preserve exact properties and order; protected values use controlled external references and actual private comparison. Record baseline source evidence/version and reason.

For `themeByApp`, separately capture each corresponding PROD app's exact mode/color/branding property names/values and version. Apply those values **after copying DEV to RC**, then verify saved settings/appearance and resulting PROD. The four existing DEV/PROD colors remain unchanged. No guessed color codes or common color for both RCs. Link substitution rows rather than maintaining competing expected values.

Record containment method and demonstrated app-specific scope. RC production sources/recipients are intentional final targets; they do not authorize RC to execute jobs. See [Release Workflow](../../../Documents/Release_Workflow.md#rc-containment-and-external-dependencies). Include final automation states and RC non-execution evidence. Definitions/copy status alone do not prove isolation or delivery.

`containment.scheduledBots` holds one row per scheduled entry point: exact canonical DEV/PROD **internal names**, actual RC name, original filter/guard/first-branch placement, intended enablement/schedule, saved RC/PROD evidence and first-use or reused scheduled-runtime proof. Use [the standard guard](../../../Documents/Release_Workflow.md#scheduled-bot-execution-guard); never allow an RC or infer names from display labels/UUIDs. A skipped scheduler invocation is acceptable; no business side effects may pass. Newly created templates have no live verification. Preserve the guard through App Upgrade and record replacement DEV names after refresh; do not add a normal post-upgrade enablement step.

## Checks and limits

All app modes target Deployed; the initial deployment check applies to a new/undeployed app, not every release. `records.delta`/`deltaHash` may remain null when unused; the log supplies the concise change record. Basic PROD validation covers identity/version, mode, bindings/substitutions, editor issues, load/sync and representative changed entry points; expand only for specific risks.

These JSON files deliberately ship incomplete. Parsing JSON only checks syntax; no automated schema or semantic readiness validator is supplied. Review fields against the linked gates and actual evidence. The delta helper validates exact delta records only; it does not validate the RC manifest/mapping, read live apps or certify a release. Use `checklist.mjs` once to create a scoped release copy; add only affected documents and preserve filled results. No separate document checklist or folder scan. Use the existing Flyway checks for migrations and current AppSheet GUI for relevant functional tests.
