# Loan ecosystem — 4 October 2026

The original [editable draw.io file](https://github.com/welct0407/AppSheet-Loan-Project/blob/16f324f21c5e4046cce740294feea20c633d4117/Documents/Loan_Business_Ecosystem.drawio) now contains three pages:

| Page | Scope | PNG preview | Editable SVG companion |
| --- | --- | --- | --- |
| 1 | Loan business ecosystem | [PNG](page-1.png) | [SVG](page-1.svg) |
| 2 | Monitoring systems | [PNG](page-2.png) | [SVG](page-2.svg) |
| 3 | Development systems | [PNG](page-3.png) | [SVG](page-3.svg) |

All pages use the original 2400 × 1770 canvas, Helvetica typography, pastel panels, white rounded cards, color-coded orthogonal connectors and embedded product logos. Page 1 retains its original geometry, connectors and images; only five text cells change (date/subtitle, monitoring/access/development summaries and footer). New pages use native editable shapes/text/connectors. PNGs are previews; every SVG embeds the complete three-page source in its `content` attribute. September 16/27 exports remain historical evidence.

## Evidence basis and limits

- [Solution Design](../../Documents/Solution_Design.md) and [Environment Inventory](../../Documents/Environment_Inventory.md): business ownership, separate DEV/PROD/internal databases on shared Cloud SQL, reporting and runtime placement. Existing business flows are preserved, not freshly live-audited.
- [Resource Monitoring](../../Documents/Resource_Monitoring.md) and [dashboard guide](../../Documents/Resource_Monitoring_Dashboard_Guide.md): direct provider queries, Debian collector cadence, dashboard semantics and ten documented rules. The former source-only bridge introduction is superseded within deployment/delivery scope by the newer bridge checkpoint.
- [Grafana bridge](../../Documents/Grafana_MCP_Events_Bridge.md): Cloud Run, Firestore, Scheduler and additive delivery retaining IRM/mobile. The task coordinator supplied successful native connection checks at **12:22 and 12:28 UTC, 4 October**; source deployment PR [#9](https://github.com/welct0407/AppSheet-Loan-Project/pull/9) was **merge-pending at handoff**. These are supplied observations, not repeated live checks by this diagram task. The earlier pending-native-acceptance label is intentionally omitted.
- [Development Workflow](../../Documents/Development_Workflow.md), [Model Work Mapping](../../Documents/Model_Work_Mapping.md), [orchestration policy](../../Documents/PWA_Orchestration.md) and [Release Workflow](../../Documents/Release_Workflow.md): executor routing, repository ownership and promotion boundaries.
- [R050 closeout](../../Change%20Logs/CHANGE_NOTES_R050_VM01_CONTROLLER_2026-10-01.md): completed controller/certificate lifecycle. The task coordinator reconfirmed that the **idle hold remains valid**. Do not infer that the older automatic-idle design-pending paragraph or technical certificate access authorizes a power operation.

No fresh service audit, business test, notification, deployment, merge, credential operation or access change occurred. Details of authentication are deliberately excluded. The drawing records an architecture checkpoint, not universal service-health or recovery proof.

## Reproduction and preservation

Run `node scripts/build-loan-ecosystem.cjs`. It invokes the maintained visual generator for **all three pages**. Rebuilding was checked byte-for-byte against the delivered source. Future manual edits must be reconciled into the generator before rebuilding; otherwise the generator intentionally overwrites the source.

The [official draw.io skill](https://github.com/jgraph/drawio-mcp/blob/main/plugins/codex/drawio/skills/drawio/SKILL.md) informed native XML authoring. The plugin itself was not installed. Its generic intermediate-source deletion guidance does not apply: this task expressly requires preserving the original editable file.

Local rendering uses the official [draw.io viewer JavaScript](https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/viewer-static.min.js) and existing Playwright/Chromium, with all browser network requests blocked. The fetched viewer is a temporary dependency outside Git, not a Desktop or plugin installation. `validation.json` records its exact SHA-256 and Chromium version. Supply a matching local viewer copy and existing Chromium executable:

```sh
node scripts/render-loan-ecosystem.cjs /path/to/viewer-static.min.js /path/to/chromium
```

The renderer decodes each page separately, exports through draw.io's `Graph.getSvg`, embeds the complete source, then rasterizes the finished SVG in a fresh local browser page with an explicit standards-mode doctype. This avoids transient live-view header placement observed during initial QA. These are official-viewer renders, not claimed Desktop exports or a browser import acceptance test. No dismissed browser import/upload was retried.

Validation: three nonempty pages; page-local unique IDs and valid references; no dangling connectors; 2400 × 1770 bounds; zero browser script errors; complete SVG/source equality; deterministic regeneration; original page geometry/styles/logos retained; all three final previews visually inspected for text, logos, layout and connector legibility. See [render checks](validation.json), [source checks](source-checks.json) and the [change log](../../Change%20Logs/CHANGE_NOTES_LOAN_ECOSYSTEM_THREE_PAGES_2026-10-04.md).
