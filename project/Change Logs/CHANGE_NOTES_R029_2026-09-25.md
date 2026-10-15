# R029 — equal-quadrant borrower matrix

Owner authorized implementation in SQL/Metabase on 25 September, expecting no AppSheet changes. Starting commit `d59fca074e9b79412f61066adf012e913e47c474`; unrelated risks-design and R026 untracked files preserved.

Scope: additive display-coordinate view over unchanged R028 V3, independent Metabase matrix question replacing only review-tab scatter placement; old question retained. Both AppSheet apps and bound views remain unchanged. No financial writes, jobs, notifications or category changes.

Native feasibility proved with synthetic question 273 in private collection4: existing line renderer supports isolated category-colored dots and two explicit reference-line series, producing a centered cross. The series contain display scaffolding, never extra borrower rows. This avoids edition/plugin/hosting changes. Implementation now complete as recorded below.

Rollback: preserve V3 and old question 266; private full dashboard/question baseline before changes. Additive unused view can remain after report rollback. SQL backups/restore proof and release checklist will accompany promotion. R029 was Open through development; freeze handoff recorded below.

DEV V43 and all coordinate/source checks passed. PROD-restored rehearsal and 186 synthetic cases passed without financial changes. Migration chain passed. Freeze/capture 2026-09-25T03:41:20.2908300Z: clean SQL pin de0a72a, R030 sole Open. Production deployment now proceeding within owner authorization.

PROD V43 applied/validated from the clean captured pin. Reader receives SELECT on the new view only. Live parity: 23 borrowers, zero original-field/category changes and no wrong-quadrant positions. New questions274/275 published; original266 retained. Category summary/list positions aligned with the new matrix orientation. Four explicit quadrant-label notes and complete borrower details added. All other tabs/filters preserved; no card overlaps. Synthetic273 archived after verification.

Native renderer refinement: use deterministic subpixel x offsets and null guards to retain every point without line connections. Exact view coordinates remain unchanged. Chart aspect ratio follows native responsive layout; four regions remain equal. Labels live immediately above/below the chart. Native tooltips include normalized position values alongside clearly labeled actual scores. No custom plugin, hosting, license change or AppSheet work.

Desktop/mobile visual checks passed; rendered mobile marker counts4 / 5 / 8 / 6 match source. Viewport reset. Exact dictionary capture/validation passed; core release records and design updated. Released SQL/report only, final evidence tag R029; normal branch/tag publication verified before final response. Recovery uses saved before-layout/question 266 and unused additive view; no financial database restoration needed. No outstanding scope tests; unrelated R026 app issues remain owner-deferred.
