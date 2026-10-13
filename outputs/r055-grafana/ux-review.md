# R055 PWA Platform — Agent E UX review

Reviewed 13 October 2026. Configuration-only review of the PM generator/output, the R055 visual guide, and the canonical Grafana `spec` in MW-Credit-App. Starting PM commit: `a16f27d57e3a12b2f921d2b9983948a420d1fd2a`. Existing unrelated work was preserved. No GUI, browser, device visual test, live query, or deployment was performed.

Desktop, iPhone Pro Max and iPad considerations below are inferred from configured grid sizes and text density. They are not claims about actual Grafana responsive rendering, clipping or touch behavior.

## Overview and interpretation

**GRAF-INFO-01 · P2 — Make the interpretation panel scannable.** Panel 1 currently puts every caveat into one paragraph at height 4. Replace its Markdown content with the following four bullets and increase `gridPos.h` from 4 to 8. Shift every later panel's `gridPos.y` by +4 without changing their other grid coordinates or row nesting. Retain the complete existing paragraph in panel 1's description, with spacing corrected (`HTTP 4xx`). This gives narrow displays more room while keeping the essential caveats visible without hover.

```markdown
- **Timing:** 5-minute windows; range ends 2 minutes ago.
- **Missing ≠ healthy:** idle workers may have no data. Query errors remain errors.
- **HTTP 4xx:** may be client/auth rejection. No new alert thresholds.
- **Limits:** Hosting is one Debian vantage, not login or regional coverage. Job completion and notification delivery are not measured.
```

## Requests and comparison

**GRAF-SERIES-01 · P2 — Make request-series identity consistent.** For request panels 4, 7, 10, 13, 18, 21, 24 and 27, add field overrides matched by existing names: `All` fixed blue, `4xx` fixed orange, `5xx` fixed red. Keep the textual legend names visible and add dashed `custom.lineStyle` to 4xx and dotted `custom.lineStyle` to 5xx, using the deployed Grafana schema supported by the maintained provider. Keep All solid. This avoids relying on color alone and prevents default palette assignment from making a server-error subset look like ordinary traffic. Do not introduce thresholds, stacking, null-to-zero conversion or a new series. F should verify accepted line-style serialization through saved-definition readback; if unsupported, retain fixed colors and labels without inventing a property.

## Titles and service identification

**GRAF-LABEL-01 · P3 — Shorten titles while retaining environment/service context.** Current three-column charts allocate only eight grid units each. Use these exact templates for each existing environment/service: `PROD read · Requests / 5 min`, `PROD read · p95 latency (ms)`, `PROD read · Instance peak envelope` (substitute DEV and command/jobs/notify). Change Hosting titles to `PROD Hosting · single vantage` and `DEV Hosting · single vantage`. Preserve full canonical-shell/build-version and Debian-vantage details in descriptions. Correct missing spaces in descriptions (`older than 6 min`, `per 5 min`, `4xx/client rejection and 5xx/server failure`) and replace the outdated `Collector activation required.` with `Collected by the existing monitoring timer.` as documented in the current guide. This reduces title pressure on desktop/iPad; phone presentation still needs owner observation.

## Implementation and verification boundary

F owns the canonical dashboard and Terraform deployment; root coordinates generator/output and guide alignment. These recommendations are authorized corrective UX refinements, not a redesign. Keep existing UID, datasource, panel IDs, links, time range/refresh, filters, queries, aggregations, mappings, Unknown/error/missing semantics, and expanded environment rows unchanged. No changes to alerts or other dashboards are requested.

Use an exact-file diff and saved-definition API readback to verify only the intended text/grid/style changes. Assert query targets and status mappings are unchanged, all 29 panels retain their IDs, and panel positions do not overlap. No full CI or device-test claim is warranted by this review. Root should link this review from the existing R055 change record rather than create a separate recursive log.

Status: all three recommendations implemented in generator/output by root; exact delta check passed for 29 IDs, targets, datasource, status defaults, layout, links and time range. F applied and read back PWA version2; final Terraform plan has no changes. Not visually verified by E. Rollback for this review document is deletion of this added file; deployed rollback remains F's captured dashboard baseline.
