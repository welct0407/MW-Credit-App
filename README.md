# MW Credit App

Development foundation for the MW Credit rebuild. Mobile will cover OLTP; desktop will cover OLTP and OLAP. Existing AppSheet apps continue running during development and the later parallel rollout.

- [Database promotion and migration procedure](database/README.md)
- [Development and infrastructure runbook](docs/Development.md)
- [Infrastructure change record](Change%20Logs/CHANGE_NOTES_INFRASTRUCTURE_2026-10-07.md)
- [Approved direction and coexistence design](https://github.com/welct0407/AppSheet-Loan-Project/blob/codex/pwa-rebuild-design/Documents/PWA_Rebuild_High_Level_Design.md)
- [Development page](https://mw-credit-app-dev-737787224638.web.app)

The page is a synthetic foundation screen. Financial workflows, user sign-in, offline drafts and production cutover are subsequent application work.

## Start on VM-01

```powershell
. ./scripts/Enter-Dev.ps1
npm ci
npm run dev
```

Run `npm run check` and `npm run test:e2e` before publication. Never put credentials, Terraform state or saved plans in this checkout.
