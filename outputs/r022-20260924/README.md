# R022 — Selective Performance trend labels

Owner requested some value labels on the Performance trend group. Apply graph.show_values=true and graph.label_value_frequency=fit (Metabase Display → Values to show → Some) to questions 222,230,223,224,225,232,233,226. Existing series, axes, query, filters, layout and calculations remain unchanged. Label density is automatically chosen to fit; short/sparse series may still show every value.

Verified the setting using the installed chart editor without saving its preview. Reference: https://www.metabase.com/docs/latest/questions/visualizations/line-bar-and-area-charts

Rollback: restore only visualization_settings from private before-images C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r022-labels/card-<id>.json; dashboard.json records baseline. Preserve subsequent edits. No DB/AppSheet/source/permission change.

Exact settings: plan.json. Maintained publisher scripts/metabase/PerformanceTrendLabels.mjs. Publication verification pending.
