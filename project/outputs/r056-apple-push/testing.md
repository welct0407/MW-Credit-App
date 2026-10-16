# R056 Apple push enrollment verification

13 October 2026, Agent C. Phase 2 operational secrets remained paused. No live SQL writes, notification sends or application/browser CI were executed.

## Results

- Focused command: installed Node 24 `--test tests/unit/apple-push-endpoints.test.mjs tests/unit/r056-apple-push-independent.test.mjs tests/unit/notifications.test.mjs tests/unit/notification-transport.test.mjs tests/unit/notifications-independent.test.mjs`: **12 passed, zero failures**, exit 0.
- One required `scripts/database/Test-CI.ps1`, after `scripts/Enter-Dev.ps1`, in isolated worktree `C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/worktrees/r056-apple-push`: **exit 0**. All cumulative SQL, historical upgrade and existing integration/operator families completed; Node families report **189 passes, zero failures**. The SQL tests are additional to that count.
- `scripts/database/Test-ApplePushEndpoints.sql`, included in the cumulative suite, passed actual registration RPC tests for six accepted and fifteen rejected endpoints using a nonsuperuser API capability. It verifies preserved function ownership, security-definer/search-path settings and no public EXECUTE. Synthetic changes were rolled back.
- Independent JS boundary coverage includes Apple subdomains, preserved FCM/Firefox providers, HTTPS, spoofed suffixes, root host, trailing dot, credentials, ports and fragments. Existing transport encryption, cancellation and redaction checks passed with mocked providers.

## Tested source and limits

CI began at `b9450cd4a9551d5bf667f0b22db0aa493cc8ad28`. During the run, root normalized the new V91 SQL from CRLF to LF (`a12ecc7`) and added the separate guarded V90 backup option (`018a59a`). SQL logic is identical across normalization; this is input-equivalent for Flyway line-based checksums, not an identical SHA256 claim. Final V91 SHA256 is `44cee4e1b4eb23449d4be5035247c7c904b83cfadd9c150000ad0fa3094a97c2`; expected normalized-line Flyway CRC32 is `2067906371`. CI's maintained migration families performed their migrate/validate/no-op/checksum-tamper checks. An extra local history capture attempt overlapped a stopped/migrating fixture and did not yield an applied V91 checksum receipt.

Root also committed delivery-only retry preservation and backup/operator corrections while CI ran. The final operator families finished after those sources were frozen at `b2a37f2`. B separately reported ten focused helper checks passing. No broad repeat was performed for those scoped corrections. The Apple JS/SQL behavior passed; DEV/PROD deployment and Lisa's device enrollment remain separate owner/runtime verification.

## Storage and cleanup

All owned database processes stopped; Phase8 runners removed their own fixtures. The generated tracked `outputs/r052-unified-receiving/independent-local-request-timings.json` was restored to HEAD after summarizing the passing functional result. Its temporary local timing samples establish no production performance claim. The isolated worktree is clean after moving its task log outside the checkout; its node_modules junction reuses the installed dependency directory.

After root confirmed verified source publication (`b2a37f2`) and concise PM evidence publication (`7061d944`), the maintained `Clear-IdeaadminTestArtifacts.ps1 -TargetPaths <exact thirteen paths> -Apply` removed all thirteen C-owned R056 fixtures listed below: **13 removed, zero skipped, zero remaining**. No PostgreSQL/pg_ctl process was active; no other task's files or paused Phase 2 cluster were touched. Free disk increased from **61.963 GiB to 62.850 GiB**.

Migration directories under `C:/Users/ideaadmin/AppData/Local/MWCredit/database-tools/`:

- `migration-test-21e2b989bd7b43de841ddf78b1bef73c`
- `migration-test-34f7df7f97a843b9b9877d48d5f54073`
- `migration-test-43808da076bc4fd0a62ddcfeed8d3363`
- `migration-test-4e342c78f31c4cd7a85b020879015189`
- `migration-test-be90d04ed65d436bab8ba811cf1a2a82`

Rehearsal directories under `C:/Users/ideaadmin/AppData/Local/Temp/`:

- `mw-payment-rehearsal-f469ad57e7f843448b88f84e3f9d0782`
- `mw-payment-rehearsal-c2c14315138c40bda0d95eb62e2e3601`
- `mw-payment-rehearsal-ed26d473fe2d4b9490426305873587bd`
- `mw-payment-rehearsal-6dc1086d03cb45039247228c8580ed42`
- `mw-payment-rehearsal-b2fb1730ce4c4bb69f878cde103128d2`
- `mw-payment-rehearsal-4d7393434049454aaa274b5ef39afea0`
- `mw-payment-rehearsal-a1a444fab6624010a086076202be81e1`
- `mw-payment-rehearsal-64e4e889a65943f5b3723b31a5b9704d`

Diagnostic retention: `C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/r056-c-testing-diagnostics-20261013/database-ci.log` (68,084 bytes) and `started.txt`. Purpose: exact run outcomes and cleanup-path ownership; owner C/R056; review/delete by **20 October 2026** after evidence publication/cleanup. Disk free at completion: **61.96 GiB**. No credential or recovery originals were changed.
