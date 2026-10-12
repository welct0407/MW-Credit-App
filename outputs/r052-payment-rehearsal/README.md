# Local first-receiving rehearsal — checkpoint 4A

This is a synthetic desktop/local preview, separate from the deployed DEV PWA. No real payment, notification, live credential or cloud service is used. The real V1–V77 migration/trigger chain runs in a fresh disposable loopback PostgreSQL database; the request journal is in memory and is not durable idempotency.

From `C:/GitHub/MW-Credit-App`:

```powershell
pwsh -NoProfile -File tests/integration/Run-PaymentRehearsal.ps1 -Serve
```

Open the printed `http://127.0.0.1:<port>` address on this computer. Select the two synthetic charges (฿330 total), review the receiving account/date/amount, and confirm. For unknown-outcome recovery, use a fresh run and select “Simulate a lost response after commit” before confirmation; then use Check status to discover the committed synthetic receipt. Unknown-state Retry stays disabled because this memory prototype cannot establish a durable safe-to-resend result. Backend same-identity replay is tested separately; it is not permission to resubmit an unresolved UI command.

Use the language switch to review English/Thai. Ctrl+C in the runner stops the local server and PostgreSQL; a fresh run creates fresh synthetic fixtures. Do not expose the loopback server or substitute a live connection. The installed iPhone/live DEV app does not contain this prototype.

## Evidence distinctions

- Actual disposable database tests exercise canonical posting, rollback, contention and current-schema correction/deletion behavior through V77.
- Simulated protocol/browser tests exercise lost responses, status recovery and UI guards; they do not prove durable journal or event delivery.
- `test-report.md` contains independent test counts/screenshots. `database-ci.json` will record the maintained full database verification once complete.
- Future durable command identity/tombstone and committed-event ownership remain design gaps. No new journal table/migration, runtime writer grant or live financial activation is approved by this rehearsal.

Live rollback is unnecessary: API00012-99g and Hostingff1c9ce9a4bfedf2 remain unchanged. Source rollback is the recorded starting app commit ecf0297944531461a9bb4f68652c30525494373a; preserve unrelated changes when reverting any intended files.
