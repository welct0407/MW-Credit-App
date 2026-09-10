# Restore output tracking — 2026-09-10

## Scope, purpose and authorization

Owner authorized restoring outputs/ to repository synchronization while retaining node_modules/, __pycache__/, *.pyc, **/.tmp/, /collection-agent/ and /mw-ai-collection/ exclusions. This follows owner-completed deletion of ten duplicate dependency folders. Preserve scripts/reference/ and all output files. Google Drive remains the existing additional backup; no backup setup is changed.

## Rollback point

HEAD before this change: 2814b2619f0df648979e321ac2ae7ef8ff1761f0. The pending dependency-cleanup log from this session is included as completed history. AppSheet and Looker objects are untouched, so app/report backup requirements do not apply. No data-model documentation or workbook content is changed.

## Changes

- .gitignore no longer excludes /outputs/; dependency, cache, temporary and migrated collection exclusions remain.
- outputs/ documents, scripts, screenshots and inspection evidence return to Git tracking. Python bytecode remains local only.
- AGENTS.md and scripts/README.md describe the final Git-plus-Drive recovery policy and the completed dependency cleanup.
- The dependency cleanup log records owner removal, preserved-file verification and shared-runtime validation. Earlier exclusion change notes remain historical; this entry supersedes their output-tracking policy.

## Verification and status

Before this change, outputs/ contained 301 files totaling 79,690,396 bytes, no node_modules folders and no reparse points. All 301 files matched their pre-cleanup hashes. The shared root dependency junction and an in-memory workbook smoke test passed during cleanup verification.

Staging checks passed: 299 output files tracked, two Python bytecode files excluded, and zero dependency/cache/temporary/collection paths tracked. All seven ignore probes passed. New policy/documentation whitespace checks passed. Owner explicitly authorized commit and push. Publication is pending remote verification; Drive restore testing remains owner-managed and is not claimed complete.

## Effects and rollback

GitHub restores committed output evidence again. New or changed files still require commit and push; uncommitted recovery relies on the owner's Drive backup. Dependencies continue to require the bundled runtime and setup script. Historical scripts are references and must not be replayed automatically. Git history is preserved.

To reverse only this policy later, restore the /outputs/ ignore rule and remove outputs from the index with git rm --cached while preserving local files; update the current policy documentation and commit the reversal. Do not delete local outputs or check out old workbooks over current work. Owner can validate recovery by inspecting an output file in GitHub and restoring a sample from Drive.
