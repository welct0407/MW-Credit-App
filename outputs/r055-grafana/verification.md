# R055 independent focused verification

13 October 2026. Agent C, Sol6.1 Medium. Scope follows `outputs/r055-grafana/plan.md`: native collector/dashboard source and Grafana runner safeguards. No live mutation, full CI, credential retrieval or authenticated Grafana observation is claimed. Bootstrap was initially unavailable; root subsequently reported owner credential handoff to F. C did not access that credential. Unrelated dirty work is preserved; C changes only this evidence file.

## Native collector and existing dashboard identities

Frozen B slice independently executed:

- Bundled Python `-B -m unittest discover -s scripts/monitoring -p test_debian_health.py`: **28/28 pass**.
- Bundled Node `scripts/monitoring/test_native_api_dashboard.cjs`: **pass**, both classic and v2 dashboard forms; exact two title/description changes, unchanged other definitions/UID/query/data source, idempotence, wrong UID/data source refusal.
- In-memory independent collector harness: **19/19 pass**. JSON list/string/null/number/empty object, negative/float/boolean count, nonboolean authentication, wrong scope/manifest and timeout/permission failure become Down. Genuine pinned authenticated count zero/one becomes Up. Explicit disabled becomes Paused; malformed flag, malformed manifest and origin trailing-slash drift reject before executing the injected runner. No subprocess or network was invoked by this harness.

Maintained fixtures also verify absent native configuration becomes Unknown (not legacy AppSheet fallback), exact PROD origin/audience/database, both bounded key-only scopes, nonzero probe exit and malformed JSON. The actual collector invokes only fixed `native-api-probe` arguments with a 70-second limit; it does not invoke business jobs.

