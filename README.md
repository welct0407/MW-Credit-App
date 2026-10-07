# MW Credit App

Development foundation for the MW Credit rebuild. Mobile will cover OLTP; desktop will cover OLTP and OLAP. Existing AppSheet apps continue running during development and the later parallel rollout.

- [Database promotion and migration procedure](database/README.md)
- [Development and infrastructure runbook](docs/Development.md)
- [Infrastructure change record](Change%20Logs/CHANGE_NOTES_INFRASTRUCTURE_2026-10-07.md)
- [Approved direction and coexistence design](https://github.com/welct0407/AppSheet-Loan-Project/blob/codex/pwa-rebuild-design/Documents/PWA_Rebuild_High_Level_Design.md)
- [Development page](https://mw-credit-app-dev-737787224638.web.app)

The deployed development page remains the synthetic foundation. Branch codex/r052-review-shell adds checkpoint 1A: a local Collection/Borrowers design preview with synthetic data. It is not deployed and has no authentication, API connection, payment posting or offline storage.

The [phased plan](https://github.com/welct0407/AppSheet-Loan-Project/blob/codex/pwa-implementation-plan/Documents/PWA_Implementation_Plan.md) and [orchestration workflow](https://github.com/welct0407/AppSheet-Loan-Project/blob/codex/pwa-implementation-plan/Documents/PWA_Orchestration.md) govern this work. Metabase enhancements follow production go-live. The agents stop for owner visual validation at each agreed checkpoint.

## Start on VM-01

```powershell
. ./scripts/Enter-Dev.ps1
npm ci
npm run dev
```

Run `npm run check` and `npm run test:e2e` before publication. Never put credentials, Terraform state or saved plans in this checkout.

## Checkpoint 1A preview

Start the local server with the commands above, then use its printed local URL. Collection and Borrowers support sample search/filter/detail review and English/Thai switching; other modules are planned scope. All records and dates are examples. Closing the preview discards its in-memory selections.

Owner review focuses on desktop/mobile navigation, amount labels, search/detail flow and translations. Acceptance of this preview is not acceptance of authentication, live financial behavior, offline operation or full feature parity. See the checkpoint evidence under outputs/r052-preview after verification.

Checkpoint 1A visual revision uses the [recorded OLTP branding](docs/Branding.md). Review DEV colors by default or use ?theme=prod / the colors-only selector for the PROD palette. This never connects to production. The portfolio outstanding summary has been removed.
