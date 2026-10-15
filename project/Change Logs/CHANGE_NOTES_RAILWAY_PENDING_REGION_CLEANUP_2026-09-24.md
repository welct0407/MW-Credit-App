# Railway pending region cleanup — 2026-09-24

- Scope and authorization: owner requested discarding the two staged Postgres region edits in MW Credit Metabase and checking the actual Railway configuration.
- Target: production environment `df3ba125-0d62-446a-b4d8-5196780982c9`, Postgres service `6ba627ff-bc6d-41e7-8182-6c0f1fb03998`, project `c8e57452-36dc-41f1-8d00-856b521a96c7`. Correct Gmail Chrome profile and Railway account verified.
- Change: discarded the two pending settings together: removal of `asia-southeast1-eqsg3a` and addition of `sfo` replica count 1. These drafts proposed a move from Singapore to US West; their origin is unknown.
- Verification: Railway's pending-change banner disappeared and Postgres returned to Online without an Edited badge. The live Postgres Settings page, Scale → Regions & Replicas, displayed **Southeast Asia (Singapore, Singapore)** and **1** replica. This is direct UI evidence, not inference from repository documentation. Metabase also displayed Online.
- Rollback: active deployment was not changed and no deployment was initiated. Discarded draft values are recorded above for recovery if explicitly requested. No database records or volumes were changed.
- Repository starting commit: `6a132b557b02dbe98a84d11fe31fa5c2a696dc28`; unrelated existing working changes preserved.
- Status: complete; no remaining manual checks for this scoped cleanup. Current environment reference needs no change because the active Singapore configuration is unchanged.
