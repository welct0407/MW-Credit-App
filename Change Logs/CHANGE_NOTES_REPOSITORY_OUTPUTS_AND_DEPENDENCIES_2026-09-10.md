# Repository outputs and shared dependencies — 2026-09-10

## Scope and purpose

Owner authorized excluding outputs from Git and avoiding duplicated future dependency installations in AppSheet-Loan-Project. Owner stated Google Drive backup was already running and explicitly instructed Codex to skip backup. No backup setup, extra destination, retention job, dependency deletion, collection runtime change, AppSheet change or Looker change is included.

## Rollback point

Starting working tree was clean at commit faddade8999cadd67c521900f1b7c87bcd61f810 (master). Existing output files and all ten output-local dependency installations are retained on disk. Existing Git history is unchanged. AppSheet versions and Looker report copies are not applicable because neither app/report is changed. Drive backup completion is owner-managed and was not independently verified in this task.

## Changes

- .gitignore excludes /outputs/, node_modules/, __pycache__/ and *.pyc while preserving the existing exclusions.
- outputs/ is removed only from the Git index; local files remain available to the owner's Drive backup.
- scripts/reference/ preserves 47 historical .mjs/.py files, byte-for-byte, with original paths and SHA-256 values in scripts/reference-manifest.json. These are reference recipes, not approved migrations to replay.
- scripts/setup-dependencies.ps1 creates one ignored root node_modules junction to the bundled runtime. It validates artifact-tool 2.8.59 and refuses to overwrite a conflicting local installation.
- scripts/dependency-runtime.json records provider bundle 26.909.12148; scripts/README.md documents setup, historical-script limitations and recovery.
- AGENTS.md directs future sessions to maintained scripts and shared dependencies instead of per-output installations.

## Checks and status

All 47 reference copies were hash-verified. Shared setup succeeded and a second run made no change. Importing artifact-tool through the root junction and creating an in-memory workbook succeeded. No historical migration script was executed, no workbook was changed and no live workflow was tested.

Git index removal completed: 78,261 output paths untracked, zero local files missing afterwards, and zero output paths remaining in the index. Ignore checks passed for outputs, root dependencies and Python caches. PowerShell parsing reported zero errors. Owner explicitly authorized implementation, commit and push on 2026-09-10. Publication is proceeding; remote verification will be recorded after the push. Drive restore testing remains pending.

Whitespace checking the preserved reference copies reports existing blank lines at EOF in inspect_backup.mjs and inspect_small.mjs under projected-monthly-profit-analysis. These are deliberately preserved to keep source hashes unchanged. Newly authored configuration and documentation pass the scoped whitespace check.

## Downstream effects and manual acceptance

- GitHub alone will no longer receive new output artifacts after this change is committed and pushed. Confirm the existing Drive backup covers outputs/ and restore a sample output from Drive.
- Owner approved committing and pushing this policy to GitHub. A checkout of old history still includes old output/dependency blobs; history size is not reduced.
- Existing output-local dependencies remain and shadow the root junction for scripts launched there. No immediate disk-space reduction is claimed.
- After recovery, obtain the bundled runtime paths and rerun setup-dependencies.ps1. Test a representative read-only script after reviewing its paths. Historical scripts can refer to their original output paths, companion files and dates.
- Keep backup traversal from following the root node_modules junction into the external runtime.

## Rollback

Before committing, restore the outputs index entries with `git restore --source=faddade8999cadd67c521900f1b7c87bcd61f810 --staged -- outputs` and restore only this task's .gitignore/AGENTS.md edits after checking for intervening work. Remove the newly added scripts/documentation from tracking only if no later work depends on them. Do not overwrite local outputs with an old checkout and do not delete their contents.

The root node_modules junction may safely remain ignored. If removing it later, inspect its LinkType and resolved repository-root path first and remove only the junction itself, never recursively delete its external target. After commit, prefer a reviewed revert of this task's commit over a history rewrite.
