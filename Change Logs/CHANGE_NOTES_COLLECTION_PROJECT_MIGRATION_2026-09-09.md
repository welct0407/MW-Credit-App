# Collection project migration — 2026-09-09

Owner authorized documenting/enforcing the service catalogue and moving the collection software into a private GitHub repository.

Canonical project: C:\GitHub\MW-AI-Collection. Private repository: https://github.com/welct0407/MW-AI-Collection.

Collection source, tests, runtime scripts, templates and change history now belong to that project. Existing collection-agent and mw-ai-collection paths are compatibility junctions to the same runtime files. Removed those paths from this repository's index and ignored them; physical data and all local changes are retained in the new repository/runtime. The source migration changes are staged for review, not pushed as part of the unrelated AppSheet working tree.

Updated this project's AGENTS.md to direct collection sessions to the new project's AGENTS.md and SERVICE_CATALOGUE.md. AppSheet/Looker configuration, sources/ reference files and data-model documentation were not edited. Their app/report backups are not applicable.

Rollback evidence: C:\GitHub\MW-AI-Collection\collection-agent\local\before-service-catalogue-20260909 contains source/config backups, previous task actions, the source Git index before untracking collection paths, and a source working-tree diff. Do not replace the index after further staging without checking intervening changes. Do not restore SQLite snapshots over current financial activity.

The standalone project's Change Logs/CHANGE_NOTES_SERVICE_CATALOGUE_AND_REPOSITORY_2026-09-09.md records full scope, 109 passing tests, service restart/API validation, private-repository validation, runtime resumption and manual acceptance steps. Normal borrower commitment/receipt and reviewer decision tests remain for user acceptance. General reviewer OLTP commands are explicitly unavailable until implemented; app-configuration commands cannot execute.
