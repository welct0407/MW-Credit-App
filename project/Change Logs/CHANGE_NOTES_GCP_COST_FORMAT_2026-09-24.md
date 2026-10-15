# GCP cost currency formatting — 24 September 2026

Owner requested correction of literal `currencySGD` appearing beside the newly available GCP bill amounts. Development context: R027 Open. Starting commit `b8dbd3216c76011b6a5b15dcb253a78e06b8633d`.

Changed Cost dashboard `mw-resource-cost` panels 201–204 from the unsupported `currencySGD` unit to `prefix:S$`, matching the existing top SGD cards. Two-decimal precision, negative credit signs, queries, aggregation, source currency and layout are unchanged. Corrected the maintained classic/V2 definitions and builder so future rebuilds retain the fix; updated the visual guide. No Performance dashboard or alert change.

Rollback: current live Code resource was captured in the browser session before editing; maintained pre-change V2 resource copied to private `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/resource-monitoring/cost-maintained-before-sgd-format-v2.json`. Grafana version history or restoring only these four unit values reverses the formatting change. Starting Git version preserves the maintained source. Unrelated repository work is excluded.

Verification: semantic definition comparison limits changes to four unit properties. Browser rendering checked the three GCP cards and monetary detail cells, then saved/read back the dashboard. Numeric calculations are unchanged; no new tests needed for this presentation-only correction.

Status: completed and published with the commit containing this log.
