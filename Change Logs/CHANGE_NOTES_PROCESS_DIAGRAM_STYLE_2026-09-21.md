# Process diagram style — 21 September 2026

Owner requested the MW-Partner-Operations BUSINESS_PROCESS style. The supplied D: path is unavailable on this machine; the existing reference is at C:\GitHub\MW-Partner-Operations\docs\BUSINESS_PROCESS.drawio, with its maintained generator in scripts/generate-business-process.py.

Starting rollback commit: `40ee131ce0cbc9a86228a8c8838111cd8f42dbf9`; working tree was clean. Restore the affected diagram, generator and previews from this commit to undo this presentation change.

Updated the Integration Agent generator and all 14 diagram pages to use the reference palette, rounded blue process nodes, yellow decision diamonds, labeled orthogonal branches, red stop paths and grey notes. Preserved the linked overview, service coverage, script references and explicit current/pending/disabled status. No runtime, configuration, financial record or notification was changed.

Verification: generator checks unique IDs, resolved edges and page bounds. All 14 pages are exported to PNG; the overview, receipt flow and delivery flow are visually checked before publication. No runtime test or deployment is required for this diagram-only change.
