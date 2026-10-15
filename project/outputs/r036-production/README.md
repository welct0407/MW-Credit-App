# R036 production release

Production SQL **V45** and OLTP **3.000249** are deployed. OLAP **1.100202** is unchanged. Owner authorized promotion on25 September; final checks completed26 September2026 (Bangkok).

The release automates daily interest at the retained original rate after future principal changes, and includes the accepted OLTP Thai/English navigation/detail/form labels and Payments table layout. Existing loan backlog was not bulk rewritten. Collection Monitor presentation changes were already delivered.

[Single checklist](promotion-checklist.md) · [Manifest](release-manifest.json) · [Production app checks](production-verification.json) · [SQL verification](database-verification.json) · [Dictionary closure](dictionary-promotion.json).

OLTP upgraded from frozen PROD-mapped RC1.000007 into the existing production app. Both editors are clear and Deployed; load/sync, logo, production bindings, API Enable, canonical schedule guard and representative bilingual screens passed. The full DEV behavior/concurrency tests were reused; no PROD financial test or forced notification was run. API credentials were not changed or separately probed.

Rollback: OLTP3.000246 remains the prior restorable version. Cloud SQL backup1790354541920 completed successfully before V45. App restoration does not undo SQL; prefer an approved higher migration, or reconcile later writes before database restore. The temporary RC definition was deleted after verification; all four canonical apps and shared data/files remain.

SQL pin:4a848fa15bb80b5ccf2fa1ce98f5fa417b89a24c. Final Git publication uses unique tag `R036`; R037 is the sole Open development release.
