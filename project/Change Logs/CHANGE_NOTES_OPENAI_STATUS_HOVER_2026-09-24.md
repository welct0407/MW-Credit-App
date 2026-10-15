# OpenAI status incident hover — 24 September 2026

## Scope and outcome

Owner authorized current incident explanations on the ChatGPT/Codex traffic-light tiles and alignment of their existing mobile alert. Applied to Grafana stack `olivecrab1199`, Performance dashboard `mw-resource-performance`, panels **54/55**, and rule **efz3obf98zksga**. Development context: **R027 Open**; no AppSheet/database release or workload deployment. Starting Git commit: `def0038bfaa52775ef2e4b07d2e38fece1dddf6c`. Unrelated concurrent release work is excluded.

The previous `/api/v2/summary.json` returned an older, incomplete component list and no current incidents. The dashboard and alert now use the official website's current public response at `https://status.openai.com/proxy/status.openai.com`. The current response has 15 ChatGPT components and four Codex components; membership is discovered by group, not frozen to those counts. Identity/shape checks reject an incompatible response. This website interface is not a separately documented stable API and may require maintenance after a provider change.

The same canonical selector computes state and details. Active matching incidents or non-operational components produce Degraded; full/major outages produce Down. Resolved/closed incidents are excluded. Unknown does not generate a new alert. Hover text contains incident title/stage/latest message, Singapore update/check time, and official links; multiple incidents are separated. Healthy explicitly says no active incident is reported. Click/tap opens the newest incident or main status page. Native browser tooltip sizing applies; touch users use the link. No HTML or JavaScript from the provider is rendered.

Centered product labels, traffic lights, dimensions and positions remain intact. Rows to fields stores details as the field name, a fixed display name keeps the short component label, and the data-link title supplies the dynamic native hover. Other dashboard fields were preserved; Grafana normalized plugin version metadata while saving. The live owner time-picker settings (last three hours/one-minute refresh) were preserved rather than reset to builder defaults.

The alert keeps stable `component=chatgpt/codex` labels, a binary impairment value, 10-minute pending period, 2-minute evaluation, `MW Performance IRM`, and KeepLast on errors/no data. Incident text/timestamps do not become alert labels. No synthetic incident was saved to a live rule and no test push was generated.

## Changed artifacts

- `scripts/monitoring/openai-status.jq`: shared selector.
- `Query.Helpers.ps1`, `Build-Dashboards.ps1`, `Update-OpenAiPanels.ps1`: reproducible query/panel definitions and targeted patching.
- `test_openai_status.cjs`, `test_availability_queries.py`: behavioral coverage and adjusted missing-response assertion.
- Maintained Performance classic/V2 JSON and `openai-alert-query.json` under `outputs/resource-monitoring-20260922/`.
- Visual guide, operating reference, and monitoring scripts README.

## Rollback

Before mutation, captured the full dashboard Code resource to private `resource-monitoring/performance-before-openai-hover-v2.json` and the alert group export to `resource-monitoring/alert-group-before-hover.json`, under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/`. Restore only panels 54/55 or use dashboard version history; restore only the OpenAI rule's query/description from the alert backup so other rules are preserved. Reverting to the old endpoint restores its known missing-component limitation. No credential/access change needs reversal.

## Verification and limits

- Eleven local jq behavioral cases passed: healthy, active incident/product separation, resolved incident, multiple incidents/latest update, full outage, degraded without explanation, unknown component status, wrong site, missing product, missing incident array, missing incident binding.
- Maintained JSON semantic comparison verified changes confined to panels 54/55; both actual panel selectors returned Healthy against a fresh official response. PowerShell syntax checks passed for all affected scripts.
- Live dashboard queries returned green; after save/reload, DOM and accessibility readback confirmed both centered labels, incident-status link and multiline native hover text with SGT check time. Heights/grid positions unchanged.
- Live alert preview returned **two Normal instances, value 0**. Saved rule readback showed current endpoint, rule identity, updated description, 10m pending, IRM recipient and both KeepLast settings (saved 23:12 SGT).
- There was no active official incident during validation. Degraded/multiple/resolved cases were tested locally; physical phone behavior was not retested. The established push delivery chain was unchanged.

Status: live changes and documentation complete; publication recorded by the Git commit containing this log.
