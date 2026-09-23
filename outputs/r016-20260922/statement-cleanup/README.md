# Canonical cash statements — R016 continuation

Owner authorized the proposed 9R/10R enhancements and replacement of original pages 2, 9 and 10 on 23 September 2026. Starting Git `cf243e138cd85701cd8e156626e88a65174d604e`, clean. This remains R016; whole-release acceptance/key retirement/tag are separate.

Source policy: page 2 keeps today/live and past/snapshot routing. Pages 9/10 use live statement totals and supporting detail for any selected period; separately labeled completed-day trends read stored Daily Analytics. No new financial storage, backfill or scheduler change.

V38 adds four read-only views and two period functions. Live income has no FIFO/cash history joins. Cash statements aggregate one fresh opening seed from source facts and window only selected transactions. V39 corrects a UTF-8 transfer label exposed by DEV full-row parity; V38 remains immutable. Existing providers remain for rollback/shared consumers; destructive SQL removal is deferred under expand/contract.

Recovery: exact Metabase definitions, dashboards, snippets and permission graph are privately saved under `r016-20260922/statement-cleanup-before`. Verified database dumps and restore fingerprints are under `r016-20260922/statement-cleanup`; sanitized backup references are adjacent. Roll back dashboard/questions/models/snippets together, unarchive retired cards, and leave compatible additive SQL in place. No app definitions or financial data change.

Checkpoint: DEV V39 parity passed. Disposable CI and PROD backup rehearsal are being completed before exact-commit promotion. Live report installation, dependency retirement, browser review and final YAML/current-documentation closure remain pending.
