# R031 — quieter matrix labels

User requested subtle grey category icons, names above/below dots with no long lines, and equal-size dots. This changes only three static chart files; SQL, API, authentication, Metabase configuration and Apps remain unchanged. Four equal quadrants and exact SQL coordinates are preserved. Category totals move outside the plot. Names use nearby above/below candidates with bounded small horizontal shifts to reduce collisions; dense/coincident points may still need search/tooltip.

Rollback: restore the three R030 static files from the private VM backup or Git tag R030; restart only mw-report-charts.

Status: deployed and verified. Desktop and mobile both showed23 names, four grey icons, no leader lines and no overlapping name labels in the current dataset. Dot radius remains5.5. Large-name/single-category tooltip retained. Original native chart, SQL, API, credentials and Apps unchanged. Dense future datasets can still require search/tooltip; no point jitter is introduced.

[Verification](verification.json), [manifest](release-manifest.json), [single checklist](promotion-checklist.md). Published under tag R031; R032 remains Open.
