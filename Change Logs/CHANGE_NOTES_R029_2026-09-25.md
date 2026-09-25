# R029 — equal-quadrant borrower matrix

Owner authorized implementation in SQL/Metabase on 25 September, expecting no AppSheet changes. Starting commit `d59fca074e9b79412f61066adf012e913e47c474`; unrelated risks-design and R026 untracked files preserved.

Scope: additive display-coordinate view over unchanged R028 V3, independent Metabase matrix question replacing only review-tab scatter placement; old question retained. Both AppSheet apps and bound views remain unchanged. No financial writes, jobs, notifications or category changes.

Native feasibility proved with synthetic question273 in private collection4: existing line renderer supports isolated category-colored dots and two explicit reference-line series, producing a centered cross. The series contain display scaffolding, never extra borrower rows. This avoids edition/plugin/hosting changes. Full implementation and verification pending.

Rollback: preserve V3 and old question266; private full dashboard/question baseline before changes. Additive unused view can remain after report rollback. SQL backups/restore proof and release checklist will accompany promotion. R029 remains Open during development.
