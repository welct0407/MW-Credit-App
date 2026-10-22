/* Dashboard 4 · Infrastructure (mw-infra): capacity against documented limits, last 24 hours. */
'use strict';
const L = require('./lib.cjs');
const {DS, COLOR, col, target, pos, byName, AGE, steps, valueMap, monitoringUrl, customFilter, jq} = L;

// Lifted chart with only its threshold line replaced by the documented limit or alert value (INFRA-1).
function liftWithLine(id, newId, gridPos, title, line, extraSteps = []) {
  const p = L.lift(L.PERF, id, {id: newId, gridPos, title});
  const d = p.fieldConfig.defaults;
  d.custom = {...d.custom, thresholdsStyle: {mode: 'dashed'}};
  d.thresholds = steps([null, 'transparent'], ...(line == null ? [] : [[line, 'red']]), ...extraSteps);
  return p;
}

function cloudSql() {
  const facts = [
    {Fact: 'Tier', Value: 'db-g1-small · 16 Oct'},
    {Fact: 'Storage', Value: 'SSD 10 GB, auto-grow · 17 Oct'},
    {Fact: 'Max connections', Value: '200 · 22 Sep'}
  ];
  const uptime = L.liftTarget(L.PERF, 129);
  const backupFields = [{key: 'age_seconds', label: 'Age'}, {key: 'status', label: 'Newest run'},
    {key: 'type', label: 'Type'}, {key: 'log_retention_days', label: 'PITR logs'}];
  const statFields = [{key: 'top1_share_percent', label: 'Share'}, {key: 'top1_calls_per_min', label: 'Calls / min'},
    {key: 'status', label: 'Read'}];
  const db = (refId, name) => target(refId, DS.gcp, monitoringUrl(L.sqlFilter('cloudsql.googleapis.com/database/postgresql/num_backends') +
    ' AND metric.labels.' + L.NUM_BACKENDS_DATABASE_LABEL + ' = "' + name + '"', {aligner: 'ALIGN_MEAN'}), L.numericSelector(),
    [col('time', 'Time', 'timestamp'), col('value', name)], {format: 'timeseries'});
  return [
    liftWithLine(31, 1, pos(0, 0, 6, 7), 'Cloud SQL CPU', 0.85),
    liftWithLine(32, 2, pos(6, 0, 6, 7), 'Cloud SQL memory', 85),
    liftWithLine(33, 3, pos(12, 0, 6, 7), 'Cloud SQL disk', 0.8),
    liftWithLine(34, 4, pos(18, 0, 6, 7), 'SQL connections', 160, [[200, COLOR.unknown]]),
    L.table({id: 5, title: 'Backups and restore points', gridPos: pos(0, 7, 7, 7),
      description: 'Debian collector worker_timing{cloud_sql_backup} from the SQL Admin API, read-only: Age of the newest successful automated backup (red above 30 h, the alert value), Newest run state, its Type and the transaction-log (PITR) retention in days.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'cloud_sql_backup'})), jq('ops-health.jq', {FIELDS: backupFields}),
        backupFields.map(f => col(f.label, f.label)))],
      overrides: [byName('Age', {unit: AGE.unit, decimals: AGE.decimals, 'custom.cellOptions': {type: 'color-background', mode: 'basic'},
          thresholds: steps([null, COLOR.ok], [108000, COLOR.down]), mappings: [L.nullMap('No report')]}),
        byName('Newest run', {mappings: valueMap([[0, 'Failed', COLOR.down], [1, 'Successful', COLOR.ok], [2, 'Running', COLOR.text]], 'No report'),
          'custom.cellOptions': {type: 'color-background', mode: 'basic'}}),
        byName('Type', {mappings: valueMap([[1, 'Automated', COLOR.text], [2, 'On demand', COLOR.text]], 'No report')}),
        byName('PITR logs', {unit: 'd', mappings: [L.nullMap('No report')]})]}),
    L.table({id: 6, title: 'Instance facts', gridPos: pos(7, 7, 6, 7),
      description: 'Configuration snapshots, dated (the only static text on this dashboard): tier db-g1-small since 16 Oct 2026; storage PD_SSD 10 GB with automatic increase since 17 Oct 2026; max_connections 200 (database flag) verified 22 Sep 2026. Plus PostgreSQL uptime from the collector\'s read-only reporting connection.',
      datasource: DS.mixed,
      targets: [L.inlineTarget('A', DS.gcp, facts, '.[]', [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]),
        {...uptime, refId: 'B', root_selector: '(' + uptime.root_selector + ') | {Fact: "PostgreSQL uptime", Value: (.UptimeText // "No report")}',
          columns: [col('Fact', 'Fact', 'string'), col('Value', 'Value', 'string')]}],
      transformations: [{id: 'merge', options: {}}],
      overrides: [byName('Fact', {'custom.width': 110})]}),
    L.timeseries({id: 7, title: 'Connections by DB', gridPos: pos(18, 7, 6, 7),
      description: 'Cloud SQL num_backends per database (metric label ' + L.NUM_BACKENDS_DATABASE_LABEL + '); explains who holds connections. No threshold.',
      targets: [db('A', 'loan_manager_prod'), db('B', 'mw_agent'), db('C', 'loan_manager_dev')],
      defaults: {min: 0}}),
    L.table({id: 8, title: 'Top statement', gridPos: pos(13, 7, 5, 7),
      description: 'Debian collector worker_timing{pg_stat}: Share of total execution time and Calls / min of the heaviest statement in monitoring.pg_stat_statements; Read = whether the collector may read the view. The statement text stays in the collector\'s local log.',
      targets: [target('A', DS.gcp, monitoringUrl(customFilter('worker_timing', {component: 'pg_stat'})), jq('ops-health.jq', {FIELDS: statFields}),
        statFields.map(f => col(f.label, f.label)))],
      overrides: [byName('Share', {unit: 'percent', mappings: [L.nullMap('No report')]}),
        byName('Read', {mappings: valueMap([[0, 'Not granted', COLOR.unknown], [1, 'Read', COLOR.ok]], 'No report')})]})
  ];
}

