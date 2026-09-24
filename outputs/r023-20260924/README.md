# R023 — Replace original Performance with 6R

Owner accepted the replacement and explicitly authorized dropping old tab 6. Dashboard 3: remove tab7 and its 18 placements; rename existing tab18 from 6R · Performance to 6 · Performance and move into sixth position. All other tabs retain order/names. Remove performance-date dashboard parameter, verified unused outside deleted tab. Retain existing Performance period filter and all current question definitions, calculations, visuals and placement settings.

Old saved questions are retained: tab removal does not require deleting shared assets. Question56 also appears on another dashboard3 tab. No database/AppSheet/source/permission changes. This accepts Performance replacement only; wider R016 closure remains separate.

Private rollback: C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r023-performance/dashboard.json. Restore old tab using a new tab ID if API cannot restore deleted ID, remap its captured placements, restore old parameter and original name/order of tab18. Preserve subsequent changes. No saved question needs recreation.

Exact plan in plan.json; scripts/metabase/PromotePerformanceTab.mjs owns guarded publication/readback. Final expected state: 11 tabs, 189 placements. Verification pending.

## Completion

Four installed checks passed: exact tab order/identity, all remaining placements/question definitions preserved, only unused old filter removed, and former questions remain available. Chrome confirms one canonical Performance tab in sixth position and working metrics/filter. Dictionary tabs/parameters/status updated and validated. Current core records/design updated; no resource-monitoring guide impact. Released R023; R024 Open. No remaining manual checks for this tab replacement.
