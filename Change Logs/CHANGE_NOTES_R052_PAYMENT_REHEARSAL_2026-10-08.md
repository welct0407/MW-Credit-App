# R052 checkpoint 4A — Local first-receiving rehearsal

8 October 2026 (Asia/Bangkok). Owner accepted checkpoint2G and continued. This checkpoint is a synthetic local design/prototype and full-V77 transaction rehearsal, not a live financial feature. Baselines: app ecf0297944531461a9bb4f68652c30525494373a; PM44b93b02a783fb9191c7294cc26f1a503903ebe6. Existing API00012-99g and Hostingff1c9ce9a4bfedf2 remain unchanged.

Scope: dedicated loopback-only disposable PostgreSQL, canonical Selected Charges posting through existing V77 triggers, synthetic actor/account/charges, local confirmation/status/retry UI, independent actual transaction and browser evidence. Canonical payload uses schemaVersion:1. In-memory request history demonstrates protocol behavior only; source correction/deletion prevents treating mutable Payments identity as durable original-payload protection. No new journal migration, live credentials, runtime privileges, cloud deployment or event delivery.

Verification: focused full-V77 checks passed 12/12 (B6+C6); maintained scripts/database/Test-CI.ps1 passed once with exit0. C final four browser scenarios passed; A findings closed and parent visual review passed. Record final outcomes in outputs/r052-payment-rehearsal when frozen. Do not equate simulated lost-response/journal behavior with durable production idempotency or AppSheet notification delivery.

Preview: from the app repository run pwsh -NoProfile -File tests/integration/Run-PaymentRehearsal.ps1 -Serve. The runner creates a fresh temporary cluster/database, prints a random http://127.0.0.1 URL and stops PostgreSQL when the runner exits. The preview contains synthetic records only and is excluded from live PWA delivery. Close with Ctrl+C in the owning process; retain temporary diagnostic files until evidence is reviewed. A fresh run resets the synthetic scenario.

Recovery: stop the local runner; revert only intended source/docs changes if needed. No live data or service rollback is required. Unrelated PM DNS planning log remains excluded. Native iPhone offline/reconnect is owner-accepted; native update activation remains unobserved. Full Phase1/2 and live financial activation remain open.

Unknown-state UI Retry is disabled pending a conclusive status because the in-memory prototype cannot establish durable safe-to-resend permission. Backend same-identity replay tests remain separate from this UI guard.