const RUN_SERVICES = ['read', 'command', 'notify', 'jobs'].flatMap(s => ['prod', 'dev'].map(e => 'mw-credit-app-' + s + '-' + e));
// From infrastructure/production/runtime.tf, infrastructure/dev/*-service.tf and modules/workers.
const MAX_INSTANCES = {'read-prod': 1, 'command-prod': 2, 'notify-prod': 1, 'jobs-prod': 1, 'read-dev': 2, 'command-dev': 2, 'notify-dev': 1, 'jobs-dev': 1};
function cloudRun() {
  const filter = metric => 'metric.type = "' + metric + '" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = one_of(' +
    RUN_SERVICES.map(s => '"' + s + '"').join(',') + ')';
  const q = (refId, metric, column, mode, aggregation) => target(refId, DS.gcp,
    monitoringUrl(filter(metric), {...aggregation, groupBy: ['resource.labels.service_name']}),
    jq('cloudrun-by-service.jq', {COLUMN: column, MODE: mode}), [col('Service', 'Service', 'string'), col(column, column)]);
  // FINAL-3: coloured text, not a coloured cell, so the number stays readable on a phone.
  const util = {unit: 'percentunit', decimals: 0, 'custom.cellOptions': {type: 'color-text'},
    thresholds: steps([null, COLOR.ok], [0.8, COLOR.degraded]), mappings: [L.nullMap('—')]};
  return L.table({id: 9, title: 'Cloud Run · eight services', gridPos: pos(0, 14, 24, 11),
    description: 'Cloud Monitoring per service of mw-credit-app-<service>-<env>: newest instance count against Max instances (Terraform), CPU and memory utilisation p95 over the newest 15 minutes (orange above 80 %) and billable instance time over the range.',
    datasource: DS.gcp,
    targets: [
      L.inlineTarget('A', DS.gcp, Object.entries(MAX_INSTANCES).map(([Service, max]) => ({Service, Max: max})), '.[]',
        [col('Service', 'Service', 'string'), col('Max', 'Max')]),
      q('B', 'run.googleapis.com/container/instance_count', 'Instances', 'last', {aligner: 'ALIGN_MAX', reducer: 'REDUCE_SUM', period: '300s'}),
      q('C', 'run.googleapis.com/container/cpu/utilizations', 'CPU p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('D', 'run.googleapis.com/container/memory/utilizations', 'Memory p95', 'last', {aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', period: '900s'}),
      q('E', 'run.googleapis.com/container/billable_instance_time', 'Billable time', 'sum', {aligner: 'ALIGN_SUM', reducer: 'REDUCE_SUM', period: '3600s'})
    ],
    transformations: [{id: 'joinByField', options: {byField: 'Service', mode: 'outerTabular'}},
      {id: 'organize', options: {indexByName: {Service: 0, Instances: 1, Max: 2, 'CPU p95': 3, 'Memory p95': 4, 'Billable time': 5}}}],
    overrides: [byName('CPU p95', util), byName('Memory p95', util), byName('Billable time', {unit: 's', decimals: 0, mappings: [L.nullMap('—')]}),
      byName('Instances', {mappings: [L.nullMap('0 seen')], 'custom.width': 80}), byName('Max', {'custom.width': 50}),
      // RECHECK-9/FINAL-3: service names without the common prefix ("command · prod"), so every column fits on a phone.
      byName('Service', {'custom.width': 110, mappings: [{type: 'regex', options: {pattern: '^mw-credit-app-(.+)-(prod|dev)$', result: {text: '$1 · $2', index: 0}}}]})]});
}

