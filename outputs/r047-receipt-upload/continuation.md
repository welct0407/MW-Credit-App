# Continue R047 manual receipt upload

Read [HANDOVER.md](HANDOVER.md) first. DEV DB V52 and both app definitions are saved; feature verification is unfinished. Do not replay backup/migration/dictionary scripts blindly or change PROD. R047 remains the sole Open release.

Blocker: owner must enable **Allow access to file URLs** in the ChatGPT Chrome extension for the **mw-credit.com** profile. Upload chooser was reached; no files transferred or GUI payments saved. All forms cancelled. Once enabled, complete tests listed in the handover using the existing synthetic R046 borrower/payment. Baseline financial/agent digest is in gui-before.json; preserve it until edit reconciliation. Use synthetic receiving account when creating a test payment, not the default real-named account. Final dictionary/model/status records must be updated to actual verified results.

Browser IDs changed after a tool reset: work profile is currently browser3 (`mw-credit.com`), personal browser4 (`Wel`). Verify routing via current inventory if IDs change. Account menu confirmed welct0407@mw-credit.com in work editor. Work tabs: OLTP2044432807, OLAP2044432853, user app2044432769. Versions1.000111 /1.000041. App definitions loaded only after user-tab reload; a data sync alone retained old form until reload. Current GUI proves upload controls in ordinary create, posted edit and selected-charge forms. Synthetic edit screenshot retained.

Use maintained current GUI. Explicit form orders, slice filter/membership and deck image/header/sort have been changed. Both editors zero warnings/errors. OLAP new columns hidden/read-only/nonsearchable; DateTime initial NOW() removed. No agent catalogue, runtime or audit relay changes. Manual objects are deliberately outside agent receipt_assets/receipt_payment_links.

Local checks passed: DB CI, agent attachment coexistence, verified backup restore/rehearsal, Flyway validation53; dictionary1,311 objects zero structural errors; Python syntax, JSON, handover links and V52 exact hash; whitespace. Publication is a useful checked checkpoint, not a completion claim. Unrelated untracked risks/payment-health work must stay untouched. No final R047 tag while Open.