Initially jq was unavailable on PATH and the bounded known Git/tool/runtime paths. Root authorized the standard official tool download to the existing external tool cache. Downloaded [jq 1.8.2](https://github.com/jqlang/jq/releases/tag/jq-1.8.2) Windows AMD64 to `C:/Users/ideaadmin/AppData/Local/MWCredit/tools/jq-1.8.2/jq.exe`; verified against the vendor release `sha256sum.txt` before execution: `a6fc67fedaf9128a3309a1e2ebb8b986aeccf70122ee46d2cb4849e423f0c627`. This is a reusable installed tool, not repository/output scratch. PATH addition was process-local.

Executed maintained `test_availability_queries.py outputs/resource-monitoring-20260922/performance-dashboard.json`: **13/13 pass**. Independently executed the exact existing native panel 56/57 selectors: **18/18 pass** across all five statuses, absent/empty telemetry, 361-second-old successful reports, and malformed timestamps. Missing/stale returns Unknown; malformed timestamps produce a nonzero query error rather than a healthy value. This does not claim that Grafana's live renderer converts provider errors to Unknown. Historical dashboard fixtures are not an authenticated current baseline.

Tested SHA-256 pins:

| File | SHA-256 |
| --- | --- |
| `scripts/monitoring/debian-health.py` | `c22e556518600e1061caeba65360542297dce606711ea81ec8e18bde685b0c07` |
| `scripts/monitoring/test_debian_health.py` | `38965f3e7880897776bd2e93adf016c09f393463110d33f1458902755847e80d` |
| `scripts/monitoring/native-api-dashboard.cjs` | `1cdaad86cf1a967b13cc37006d50b6a8ba7522b347f5645100703bc87d072f67` |
| `scripts/monitoring/test_native_api_dashboard.cjs` | `774d94259f728d50b2e9c2ca14da5aba68ab5a3f180a114c037b890ce8815a5c` |
| `scripts/monitoring/Query.Helpers.ps1` | `75b30aab16e9c3284af69cf58b9b12873aaa0a11fa256d8cdec1d617eb43e13b` |

## Grafana runner

F's initial frozen runner: **8/8 maintained tests pass**, plus **16 independent guards pass** for all redirect statuses 301/302/303/307/308, foreign/absolute API paths, invalid numeric secret versions before credential access, and repository/sibling/traversal private-path refusal.

C found inherited `TF_CLI_ARGS*`/workspace/provider variables could bypass explicit argument/target checks, and malformed arguments were validated after credential lookup. F corrected both. Independently tested final bytes using only mocked subprocess/filesystem/credential seams: fixed `-chdir`, exact child environment with all ambient `TF_*`/`GRAFANA_*` removed and only reviewed auth/data injected; malformed CLI/direct calls reject before credentials/spawn; valid no-op and five malformed/mutating baselines; **6/6 additional saved-plan tests** prove exact reviewed byte hash, absent/wrong hash refusal and extra apply/show/plan flag refusal. No real Terraform process, plan, credential or private file was created/read by these tests.

Final inspected pins:

| File | SHA-256 |
| --- | --- |
| App `scripts/grafana/manage.py` | `29ba96b2873b15e017bb4ffe34f719abef0adfca63935e134daf20e1a5cff64f` |
| App `tests/grafana/test_manage.py` | `c1483e35accfbb6048ddeb5eb925bede4117505b61877bdd681b8721360a0d31` |
| App `infrastructure/grafana/main.tf` | `e6d1a71dd5608ce9f0f59dc29bf5fd6945a898cd39a4bb9c056aa94bb8f4a8dd` |

Terraform source inspection confirms fixed monitor origin, isolated `grafana` state prefix, retained exact UID keys and prevent-destroy lifecycle; definitions start empty, with no fabricated live resource IDs or token resources. F's fmt/validate evidence is attributed/reused; C did not repeat initialization/validation or import/apply.

## PWA platform and Hosting delta

B's frozen PWA dashboard test with F's `cloud-run-metric-evidence.json` and checksum-verified jq: **pass**, 29 unique panels with fixed datasource/project/service bindings, explicit UID-availability requirement, exact inspected descriptor/aggregation requirements and executable missing/error/truncated/future/stale fixtures. Independent **22 cases pass**: descriptor type drift refuses, all eight latency queries merge distributions with `ALIGN_SUM` then `REDUCE_PERCENTILE_95` (no averaging percentiles), all eight request charts preserve separate All/4xx/5xx targets, malformed Hosting timestamps and empty telemetry become Unknown, and numeric zero/double values remain genuine observations. No-data is not manufactured zero; 4xx is described as client/auth rejection rather than outage. Instance charts honestly describe a peak envelope. No error-ratio/latency alerts or minimum-volume claims were introduced.

Hosting source initially passed four maintained tests and ten independent actual-reader mocks (oversized/status/unexpected final URL/invalid UTF-8/no Authorization header/all redirect statuses). C then demonstrated two false positives: final fetch could finish after the total budget and still report Up; commented-only shell markup could report Up. B corrected both. Final affected proof: **6/6 maintained Hosting tests**, plus **12 independent cases pass** for late finish rejection, comment-only rejection, within-budget success, exact fixed child arguments with ten-second subprocess deadline, malformed/nonboolean child status, nonzero child exit, and timeout. Real default probes now run the same-file fixed `--hosting-probe dev|prod` child; standard `subprocess.run(timeout=10)` kills/reaps it on timeout, bounding slow DNS/header/body operations. Injected reader path additionally checks time after every fetch. Child output is status only. No real network or child was invoked in C's mocked tests.

Final changed pins:

| File | SHA-256 |
| --- | --- |
| `scripts/monitoring/debian-health.py` (Hosting delta; earlier collector pin is historical) | `6d9caffc1b20ca1411420441b92eb030cddca7b4f72eb67403db562a9c8458bc` |
| `scripts/monitoring/test_hosting_health.py` | `c226e78c6464c4c20c15fee6628e724ec28e21a92888659e987b6e3e3b1af8f4` |
| `scripts/monitoring/pwa-platform-dashboard.cjs` | `0c973d788af0e47955bfd4988dfd6d961923af19bffee1b30e73f9f0178c0cda` |
| `scripts/monitoring/test_pwa_platform_dashboard.cjs` | `6c5672fcfee4e280a34fcbb994ab8d8df9e62ed1355cffa7c8faaf6d4d6ebf20` |
| `outputs/r055-grafana/pwa-platform-dashboard.json` | `80f5eb279dfbfaff5936e526cf2d4a89b1dbf819e976478a13eef79d6b5e1e9e` |

Earlier native collector and dashboard identity checks are reused: their functions/query semantics were unchanged by this Hosting-only delta; no unrelated suite was repeated. Candidate generation is not live Grafana acceptance. F owns actual datasource API query/activation proof. Scheduled job intended-boundary/completion freshness and notification queue/provider/device outcome telemetry remain explicit coverage gaps; platform HTTP/latency charts cannot prove them.

## Remaining live boundaries

Authenticated org/resource inventory, exact current dashboard/rule/data-source baseline, provider adoption/no-change plan, final PWA metric coverage, natural collector interval, and readback remain pending. Local checks cannot establish these facts. No token, state, private payload or live business data was written into a repository. No C-owned scratch/helper was created by the collector checks.