function debian() {
  const uptime = L.lift(L.PERF, 128, {id: 18, gridPos: pos(18, 29, 6, 3), title: 'Debian VM uptime'});
  // LIVE-3: an informational value, not Paused blue.
  uptime.fieldConfig.defaults.color = {mode: 'fixed', fixedColor: COLOR.text};
  // One value: the title names it (no "Uptime" under it), at the one-value tile size.
  uptime.options = {...uptime.options, ...L.SINGLE_VALUE};
  const disk = L.lift(L.PERF, 24, {id: 13, gridPos: pos(18, 25, 6, 4), title: 'Debian VM disk'});
  disk.description = (disk.description || '').trim() + ' Snapshot age: Backups and recovery points on Now.';
  return [
    L.lift(L.PERF, 21, {id: 10, gridPos: pos(0, 25, 6, 7), title: 'Debian VM CPU'}),
    liftWithLine(22, 11, pos(6, 25, 6, 7), 'Debian VM memory', 85),
    L.lift(L.PERF, 23, {id: 12, gridPos: pos(12, 25, 6, 7), title: 'Debian VM network'}),
    disk, uptime
  ];
}

// First line of a probe's details plus its HTTP code, probe duration, archive lag or snapshot age.
const ONE_LINE = '(split("\\n") as $l | [$l[0], ($l[] | (capture("^HTTP: (?<v>.+)$") | "HTTP " + .v), ' +
  '(capture("^Probe duration: (?<v>.+)$") | .v), (capture("^Archive lag: (?<v>.+)$") | "lag " + .v), ' +
  '(capture("^Snapshot age: (?<v>.+?)[.]?$") | .v + " old"))] | join(" · "))';
function metabase() {
  // RECHECK-8: today's selectors unchanged, their multi-line details folded to one line (state, HTTP code and
  // duration, archive lag or snapshot age); the static explanation of each row is in the description.
  const probes = [80, 81, 82, 83, 84, 85, 86].map((id, i) => {
    const t = L.liftTarget(L.PERF, id);
    return {...t, refId: String.fromCharCode(65 + i), root_selector: '(' + t.root_selector + ') | .details |= ' + ONE_LINE};
  });
  const mem = L.lift(L.PERF, 42, {id: 15, gridPos: pos(6, 32, 6, 10), title: 'Metabase RAM'});
  mem.description = (mem.description || '').trim() + ' The alert fires at 90 % of the limit.';
  return [
    L.lift(L.PERF, 41, {id: 14, gridPos: pos(0, 32, 6, 10), title: 'Metabase CPU'}),
    mem,
    L.lift(L.PERF, 43, {id: 16, gridPos: pos(12, 32, 6, 10), title: 'Postgres volume'}),
    L.table({id: 17, title: 'Metabase probes', gridPos: pos(18, 32, 6, 10),
      description: 'Today\'s Metabase probe, backup and PITR selectors (Debian collector about every 2 minutes, and the Railway API), one row each: Platform = /livez on reports.mw-credit.com; App DB = /readyz including the application database; Reporting DB = an uncached saved SELECT 1 through source 2; Charts = charts.mw-credit.com shell and protected API; Daily and Weekly backup = the newest scheduled Railway volume snapshot (Degraded past 30 h or 8 days, a listed snapshot is not a tested restore); PITR archive = pgBackRest coverage and WAL archive lag. Details shows the state, HTTP code and probe duration, the archive lag or the snapshot age. Degraded = slower than 5 s.',
      datasource: DS.mixed, targets: probes,
      transformations: [{id: 'merge', options: {}}, {id: 'organize', options: {indexByName: {Status: 0, Details: 1}}}],
      overrides: [byName('Status', {mappings: L.stateMappings(), 'custom.cellOptions': {type: 'color-background', mode: 'basic'}, 'custom.width': 90, 'custom.minWidth': 90}),
        byName('Details', {'custom.cellOptions': {type: 'auto', wrapText: false}})]})
  ];
}

function azure() {
  return L.row({id: 20, title: 'Azure VM-01 · on-demand operator host (no 24x7 expectation, no alert)', gridPos: pos(0, 42, 24, 1), collapsed: true,
    panels: [[11, 21, 0, 43], [12, 22, 12, 43], [13, 23, 0, 50], [14, 24, 12, 50]].map(([old, id, x, y]) =>
      L.lift(L.PERF, old, {id, gridPos: pos(x, y, 12, 7), title: 'VM-01 · ' + L.findPanel(L.PERF, old).title}))});
}

function build() {
  return L.dashboard({uid: 'mw-infra', description: 'Capacity and limits: Cloud SQL, Cloud Run, the Debian VM, Metabase on Railway and the on-demand Azure VM-01.',
    time: {from: 'now-24h', to: 'now'}, refresh: '5m',
    panels: [...cloudSql(), cloudRun(), ...debian(), ...metabase(), azure()]});
}
module.exports = {build, MAX_INSTANCES};
