# B focused run output excerpt

This is a sanitized transcription of existing tool output, not an independently captured stdout log. No rerun was performed for this file.

- Runner: tests/integration/Run-PaymentJournal.ps1
- Existing execution session: 57347
- Retained run directory: C:/Users/ideaadmin/AppData/Local/Temp/mw-payment-rehearsal-c9f819153f68419692117f3e7804c7b3
- Tool output a5d019: tests 13; pass 13; fail 0; cancelled 0; skipped 0; duration_ms 3704.5191.
- Tool output 1f8b9f: actual PostgreSQL restart preserves committed outcomes and replay cannot recreate deleted source; tests 1; pass 1; fail 0; duration_ms 416.3276.
- Final output confirmed disposable PostgreSQL stopped and retained diagnostics at the directory above.

Retained original files: migration.json, start.out, start.err, restart.out, restart.err, postgres.log. C separately inspected migration target/count78, same-cluster orderly restart and final shutdown from these original files.

Evidence limits: restart was orderly fast shutdown/start, not a crash. Acknowledgment loss was explicitly simulated by throwing after an actual successful COMMIT, not a physical network disconnect. Historical-date replay used an explicitly seeded retained-outcome fixture, not wall-clock midnight travel. All records were synthetic in the runner-owned loopback database; no live database or cloud operation.
