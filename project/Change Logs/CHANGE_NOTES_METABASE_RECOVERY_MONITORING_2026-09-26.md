# Metabase recovery monitoring — 26 September 2026

## Scope and purpose

Expanded the Performance dashboard's Metabase group from four live-service lights to seven lights: four **Metabase · Live** and three **Metabase · Recovery** (Daily backup, Weekly backup, PITR archive). This monitors the configured Railway backup schedules and live archive state without claiming a restore has been verified. No application database, workload schedule or business workflow changed. Starting Git commit: `1622407`.

## Changed objects

- Grafana Performance dashboard `mw-resource-performance`: panels 74–75 and 80–86, with the seven Metabase tiles in equal-width slots. Daily/Weekly query Railway's schedule and completed backup lists; a manual snapshot cannot satisfy a scheduled backup. PITR reads GCP custom telemetry exported by Debian. Each new tile has a detailed hover and Railway link. Dashboard remains in folder `mw-resource-monitoring` with Singapore timezone.
- Existing Grafana alert `ffzb4act1o0zka` now includes PITR alongside the four live checks. New Grafana alert `mw-metabase-backup-health` evaluates the two scheduled backups separately. Both use the established Performance 2m / four-minute pending / MW Performance IRM route. Query and rule readback showed healthy evaluation.
- Debian `/opt/mw-resource-monitoring/metabase_probes.py` imports `metabase_pitr.py`; the existing two-minute collector sends numeric PITR state to `custom.googleapis.com/mw_resource_monitoring/metabase_probe`. The new module runs the official Railway CLI `postgres pitr status` read-only through a dedicated project-scoped token and workspace SSH key. Private credentials are outside Git.
- Maintained definitions/scripts: `scripts/monitoring/Update-MetabasePanels.ps1`, `metabase_probes.py`, `metabase_pitr.py`, `metabase-alert.jq`, `metabase-backup.jq`, `metabase-backup-alert.jq`, `metabase-pitr.jq`, the two saved Performance JSON definitions and `metabase-alert-query.json`. Updated the visual guide, operating reference and monitoring README.

## State meanings and checks

- Daily: green within 30 hours of the latest scheduled snapshot; amber through 36 hours; red thereafter. Weekly: green within 8 days; amber through 9 days; red thereafter. A missing schedule is red. Before the first scheduled snapshot, each is Unknown for its first green window, then red. Railway API failure is Unknown in the panel; the alert rule retains its previous state on evaluation error.
- PITR: green requires PITR/bucket enabled, a backup set and WAL coverage, a healthy live archiver and an archived WAL within 30 minutes. Amber is 30–60 minutes; older or explicitly unhealthy archive is red. Missing access/probe/coverage is Unknown. Grafana treats telemetry older than six minutes as Unknown. Neither a listed snapshot nor live PITR status proves a restore succeeds.
- Railway listed one manual snapshot and two schedules created on 26 September; there had been no completed scheduled snapshot at activation. Thus the Daily/Weekly tiles correctly showed Unknown pending their first run. A live Debian PITR probe reported one backup set and a recent healthy WAL archive; GCP Monitoring received fresh status `1`. Grafana panel queries returned `4`, `4`, `1` respectively, and browser readback showed matching lights and hover details. Both Metabase alert rules reported `health: ok`, `state: inactive`; the component rule returned five stable zero-impairment rows and the backup rule returned two. Existing probe and collector unit suites passed (5 and 15 tests), as did synthetic PITR threshold checks. No live failure/push alert was induced.

## Rollback and limits

The private resource-monitoring recovery directory retains `performance-live-before-recovery-20260926.json` and `metabase-alert-before-recovery-20260926.json`. Restore the dashboard from that export while preserving folder `mw-resource-monitoring`; restore the prior Metabase rule, delete only the new backup rule, and restore Debian `metabase_probes.before-recovery-20260926.py` while removing the PITR module. If the PITR monitor is retired, revoke the dedicated Railway project token and workspace SSH key and remove their private Debian files. Keep existing live-service monitoring and the application databases intact. The Railway SSH key is workspace-wide by Railway design; the API token is limited to the Metabase project.

Status: implemented and live; first scheduled Daily/Weekly snapshots and their subsequent green transitions remain to be observed after the respective schedule runs. A restore drill remains outside this request.
