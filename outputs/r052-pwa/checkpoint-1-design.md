# R052 PWA checkpoint 1A — architecture and visual review contract

7 October 2026. Agent A: GPT-6 Astra, High. Status: design ready for implementation; owner visual acceptance pending.

This is a bounded Phase 1 checkpoint with an early design prototype. It does not complete Phase 1 or the authenticated Phase 2 foundation. The owner requested separate architect, coding and testing agents, then an explicit stop for visual validation before further work. Agent B implements this contract; Agent C tests Agent B's work; the parent coordinates files, evidence and publication.

## Scope and boundary

Deliver a professional, responsive, bilingual navigation and read-screen preview using synthetic fixtures only. The user can inspect Collection, search and select a borrower, inspect related sample records, switch to Borrowers and change language. Other modules communicate intended scope honestly. No API, SQL, infrastructure, authentication provider, financial command, receipt store, scheduler, notification or AppSheet change belongs to this checkpoint.

The existing React/TypeScript scaffold has no business components or user identity. Its IAM-protected readiness endpoint is infrastructure evidence only. Do not present a fictitious logged-in user or an authentication/permission control that appears functional. No service worker, offline cache, local storage or installation claim is needed for this preview. Offline views and drafts remain required later; financial submission always requires online confirmation.

Use the current R052 release. The implementation repository is MW-Credit-App. The parent records starting commit, preserves unrelated changes, manages branch/publication and the review stop. No new migration or release number is allocated.

## Interface design

Use the owner-requested AppSheet OLTP White/light theme: DEV primary #e8710a and PROD primary #d81b60. Use the original pink Loan Manager logo unchanged for PROD and the owner-requested derived all-orange variant for DEV. Use coordinated light theme-tinted card surfaces and neutral page/navigation colors with clear hierarchy, generous whitespace, readable amounts and a consistent component system. The design should feel like a working operational tool. Keep a persistent, compact `Design preview · synthetic data` notice. Every displayed amount, record and date is demonstrative. Sample totals must reconcile to the fixtures; do not invent portfolio performance metrics.

Desktop uses a left navigation rail, page header and list/detail workspace. Mobile uses a compact header, reachable primary navigation and a full-width list; selection opens a detail screen with an explicit Back control. Avoid squeezing a desktop table onto a phone. Target 1440×900 and 390×844, with a narrow 360px check. These are viewport checks, not proof on real supported devices.

Proposed Operations navigation: Dashboard, Collection, Payments, Borrowers, Loans, Upcoming Charges, Business Expenses, Cash Statement. These names map to recorded AppSheet entry points. Collection and Borrowers are the functional preview; the remaining entries may lead to concise planned-scope panels. A separate desktop Management group describes Partners, Cash Position, Cash Accounts, Loan Assessment and Analytics/history. Mobile management expansion is future scope; all OLTP features must remain reachable on mobile when implemented. Navigation visibility never grants permissions.

The grouping and emphasis are design proposals for owner review, not frozen copies of the old tab order. Preserve eventual access to every required workflow rather than claiming that the prototype already has parity.

### Collection

Default page: Collection, with clearly labelled sample business date 7 October 2026. Show a fixture-derived due amount and borrower count; omit the portfolio-wide principal/outstanding total at owner request. Borrower and loan principal context remains distinct from amount due. Provide a labelled borrower search and a simple meaningful collection filter, with an explicit empty result and reset option.

Rows/cards show synthetic borrower name, amount due and a distinct outstanding-principal label. Show only an issue note where relevant, reflecting the recorded collection-note behavior. Selecting a row opens borrower context: principal, current sample loans/charges, upcoming dates and a clearly labelled receipt placeholder. Financial action controls should be omitted or disabled with a plain explanation that transaction entry follows in a later phase. Never show a successful payment or a working Submit/Receive command.

### Borrowers

Group borrowers with active loans before those without active loans. Display total outstanding principal under the name, following the recorded R014 presentation. Search and detail navigation are functional. Use immutable synthetic IDs for selection; names are labels, not keys. Shared detail components should avoid duplicate state and keep mobile Back behavior clear.

### Language and accessibility

Provide an English/ไทย switch covering actual visible labels, controls, empty states and planned-scope text. Use the existing bilingual terminology where available. Format currency as baht and dates deliberately with Asia/Bangkok semantics; fixture dates must not look like live freshness. Keep locale text in one typed map. Translation remains subject to owner review.

Use semantic headings, labelled inputs, real buttons/links, visible keyboard focus, adequate touch targets, accessible active-navigation state and non-color status labels. No external icon/font service is needed; use local CSS/SVG or existing dependencies. Do not add a large UI framework for this checkpoint.

## Implementation handoff to Agent B

