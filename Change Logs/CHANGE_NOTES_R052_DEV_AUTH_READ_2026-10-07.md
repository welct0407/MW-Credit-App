# R052 checkpoint 2A and Agent D routing

Date: 7 October 2026. Status: source and initial DEV infrastructure verified; live deployment and independent smoke passed; CI investigation and real owner validation pending.

Owner accepted checkpoint 1B with darker separators and authorized checkpoint 2A; initial DEV access is only welct0407@mw-credit.com. Owner assigns all infrastructure/miscellaneous work to Agent D, GPT-6 Astra Low (Astra Light); parent coordinates and reviews A/B/C/D and leads issue resolution.

Starting PM commit 30be9ed08c22acf3ddd9c844f5cf451f2ab5810d. Preserved Agent A's checkpoint-2a-design.md and unrelated primary checkout. Updated orchestration/model mapping, plan, R052 tracker (still sole Open), DEV difference/environment records and checkpoint evidence. No dictionary change: no AppSheet/schema definition change.

App source 24c198152e1987a2dbfd0acca67b47330fd76aab passed 71 units and two mocked UI tests. Scoped DEV DCL grants nine column SELECT privileges; PROD column grants remain zero. Separate read service creation succeeded; allUsers invoker failed domain-restricted sharing. Owner approved the reviewed replacement plan; it applied only new service invoker_iam_disabled false to true (0 add, 1 change, 0 destroy). No organization-policy change or bypass attempted. Existing private API retained.

Rollback: Git restores these documentation changes; live recovery remains in the application repository/private ACL snapshot and Terraform state. State/plans may contain OAuth secrets and are never published. Remaining: recurring mocked desktop CI startup investigation, owner Google login/read, managed real UID pin. Phase 2, production and cutover are not complete.

Follow-up source checkpoint: app 18c37369d04c213dc6841c5cb8f2a275447ede91 published; 72/72 full unit checks and Terraform format/validation pass. Cloud Run reserved z-path interception is addressed by /health on the new service only. Persistent Secret Manager UID pin configuration passed A's review; empty identity container exists, actual UID still pending real sign-in.

Deployment: read revision mw-credit-app-read-dev-00002-ln2 Ready, Cloud Build8acb768f-6fdc-448d-89c4-f214c135f030 success, image digest89f10f0398df19071601caf39df28dc4c26559c69ea0dd9af2d358615e0d8593. Live DEV URL https://mw-credit-app-dev-737787224638.web.app versionc0872b1adcb4006f. Prior Hosting911d3a1e1883b92c retained privately for rollback. Old API unchanged. Checkpoint2A remains incomplete pending owner real Google login/read and subsequent UID pin.
