# R054 UI preview — independent focused verification

12 October 2026; C Testing. Owner scope: DEV first, no CI. No build/server/test suite started by C; B's type checks and D's final configured build are attributed/reused, not relabeled independent executions. No backend, database, financial rule or policy change in this UI slice.

Source lineage: Dashboard's Available Cash Pool reads the existing `incomeMtd.cashPoolRemaining`; `readDashboard` passes `readCashOverview().dashboard`, whose Cash Dashboard.Cash Pool Remaining is existing V31 Available Cashpool numeric. No new calculation or SQL projection. C identified two defects in the draft; B corrected them before D built: total/available rows explicitly span the grid so available is vertically below total; authorized notification target sets the notifications view before opening the existing record, preserving Back destination. Hidden Notifications remains mounted for URL resolution but only visible panel owns contextual Refresh.

Actual signed-in DEV pass on `https://dev-lm.mw-credit.com`, Chrome work profile mw-credit.com, normal1164×817 viewport. Observed entry `/assets/index-B77ceKYY.js`; D independently pins its hash `4cfb51eb7cd0907c40473c09af574384ac2dd0d83fd86d43a09df9118d841fc9`, marker73aa3c7677da110e7e52d2eb, Hosting versionf2c2c2220a34ad80/release1791818248608000. D delivery pins are attributed evidence; C independently verified the rendered DOM and geometry.

- Dashboard KPIs, Collection, Active loans, Monthly Forecast, Income MTD and Business Cash Held rendered; no Dashboard details/summary collapse controls.
- Available Cash Pool is currency-formatted, shares total cash's left edge and starts below its bottom edge. No values exported.
- No horizontal overflow or visible alerts; startup completed and owner session was available without a new sign-in/profile.
- Notifications is in account controls alongside language/sign-out. Clicking it selects its own page, hides Dashboard, reveals the notification panel and changes header Refresh to Refresh notifications. No enrollment/preference/status/history/financial action was executed.

Source routing uses the exact new pink asset only for PROD logo/icons; DEV stays orange. Root's Drive asset provenance and D/B asset/build evidence are reused, not claimed as a live PROD visual test. The screenshot capability timed out; C has no pixel screenshot and records DOM/layout verification rather than claiming independent pixel inspection. No screenshot/file containing financial data was saved or published.

No responsive viewport override, CI, live send, payment, enrollment or further history target query. Root accepted this bounded functional pass and handed desktop/iPhone Pro Max/iPad visual review to E using its own browser tab. Existing actual target/deep-link source regression is inspected; live natural-data Back is not newly claimed. E's NOTIFY-01 stale status after enable remains B's focused local correction scope; C did not toggle subscriptions to reproduce it. This report does not claim PROD approval or completion of E's UX review.

Existing work-profile tab304619815 was left at Notifications and handed off; no new profile/tab/helper/scratch created by C. Concurrent credential edits and prior captures were untouched.