Keep fixtures, locale strings and view components separate enough to replace fixtures with authorized read contracts in Phase 2. A small set of files under apps/pwa/src is sufficient; use React state and existing Vite tooling. No new dependency is required. Fixtures may model UI concepts but must not claim to be an approved API schema.

Do not edit API guards, Terraform, database source, deployment workflow or unrelated code. Coordinate with Agent C because the existing foundation test's zero-button assertion becomes obsolete. Parent decides publication and preview presentation; a local preview does not require a cloud deployment.

Mark planned modules explicitly. Existing authenticated reporting access must be preserved through go-live/cutover, but this prototype must not invent report URLs or embed sensitive dashboards. Owner deferred Phase 7 Metabase integration, dashboard work and enhancements until after production go-live. Native OLAP management and its governed analytics/history controls remain required before go-live. Neither deferral nor an empty preview panel proves report parity.

## Independent acceptance checks for Agent C

1. Build/typecheck and existing environment guard tests pass; source scope stays within the preview and related tests/docs.
2. Collection and Borrowers navigation, search, no-results/reset, selection and mobile Back behave consistently.
3. Due amount/count reconcile to sample fixture population and filters; outstanding principal is labelled separately. Borrowers preserve active-first grouping.
4. Both languages render the displayed UI without missing keys or misleading mixed operational labels; sample date and synthetic notice remain visible.
5. Desktop and mobile screenshots show readable list/detail states, no page-level horizontal overflow and no overlap from navigation. Include a 360px check.
6. Keyboard users can reach search, filters, locale, navigation and detail controls with visible focus and meaningful labels.
7. No financial submission, auth impersonation, real data/file access, external API request, persisted sensitive cache or offline-ready claim exists. Planned routes cannot be mistaken for completed functions.
8. Save concise results and screenshots with exact source revision where possible. Report failed or unavailable checks. Do not claim AppSheet GUI parity, authorization, actual device verification or SQL correctness from this preview.

## Review stop and next work

After implementation, independent tests, necessary fixes and documentation/publication, stop all agents. Ask the owner to validate navigation, Collection and borrower detail on desktop/mobile, information hierarchy and language. Await explicit go-ahead before continuing.

Phase 1 remains open for live enabled-object reconciliation, role/action/record policy, supported real devices, authentication/environment decision, performance/recovery/pilot targets and exact first financial contract. See [feature baseline](feature-baseline.md). The next implementation checkpoint should close blocking decisions and provide an authenticated, authorized read slice; do not add payment posting simply because the preview is accepted.

## Owner visual revision — 7 October 2026

Owner requested removal of the total outstanding summary, matching AppSheet OLTP DEV/PROD colors and reuse of the existing OLTP logo. The original green design direction above is superseded.

Recorded evidence: Environment_Inventory.md canonical theme table (DEV #e8710a / PROD #d81b60); current DEV dictionary theme/brand selected_control_values records White, and R051 source-mapping-validation.json branding.OLTP records White/#d81b60. These are repository observations, not a new live theme audit. Original resources/Loan Manager App Logo.png SHA256: 5808EE79D5B6E843C8ED648E8507678EA349297D1CC687A97021C5D396DD2A8D. Use the unchanged pink OLTP asset in both environments per owner instruction; do not recolor the image.

The initial summary container was off-white (#fffefa) while the featured due card was pale green (#edf1e7). Its text rules had no individual background fill. Normalize cards to white and text backgrounds to transparent. This CSS evidence does not establish a cause for any glyph-level rendering fringe.

A temporary DEV/PROD color preview may change presentation only, clearly labelled as colors only. It must never select a backend, identity, database, credential or deployment target. DEV remains the local/default preview; production deployment wiring remains future scope.

## Owner refinement: stronger theme presence

The owner requests cards in the theme color or a similar shade, to feel orange rather than showing only an orange header line. This supersedes the prior all-white-card instruction. Use coherent whole-card tints: DEV surface #fdf1e7 / selection #fbe8d8 / border #f9dcc2; PROD #fbe8ef / #f9dbe6 / #f5c6d7. Keep exact primary accents, dark text with transparent backgrounds, neutral surrounding surfaces and the unchanged OLTP logo. Derived tints are PWA design choices; no claim of exact AppSheet secondary values. Existing functionality and removed aggregate remain unchanged.

The owner subsequently requested an orange-background DEV logo. DEV now uses a separate built-in image-edited variant of the existing OLTP design; PROD retains the byte-identical original pink logo. This supersedes the earlier same-logo-in-both instruction. Variant provenance, prompt and hash are maintained in MW-Credit-App docs/Branding.md. Theme selection changes presentation/assets only, never identity/backend routing.

Final DEV refinement converts all remaining pink decorative surfaces to orange shades, not only the background. PROD remains the original pink. Parent visually reviewed the generated result; C verified rendered asset switching and preserved PROD hash.
