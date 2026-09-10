# External credential storage rule — 2026-09-10

Owner instructed that credentials unsuitable for GitHub storage must be saved under C:\Users\MWCredit\Documents\ChatGPT. Updated AGENTS.md with that location, optional project subfolders, external path references, safe migration verification and separate backup coverage. The rule also covers recovery keys and project-exported authentication sessions. Ignored folders under C:\GitHub are not permitted credential storage. Application-managed sign-in stores are outside this migration scope.

Scope is documentation/governance only. The designated folder already exists. No credentials were created, printed, moved or regenerated, and no account login, AppSheet/Looker configuration or backup setting was changed. This project's earlier uncommitted Drive-scope documentation edits remain preserved.

Rollback reference: HEAD 66ea0b31d9647ea860172b7dc5622a5ea4f82c4d plus the pre-existing local Drive-scope edits. Remove only the new Credential storage section and this log to reverse this rule; do not restore the whole file over prior or later work. No app/report backup is applicable.

Checks: verified destination-folder existence, consistent policy in both project AGENTS.md files, and whitespace validation. Manual follow-up: confirm the external folder has owner-managed backup coverage before relying on it for disaster recovery. Status: rule implemented locally; not committed/pushed.
