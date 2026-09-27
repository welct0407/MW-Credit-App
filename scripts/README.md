# Project scripts and shared dependencies

R048 original-rate tools: `database/Backup-OriginalDailyInterest.py` captures/restores and rehearses a DEV backup; `database/Invoke-OriginalRateFixture.ps1` manages only the named DEV synthetic fixture (seed/prepare-charge/state/retire); `dictionary/capture_r048_interest.py` reads affected DEV catalog metadata. Review their current guards before reuse; fixture creation refuses an existing fixture. `Test-OriginalDailyInterest.sql` and stored-rate forecast assertions run through `database/Test-CI.ps1`. [Evidence](../outputs/r048-loan-interest/IMPLEMENTATION.md).

Maintained automation belongs in scripts/. Generated files belong in outputs/.

The owner's single-file dictionary upload is a deliberate output-location exception: double-click [Export Data Dictionary.cmd](Export%20Data%20Dictionary.cmd) to generate the local, Git-ignored `Documents/Data_Dictionary_ChatGPT.md`. See the [export instructions](../Documents/Data_Dictionary_Export.md). It performs no AI/network calls or Git mutations.

For release delta validation, generated checklists/continuation notes and saved-value comparison, see [releases/README.md](releases/README.md). For the ecosystem YAML dictionary, selective reads, guarded updates and validation, see [dictionary/README.md](dictionary/README.md). These local helpers complement the existing Flyway runners and current-GUI tests; they never deploy or approve releases.
Output documents, scripts and evidence are tracked by Git for recovery. Installed node_modules, Python caches and .tmp directories are ignored. The owner excluded C:\GitHub from Google Drive on 2026-09-10; uncommitted project files must not be assumed to have a Drive backup.

## Setup on this Windows VM or after recovery

Use the existing runtime/junction when it works. These setup steps apply after recovery, missing dependencies or a verified runtime problem, not at the start of every task. Do not traverse the root dependency junction during repository backup or recursive cleanup.

1. Ask Codex to call load_workspace_dependencies to locate the current bundled Node, Python and Node package directory.
2. Run `powershell -NoProfile -File scripts/setup-dependencies.ps1 -DependencyRoot "<bundled Node node_modules directory>"` from the repository. The current host's default is provided by the script.
3. Run maintained JavaScript scripts with the bundled Node executable. Node resolves imports through the single repository-root node_modules junction. Do not install or copy node_modules into output folders.
4. Use the bundled Python executable for Python tooling. If a future script needs an additional package, document and pin it before installation; do not modify the shared Codex bundle.

The setup script checks artifact-tool 2.8.59, records bundle 26.909.12148 in dependency-runtime.json, refuses to overwrite an existing installation, and can be rerun safely. The manifest records the tested provider/version; it is not an npm lockfile or a complete offline copy of the bundle. Do not run npm install for the private @oai/artifact-tool package. After a bundle update, review compatibility before changing the recorded version.

## Historical script references

reference/ preserves the 47 Python/JavaScript scripts previously tracked under outputs/, with the same subdirectory structure and unchanged bytes. Originals remain on disk under outputs/. Their hashes and original paths are in reference-manifest.json.

These are historical recipes, not a batch of approved migrations to rerun. Some use hardcoded paths, script-relative companion files, or overwrite workbook/configuration documentation. Read and adapt a selected script before use; only verified Git publication establishes repository recovery coverage. Do not assume additional Google Drive coverage. Account for original script-relative paths when adapting a selected script. Do not execute historical update scripts as a dependency test.

The owner deleted the ten old output-local dependency installations on 2026-09-10. Both maintained scripts and original output scripts now resolve the shared root dependency junction. A read-only artifact-tool import and in-memory workbook creation from an output directory passed; this is not a compatibility guarantee for every historical script.

## Recovery

Clone the Git repository to recover committed outputs, then rerun setup-dependencies.ps1 using the current bundled runtime. Commit and push work that must survive loss of the VM; the project folder is no longer covered by Drive sync. Verify a representative read-only workflow before resuming modifications. Installed dependencies are not stored in the current Git tree. The separate MW-AI-Collection database backup to Drive does not back up this project's uncommitted files.

## Credential maintenance

Read this section when creating, migrating or recovering credentials; ordinary tasks using an established credential do not require a storage audit. The standing external-storage rule is in [AGENTS.md](../AGENTS.md).

- Store project API keys, access/refresh tokens, app secrets, private keys, recovery/encryption keys and exported authentication/session files under `C:\Users\MWCredit\Documents\ChatGPT`, preferably a project subfolder. Never store secret values under `C:\GitHub`, even in ignored files. Configuration and change logs use paths/placeholders only.
- On migration, update consumers and verify references without printing values. Preserve existing credentials until verified; never overwrite/regenerate a recovery key as a substitute for a lost key.
- Leave application-managed Codex/GitHub/browser sign-in stores in place; do not relocate them as a side effect. Project-owned exports belong in the external folder.
- Record actual credential recovery/backup coverage when credentials change. Folder existence proves no backup; database backups do not cover credentials, and the GitHub project folder is excluded from Drive.

## Diagram maintenance

Update drawings only when depicted flows/architecture change. Their interpretation lives in [Solution Design](../Documents/Solution_Design.md); provenance and prior render evidence live in the dated archive/change logs. Keep manual draw.io edits before running generators, which overwrite files.

- OLTP: `node scripts/build-oltp-process-diagram.cjs`; three editable pages. Historical verification: `outputs/oltp-process-diagram-20260912/`.
- Ecosystem: `node scripts/build-loan-ecosystem.cjs` calls `build-loan-ecosystem-visual.cjs`. Embedded assets come from `outputs/loan-ecosystem-20260916/logos`; pinned sources are in its SOURCES.json. Refresh logos only when required.
- Current ecosystem render: `outputs/loan-ecosystem-20260927/ecosystem.png` and `.svg`. The generator also embeds the two original app logos from `resources/`. The September 16 exports are historical. Regeneration overwrites the current editable file in Documents; preserve manual edits first.
- Render changed pages with the installed draw.io export UI/CLI and check text/connectors. XML or a diagram edit does not prove runtime/business tests. No routine promotion render for unchanged diagrams.

R048 interest cutover helpers: `database/Backup-R048InterestProduction.py` is the dated V52-only private backup/restore/rehearsal tool (refuses any other live baseline); do not replay after V53. `database/Verify-R048InterestProduction.py` performs read-only PROD identity, V53, aggregate backfill and affected dependency checks. Both use established external credentials/runtime. [Verified run](../outputs/r048-loan-interest-production/README.md).

R048 confirmed-rate correction: `database/Correct-R048HistoricalLoanRate.py` reads a guarded private one-loan input, creates/restores a private PROD backup and rehearses the existing V53 two-update behavior before `--apply`. The private identity and backup are excluded from Git. The completed run and recovery limits are in [correction evidence](../outputs/r048-loan-interest-correction/README.md); do not rerun it after the rate is populated.
