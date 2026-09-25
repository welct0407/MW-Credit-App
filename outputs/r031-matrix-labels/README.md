# R031 — quieter matrix labels

User requested subtle grey category icons, names above/below dots with no long lines, and equal-size dots. This changes only three static chart files; SQL, API, authentication, Metabase configuration and Apps remain unchanged. Four equal quadrants and exact SQL coordinates are preserved. Category totals move outside the plot. Names use nearby above/below candidates with bounded small horizontal shifts to reduce collisions; dense/coincident points may still need search/tooltip.

Rollback: restore the three R030 static files from the private VM backup or Git tag R030; restart only mw-report-charts.

Status: candidate verification in progress.
